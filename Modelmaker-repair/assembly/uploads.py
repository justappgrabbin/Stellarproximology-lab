"""Retain arbitrary uploads; inspect text and bounded project archives without execution."""
from __future__ import annotations
import hashlib
import json
import os
import shutil
import stat
import tarfile
from pathlib import Path,PurePosixPath
from uuid import uuid4
from zipfile import ZipFile,is_zipfile
from .intake import read_document
MAX_UPLOAD=128*1024*1024
MAX_EXPANDED=256*1024*1024
MAX_ENTRY=32*1024*1024
MAX_ENTRIES=1000
TEXT_EXTENSIONS={'.txt','.md','.json','.jsonl','.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.htm','.css','.scss','.csv','.xml','.yaml','.yml','.toml','.ini','.cfg','.sh','.bash','.sql','.rs','.go','.c','.h','.cpp','.java','.kt','.swift','.vue','.svelte','.ipynb','.rst','.log'}
ARCHIVE_EXTENSIONS={'.zip','.tar','.gz','.tgz','.bz2','.xz','.epub'}

def safe_member(name):
    if not name or '\\' in name or '\x00' in name:raise ValueError('Archive contains an unsafe path')
    path=PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or (path.parts and ':' in path.parts[0]):raise ValueError('Archive paths must stay inside the imported project')
    if not path.parts:raise ValueError('Archive contains an empty path')
    return path

def inspect_archive(path,destination):
    """Preflight every member before writing any extracted content."""
    entries=[];total=0;names=set()
    def validate(name,size,regular=True):
        nonlocal total
        relative=safe_member(name)
        if not regular:raise ValueError('Archive links and special files are not supported')
        canonical=str(relative)
        if canonical in names:raise ValueError('Archive contains duplicate paths')
        names.add(canonical)
        if size<0 or size>MAX_ENTRY:raise ValueError('An expanded archive entry exceeds the 32 MB limit')
        total+=size
        if total>MAX_EXPANDED or len(names)>MAX_ENTRIES:raise ValueError('Archive exceeds 256 MB expanded size or 1000 entries')
        return relative
    if is_zipfile(path):
        with ZipFile(path) as archive:
            if len(archive.infolist())>MAX_ENTRIES:raise ValueError('Archive exceeds 1000 entries')
            for member in archive.infolist():
                if member.is_dir():safe_member(member.filename);continue
                mode=member.external_attr>>16
                if member.flag_bits&1:raise ValueError('Encrypted ZIP files need to be decrypted before inspection')
                relative=validate(member.filename,member.file_size,stat.S_IFMT(mode) in (0,stat.S_IFREG))
                entries.append((member,relative))
            # Validate file-vs-directory conflicts before extraction too.
            for _,relative in entries:
                if any(str(parent) in names for parent in relative.parents if str(parent)!='.'):
                    raise ValueError('Archive has conflicting file and directory paths')
            for member,relative in entries:
                target=destination/str(relative);target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(member) as source,target.open('xb') as output:
                    copy_bounded(source,output,member.file_size)
    else:
        with tarfile.open(path,mode='r:*') as archive:
            for member in archive:
                if member.isdir():safe_member(member.name);continue
                relative=validate(member.name,member.size,member.isfile())
                entries.append((member,relative))
            for _,relative in entries:
                if any(str(parent) in names for parent in relative.parents if str(parent)!='.'):
                    raise ValueError('Archive has conflicting file and directory paths')
            for member,relative in entries:
                target=destination/str(relative);target.parent.mkdir(parents=True,exist_ok=True)
                with archive.extractfile(member) as source,target.open('xb') as output:copy_bounded(source,output,member.size)
    return [str(relative) for _,relative in entries]

def copy_bounded(source,output,expected):
    copied=0
    while True:
        chunk=source.read(min(1024*1024,expected-copied+1))
        if not chunk:break
        copied+=len(chunk)
        if copied>expected:raise ValueError('Expanded data exceeds its declared size')
        output.write(chunk)
    if copied!=expected:raise ValueError('Archive entry is truncated')

def text_content(path):
    if path.suffix.lower() in ('.pdf','.docx'):return read_document(path)
    if path.suffix.lower() in {'.png','.jpg','.jpeg','.gif','.webp','.mp3','.mp4','.wav','.ogg','.exe','.dll','.so','.bin','.safetensors','.onnx','.pt','.pth','.sqlite','.db','.7z','.rar','.iso','.woff','.woff2','.ttf'}:return None
    if path.stat().st_size>MAX_ENTRY:raise ValueError('Text file exceeds the 32 MB analysis limit')
    try:
        raw=path.read_bytes()
        if b'\x00' in raw:return None
        text=raw.decode('utf-8-sig')
        if sum(ord(c)<32 and c not in '\n\r\t\f' for c in text)>max(2,len(text)//100):return None
        return text
    except UnicodeDecodeError:return None

def store_upload(runtime,name,path):
    path=Path(path)
    if path.stat().st_size>MAX_UPLOAD:raise ValueError('Upload exceeds the 128 MB limit')
    name=Path(name.replace('\\','/')).name or 'upload.bin'
    if name in ('.','..'):name='upload.bin'
    upload_id=uuid4().hex
    root=runtime.directory/'uploads'/runtime.user/upload_id;root.mkdir(parents=True)
    raw=root/'original';raw.mkdir();original=raw/name;shutil.copyfile(path,original)
    receipt={'id':upload_id,'file':name,'bytes':original.stat().st_size,
        'sha256':hashlib.sha256(original.read_bytes()).hexdigest(),'ok':True,
        'status':'stored','entries':[],'analysis':'not-analyzed','project_path':None}
    archive=(is_zipfile(original) and original.suffix.lower()!='.docx') or original.suffix.lower() in ARCHIVE_EXTENSIONS
    candidates=[]
    if archive:
        project=runtime.directory/'computer-workspace'/runtime.user/'imports'/upload_id
        project.mkdir(parents=True)
        try:
            members=inspect_archive(original,project)
            candidates=[(member,project/member) for member in members]
            receipt['project_path']=str(project);receipt['status']='project-imported'
        except Exception as exc:
            shutil.rmtree(project,ignore_errors=True)
            receipt.update(status='stored-archive-not-expanded',analysis='unavailable',error=str(exc))
    else:candidates=[(name,original)]
    analyzed=0
    for relative,candidate in candidates:
        entry={'path':relative,'bytes':candidate.stat().st_size,'status':'stored'}
        # Retain all files, but do not index secrets, dependencies or nested archives.
        parts=PurePosixPath(relative).parts
        if any(part in ('.git','node_modules','.venv','__pycache__') or part=='.env' or part.startswith('.env.') for part in parts):
            entry.update(status='retained-not-indexed',reason='project metadata, dependency directory or environment file')
        elif candidate.suffix.lower() in ARCHIVE_EXTENSIONS:
            entry.update(status='retained-not-expanded',reason='nested archive')
        else:
            try:
                text=text_content(candidate)
                if text and text.strip():
                    source='uploaded:'+name+('!/'+relative if archive else '')
                    if analyzed<16:
                        result=runtime.study(text,title=relative,source=source);analyzed+=1
                        entry.update(status='studied',document_id=result['document_id'],passages_analyzed=result['passages_analyzed'],remaining_passages=result['remaining_passages'])
                        if not archive:receipt['receipt']=result
                    else:
                        registered,_=runtime.register(text,title=relative,source=source)
                        entry.update(status='indexed-awaiting-study',document_id=registered)
                else:entry.update(status='retained-binary',reason='No supported text representation; original bytes retained')
            except Exception as exc:entry.update(status='retained-analysis-unavailable',error=str(exc))
        receipt['entries'].append(entry)
    if candidates:receipt['analysis']='partial' if any(e['status']!='studied' or e.get('remaining_passages') for e in receipt['entries']) else 'studied'
    (root/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    runtime.event('upload',{'id':upload_id,'file':name,'status':receipt['status'],'analysis':receipt['analysis']})
    return receipt

def uploads(runtime):
    root=runtime.directory/'uploads'/runtime.user
    return [json.loads(p.read_text()) for p in sorted(root.glob('*/receipt.json'),key=lambda p:p.stat().st_mtime,reverse=True)][:100]
