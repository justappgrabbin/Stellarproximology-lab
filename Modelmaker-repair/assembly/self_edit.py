"""Reviewable self-edits with stale-file checks, validation and rollback."""
from __future__ import annotations
import ast
import difflib
import hashlib
import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from uuid import uuid4
from .runtime import ROOT
EDIT_LOCK=threading.RLock()
ALLOWED_ROOTS=('assembly/','computer/','tests/')
ALLOWED_FILES=('app.py','README.md','INSTALL.txt')

def resolve(root,name):
    root=Path(root).resolve();path=(root/name).resolve()
    if not path.is_relative_to(root):raise ValueError('Source must be inside this app')
    relative=path.relative_to(root).as_posix()
    if relative not in ALLOWED_FILES and not any(relative.startswith(p) for p in ALLOWED_ROOTS):
        raise ValueError('Choose app.py, documentation, assembly/, computer/, or tests/')
    if path.suffix not in ('.py','.mjs','.js','.html','.css','.md','.txt'):raise ValueError('Only editable source files are allowed')
    if not path.is_file():raise ValueError('Choose an existing source file')
    return path

def file_state(name,root=ROOT):
    path=resolve(root,name);text=path.read_text()
    if len(text)>100000:raise ValueError('Choose a source file under 100000 characters')
    return {'file':name,'text':text,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def propose(runtime,name,replacement,root=ROOT,expected_hash=None):
    if not isinstance(replacement,str) or not replacement.strip() or len(replacement)>100000:raise ValueError('Replacement must be nonempty and under 100000 characters')
    old=file_state(name,root)
    if expected_hash is not None and old['sha256']!=expected_hash:raise ValueError('Source changed; reload it before proposing the edit')
    if old['text']==replacement:raise ValueError('The proposal makes no change')
    item={'id':uuid4().hex,'file':name,'before_sha256':old['sha256'],'after':replacement,'status':'proposed',
        'diff':''.join(difflib.unified_diff(old['text'].splitlines(True),replacement.splitlines(True),fromfile=name,tofile=name))}
    runtime.setting('edit:'+item['id'],item);runtime.event('self-edit-proposal',{'id':item['id'],'file':name})
    return item

def generate(runtime,name,instruction,root=ROOT):
    state=file_state(name,root)
    if not runtime._ensure_model():raise ValueError('Load a model checkpoint before asking it to write code. You can also edit the source manually and preview its diff.')
    result=runtime.respond('Propose the requested source edit. Return ONLY a JSON object with one key "replacement" containing the complete replacement file.\nRequest: '+instruction+'\nFile: '+name+'\nCurrent source:\n'+state['text'])
    raw=result['answer'].strip()
    if raw.startswith('```'):raw='\n'.join(raw.splitlines()[1:-1])
    try:replacement=json.loads(raw)['replacement']
    except (json.JSONDecodeError,KeyError,TypeError) as exc:
        raise ValueError('The loaded model did not produce a valid code proposal. No files were changed. A coding-capable checkpoint is required for reliable self-editing.') from exc
    return propose(runtime,name,replacement,root,expected_hash=state['sha256'])

def apply(runtime,item_id,root=ROOT,run_tests=True):
    with EDIT_LOCK:
        item=runtime.setting('edit:'+item_id)
        if not item or item['status']!='proposed':raise ValueError('No pending proposal found')
        path=resolve(root,item['file']);old=path.read_bytes()
        if hashlib.sha256(old).hexdigest()!=item['before_sha256']:raise ValueError('File changed after the proposal; create a new diff')
        replacement=item['after']
        if path.suffix=='.py':ast.parse(replacement,filename=item['file'])
        if path.suffix in ('.js','.mjs'):
            checked=subprocess.run(['node','--check','--input-type=module'],input=replacement,text=True,capture_output=True,timeout=15)
            if checked.returncode:raise ValueError('JavaScript syntax check failed: '+checked.stderr[:1500])
        backup=runtime.directory/'self-edit-backups'/item_id;backup.mkdir(parents=True,exist_ok=True)
        (backup/'before').write_bytes(old);(backup/'proposal.json').write_text(json.dumps(item,indent=2))
        outcome={}
        try:
            path.write_text(replacement)
            if run_tests:
                # User-reviewed edits are verified by the project's existing checks.
                env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG','TMPDIR','SYSTEMROOT','VIRTUAL_ENV')}
                env['GRADIO_ANALYTICS_ENABLED']='False'
                checked=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-v'],cwd=root,env=env,capture_output=True,text=True,timeout=120)
                outcome={'passed':checked.returncode==0,'output':(checked.stdout+checked.stderr)[-18000:]}
                if checked.returncode:raise ValueError('Project checks failed; the previous file was restored')
            item['status']='applied';item['checks']=outcome
        except Exception as exc:
            path.write_bytes(old);item['status']='rolled-back';item['error']=str(exc);item['checks']=outcome
        runtime.setting('edit:'+item_id,item);runtime.event('self-edit-result',{'id':item_id,'file':item['file'],'status':item['status']})
        return {**item,'restart_needed':item['status']=='applied' and path.suffix=='.py',
            'note':'Refresh to load interface edits. Restart the private app after Python edits.'}
