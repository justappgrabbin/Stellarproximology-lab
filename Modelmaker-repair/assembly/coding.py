from __future__ import annotations
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import Request,urlopen

class CodingWorkspace:
    def __init__(self,root):self.root=Path(root).resolve();self.root.mkdir(parents=True,exist_ok=True)
    def path(self,name):
        result=(self.root/name).resolve()
        if not result.is_relative_to(self.root) or result==self.root:raise ValueError('File path must stay inside the coding workspace')
        if any(p in {'.git','.env','.modelmaker'} or p.startswith('.env.') for p in result.relative_to(self.root).parts):raise ValueError('Protected workspace path')
        return result
    def read(self,name):return self.path(name).read_text()
    def write(self,name,text):
        target=self.path(name);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text);return {'path':name,'bytes':target.stat().st_size}
    def run(self,name):
        target=self.path(name)
        command=[sys.executable,str(target)] if target.suffix=='.py' else ['node',str(target)] if target.suffix in {'.js','.mjs'} else None
        if not command:raise ValueError('Only explicit Python and JavaScript files are executable')
        import tempfile
        with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
            process=subprocess.Popen(command,cwd=self.root,stdout=out,stderr=err,start_new_session=True)
            timed_out=False
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                import signal
                os.killpg(process.pid,signal.SIGKILL);process.wait();timed_out=True
            out.seek(0);err.seek(0)
            return {'exit_code':process.returncode,'stdout':out.read(65536).decode(errors='replace'),'stderr':err.read(65536).decode(errors='replace'),
                'timed_out':timed_out,'execution_boundary':'local process, not an OS security sandbox'}

class GitHubWriter:
    def __init__(self,repository,transport=None):
        if not repository or repository.count('/')!=1:raise ValueError('Use owner/repository')
        self.repository=repository;self.transport=transport
    def request(self,method,path,body=None):
        if self.transport:return self.transport(method,path,body)
        token=os.environ.get('GITHUB_TOKEN','').strip()
        if not token:raise ValueError('GITHUB_TOKEN is not configured; no remote write performed')
        req=Request('https://api.github.com/repos/'+self.repository+path,method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json','User-Agent':'Modelmaker'})
        with urlopen(req,timeout=20) as response:return json.load(response)
    def draft_pr(self,branch,files,title,base='main'):
        import re
        if not re.fullmatch(r'modelmaker/[A-Za-z0-9._-]+',branch):raise ValueError('Use an isolated modelmaker/ branch')
        if not files:raise ValueError('Select files explicitly')
        for name in files:
            p=Path(name)
            if p.is_absolute() or '..' in p.parts or any(part.startswith('.env') or part in {'.git','.modelmaker'} for part in p.parts):raise ValueError('Protected publication path')
        head=self.request('GET','/git/ref/heads/'+base)['object']['sha']
        parent=self.request('GET','/git/commits/'+head)
        tree=self.request('POST','/git/trees',{'base_tree':parent['tree']['sha'],'tree':[{'path':p,'mode':'100644','type':'blob','content':text} for p,text in files.items()]})
        commit=self.request('POST','/git/commits',{'message':title,'tree':tree['sha'],'parents':[head]})
        self.request('POST','/git/refs',{'ref':'refs/heads/'+branch,'sha':commit['sha']})
        return self.request('POST','/pulls',{'title':title,'head':branch,'base':base,'draft':True,'body':'Explicitly selected Modelmaker workspace changes. Review before merge.'})
