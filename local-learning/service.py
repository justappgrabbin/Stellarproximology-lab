"""Loopback-only local training, model shop, experiment lab, and approval studio."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid
import zipfile

from model_registry import list_model_designs
from train_local import write_json, generate_baseline, generate_trident

ROOT = Path(__file__).resolve().parents[1]
TOKEN = secrets.token_urlsafe(32)


def now(): return datetime.now(timezone.utc).isoformat()
def new_id(): return uuid.uuid4().hex


def training_spec(payload):
    engine = payload.get('engine', 'byte-ngram')
    if engine not in {'byte-ngram', 'trident'}: raise ValueError('Choose byte-ngram or trident.')
    text = payload.get('text', '')
    if not isinstance(text, str) or not 200 <= len(text.encode()) <= 200000:
        raise ValueError('Training text must be 200–200,000 UTF-8 bytes.')
    name = payload.get('name', 'My local model')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80: raise ValueError('Enter a name of 1–80 characters.')
    epochs = payload.get('epochs', 2)
    if type(epochs) is not int or not 1 <= epochs <= 10: raise ValueError('Epochs must be an integer from 1 to 10.')
    order = payload.get('order', 2)
    if type(order) is not int or not 1 <= order <= 3: raise ValueError('Baseline order must be 1–3.')
    head = payload.get('head', 'research')
    if head not in {'code','math','research'}: raise ValueError('Choose a Code, Math, or Research head.')
    return {'engine': engine, 'text': text, 'name': name.strip(), 'epochs': epochs, 'head': head, 'order': order}


def approved(payload):
    if payload.get('approved') is not True: raise PermissionError('Explicit approval is required.')


class Workspace:
    def __init__(self, directory):
        self.directory = Path(directory).resolve(); self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock(); self.processes = {}; self.stop_event = threading.Event()
        path = self.directory / 'workspace.json'
        self.state = json.loads(path.read_text()) if path.exists() else {'models': [], 'jobs': [], 'plans': [], 'releases': [], 'selected': None}
        # Recover interrupted runs honestly. No unbounded hidden restart.
        for job in self.state['jobs']:
            if job['status'] in {'queued','running'}: job.update(status='interrupted', error='Service restarted. Start a fresh run.')
        for plan in self.state['plans']:
            if plan['status'] == 'active': plan['status'] = 'paused'
        self.save()

    def save(self): write_json(self.directory / 'workspace.json', self.state)

    def path(self, identifier):
        if not re.fullmatch('[0-9a-f]{32}', identifier): raise ValueError('Invalid identifier.')
        return self.directory / identifier

    def get(self, collection, identifier):
        self.path(identifier)
        item = next((x for x in self.state[collection] if x['id'] == identifier), None)
        if item is None: raise ValueError('Item not found.')
        return item

    def list_models(self):
        return {'local': self.state['models'], 'selected': self.state['selected'],
                'catalog': [{**m, 'availability': 'Reference only; not installed or verified'} for m in list_model_designs()]}

    def start(self, payload, plan=None):
        spec = training_spec(payload); approved(payload)
        if spec['engine'] == 'trident' and importlib.util.find_spec('torch') is None:
            raise ValueError('TRIDENT requires PyTorch. Install local-learning/requirements.txt first, or use the dependency-free trainer.')
        with self.lock:
            self.refresh()
            if any(j['status'] in {'queued','running'} for j in self.state['jobs']): raise ValueError('A training run is already active. Cancel it or wait for completion.')
            identifier = new_id(); folder = self.path(identifier); folder.mkdir()
            (folder / 'corpus.txt').write_text(spec['text'])
            config = {**spec, 'corpus': str(folder/'corpus.txt'), 'output': str(folder/'model'), 'progress': str(folder/'progress.json')}
            del config['text']; write_json(folder / 'run.json', config)
            job = {'id': identifier, 'name': spec['name'], 'engine': spec['engine'], 'head': spec['head'],
                   'epochs': spec['epochs'], 'order': spec['order'], 'status': 'running', 'created': now(), 'plan': plan,
                   'corpus_sha256': hashlib.sha256(spec['text'].encode()).hexdigest()}
            # No shell, downloaded script, or arbitrary user command.
            log = open(folder/'worker.log', 'w')
            try:
                process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('train_local.py')), str(folder/'run.json')],
                                           stdout=log, stderr=log, cwd=str(folder))
            finally: log.close()
            self.processes[identifier] = process; self.state['jobs'].append(job); self.save()
            return dict(job)

    def refresh(self):
        with self.lock:
            changed = False
            for job in self.state['jobs']:
                if job['status'] not in {'running','queued'}: continue
                folder = self.path(job['id']); process = self.processes.get(job['id'])
                progress_path = folder/'progress.json'
                if progress_path.exists():
                    try: progress = json.loads(progress_path.read_text())
                    except (ValueError, OSError): progress = {}
                    job['progress'] = progress
                if process is None or process.poll() is None: continue
                progress = job.get('progress', {})
                status = 'completed' if process.returncode == 0 and progress.get('status') == 'completed' else 'failed'
                job.update(status=status, finished=now()); changed = True
                if status == 'failed': job['error'] = progress.get('error', 'Worker failed; inspect its local log.')
                else:
                    metrics = {key: progress[key] for key in ['training_loss','evaluation_loss','parameters'] if key in progress}
                    model = {'id': job['id'], 'name': job['name'], 'engine': job['engine'], 'head': job['head'],
                             'created': now(), 'metrics': metrics, 'order': job['order'], 'epochs': job['epochs'], 'corpus_sha256': job['corpus_sha256'],
                             'quality': 'Experimental; not a validated assistant'}
                    self.state['models'].append(model)
                # Training material remains local; it is not included in release bundles.
            if changed: self.save()

    def cancel(self, identifier):
        with self.lock:
            job = self.get('jobs', identifier); process = self.processes.get(identifier)
            if job['status'] != 'running': raise ValueError('This job is not running.')
            if process and process.poll() is None:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
            job.update(status='cancelled', finished=now()); self.save(); return dict(job)

    def plan(self, payload):
        spec = training_spec(payload); approved(payload)
        runs = payload.get('runs', 3); interval = payload.get('interval_seconds', 60)
        if type(runs) is not int or not 1 <= runs <= 5: raise ValueError('Auto Lab permits 1–5 runs per approved plan.')
        if type(interval) is not int or not 60 <= interval <= 86400: raise ValueError('Interval must be 60–86,400 seconds.')
        if spec['engine'] == 'trident' and importlib.util.find_spec('torch') is None: raise ValueError('Install PyTorch before scheduling TRIDENT.')
        with self.lock:
            identifier = new_id(); folder = self.path(identifier); folder.mkdir()
            write_json(folder/'plan-spec.json', spec)
            digest = hashlib.sha256(json.dumps({**spec,'runs':runs,'interval_seconds':interval},sort_keys=True).encode()).hexdigest()
            record = {'id':identifier,'name':spec['name'],'engine':spec['engine'],'runs':runs,'started':0,'interval_seconds':interval,
                      'status':'active','approved_digest':digest,'created':now(),'next_run':time.time()}
            self.state['plans'].append(record); self.save(); return dict(record)

    def tick(self):
        with self.lock:
            self.refresh()
            if any(j['status']=='running' for j in self.state['jobs']): return
            for plan in self.state['plans']:
                if plan['status']!='active' or plan['next_run']>time.time(): continue
                if plan['started']>=plan['runs']: plan['status']='completed'; self.save(); continue
                spec=json.loads((self.path(plan['id'])/'plan-spec.json').read_text())
                try:
                    trial = dict(spec)
                    if trial['engine'] == 'byte-ngram': trial['order'] = 1 + plan['started'] % 3
                    else: trial['epochs'] = min(10, spec['epochs'] + plan['started'])
                    self.start({**trial,'name':spec['name']+f" · run {plan['started']+1}",'approved':True},plan=plan['id'])
                    plan['started']+=1; plan['next_run']=time.time()+plan['interval_seconds']; self.save()
                except Exception as error:
                    plan.update(status='failed',error=str(error)); self.save()
                break

    def pause_plan(self, identifier):
        with self.lock:
            plan=self.get('plans',identifier); plan['status']='paused'; self.save(); return dict(plan)

    def generate(self, identifier, payload):
        model=self.get('models',identifier)
        prompt=payload.get('prompt',''); amount=payload.get('max_new',80)
        if not isinstance(prompt,str) or not 1<=len(prompt)<=4000: raise ValueError('Prompt must be 1–4,000 characters.')
        if type(amount) is not int or not 1<=amount<=128: raise ValueError('Generation permits 1–128 new bytes.')
        if any(j['status']=='running' for j in self.state['jobs']): raise ValueError('Wait for training to finish before model testing.')
        folder=self.path(identifier)/'model'
        if model['engine']=='byte-ngram': result=generate_baseline(json.loads((folder/'baseline.json').read_text()),prompt,amount)
        else: result=generate_trident(folder,prompt,amount)
        return {'text':result,'model':model['name'],'quality':model['quality']}

    def select(self, identifier):
        with self.lock:
            model=self.get('models',identifier); self.state['selected']=identifier; self.save(); return dict(model)

    def bundle(self, identifier):
        model=self.get('models',identifier); folder=self.path(identifier)/'model'
        report=f"# {model['name']}\n\nEngine: {model['engine']}\nHead: {model['head']}\n\n{model['quality']}\n\n## Evaluation\n```json\n{json.dumps(model['metrics'],indent=2)}\n```\n\nTraining and held-out losses are recorded on separate non-overlapping text windows. They do not establish factual accuracy or instruction-following ability.\n\nTraining data, birth details, reflections, credentials, and worker logs are excluded. Model weights can still memorize training material; review the corpus before publishing.\n"
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('README.md',report)
            archive.writestr('index.html','<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html.escape(model['name'])+'</title><main style="max-width:800px;margin:4em auto;font:18px system-ui;padding:20px"><h1>'+html.escape(model['name'])+'</h1><pre style="white-space:pre-wrap">'+html.escape(report)+'</pre></main>')
            archive.writestr('model-card.json',json.dumps(model,indent=2))
            for file in sorted(folder.iterdir()):
                if file.is_file() and file.name in {'baseline.json','config.json','trident.pt'}: archive.write(file,file.name)
            if model['engine']=='trident': archive.write(Path(__file__).with_name('trident_model.py'),'trident_model.py')
        return data.getvalue()

    def stage_release(self, payload):
        identifier=payload.get('model'); self.get('models',identifier)
        target=payload.get('target','download'); repo=payload.get('repo','')
        if target not in {'download','huggingface','github','github-pages'}: raise ValueError('Choose download, GitHub, or Hugging Face.')
        if target in {'github','github-pages','huggingface'} and not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+',repo): raise ValueError('Enter a Hugging Face owner/model repository.')
        data=self.bundle(identifier); release_id=new_id(); folder=self.path(release_id); folder.mkdir()
        (folder/'release.zip').write_bytes(data)
        record={'id':release_id,'model':identifier,'target':target,'repo':repo,'private':target not in {'github','github-pages'},
                'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'status':'prepared','created':now()}
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            record['included_files']=archive.namelist()
            record['report']=archive.read('README.md').decode()
        self.state['releases'].append(record); self.save(); return dict(record)

    def publish(self, identifier, payload):
        approved(payload)
        with self.lock:
            release=self.get('releases',identifier)
            if release['status']!='prepared': raise ValueError('Release has already been used; prepare a fresh review.')
            data=(self.path(identifier)/'release.zip').read_bytes()
            if payload.get('sha256')!=release['sha256'] or hashlib.sha256(data).hexdigest()!=release['sha256']:
                raise ValueError('Approval does not match the exact prepared bundle.')
            if release['target']=='download':
                release.update(status='approved',approved_at=now()); self.save(); return dict(release)
            if release['target'] in {'github','github-pages'}:
                token=os.getenv('GH_TOKEN','').strip()
                if not token: raise ValueError('Set GH_TOKEN on the local service with access to the destination repository.')
                def call(url, body, content_type='application/json', method='POST'):
                    request=Request(url,data=body,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':content_type,'X-GitHub-Api-Version':'2022-11-28'})
                    with urlopen(request,timeout=60) as response:
                        raw=response.read(); return json.loads(raw) if raw else {}
                base='https://api.github.com/repos/'+release['repo']
                draft=call(base+'/releases',json.dumps({'tag_name':'local-model-'+identifier,'name':'Reviewed local model '+identifier[:8],'body':release['report'],'draft':True}).encode())
                release.update(status='publishing',url=draft['html_url'],approved_at=now()); self.save()
                try:
                    upload=draft['upload_url'].split('{')[0]+'?name=synthia-model-release.zip'
                    if not upload.startswith('https://uploads.github.com/'): raise ValueError('Unexpected GitHub upload destination.')
                    call(upload,data,'application/zip')
                    published=call(base+'/releases/'+str(draft['id']),json.dumps({'draft':False}).encode(),method='PATCH')
                    release.update(status='published',url=published['html_url']); self.save()
                    if release['target']=='github-pages':
                        call(base+'/actions/workflows/publish-project-page.yml/dispatches',json.dumps({'ref':'main','inputs':{'release_tag':'local-model-'+identifier,'bundle_sha256':release['sha256']}}).encode())
                        release['page_status']='GitHub Pages workflow requested; check its deployment result.'; self.save()
                    return dict(release)
                except Exception as error:
                    release.update(status='failed',error='Publishing stopped; inspect the draft release before preparing another bundle. '+str(error)); self.save(); raise
            token=os.getenv('HF_TOKEN','').strip()
            if not token: raise ValueError('Set HF_TOKEN on the local service. No token is accepted or stored by the browser.')
            # Optional official client. ZIP is our own staged bundle, never an uploaded executable.
            from huggingface_hub import HfApi, CommitOperationAdd
            api=HfApi(token=token)
            try:
                # Never overwrite an existing release/repository without a separately scoped review.
                api.create_repo(repo_id=release['repo'],repo_type='model',private=True,exist_ok=False)
                release.update(status='publishing',url='https://huggingface.co/'+release['repo']); self.save()
                operations=[]
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    for filename in archive.namelist():
                        operations.append(CommitOperationAdd(path_in_repo=filename,path_or_fileobj=archive.read(filename)))
                api.create_commit(repo_id=release['repo'],repo_type='model',operations=operations,
                                  commit_message='Personally approved local release '+release['sha256'])
                release.update(status='published',url='https://huggingface.co/'+release['repo'],approved_at=now())
                self.save(); return dict(release)
            except Exception:
                if release['status']=='publishing':
                    release.update(status='failed',error='Inspect the newly created repository before preparing another release.'); self.save()
                raise

    def close(self):
        self.stop_event.set()
        for job in list(self.state['jobs']):
            if job['status']=='running': self.cancel(job['id'])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'human-design/dist'),**kwargs)
    def log_message(self,*args): pass  # Never print birth data, corpus, tokens, or prompts.
    def secure(self, mutation=False):
        expected=f'127.0.0.1:{self.server.server_port}'
        if self.headers.get('Host') not in {expected,f'localhost:{self.server.server_port}'}: raise PermissionError('Only loopback hosts are accepted.')
        if mutation:
            origin=self.headers.get('Origin')
            if origin and origin not in {'http://'+expected,f'http://localhost:{self.server.server_port}'}: raise PermissionError('Cross-origin writes are rejected.')
            if self.headers.get('X-Local-Approval')!=TOKEN: raise PermissionError('Missing local session token.')
    def send_json(self,status,value):
        data=json.dumps(value,ensure_ascii=False).encode(); self.send_response(status)
        self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        try:
            self.secure(); self.server.workspace.refresh(); path=urlsplit(self.path).path; w=self.server.workspace
            if path=='/api/local/status': return self.send_json(200,{'local':True,'token':TOKEN,'torch':importlib.util.find_spec('torch') is not None,'active_model':w.state['selected']})
            if path=='/api/local/models': return self.send_json(200,w.list_models())
            if path=='/api/local/lab': return self.send_json(200,{'jobs':w.state['jobs'],'plans':w.state['plans'],'releases':w.state['releases']})
            match=re.fullmatch(r'/api/local/releases/([0-9a-f]{32})/download',path)
            if match:
                release=w.get('releases',match[1])
                if release['status'] not in {'approved','published'}: raise PermissionError('Approve the prepared release before downloading.')
                data=(w.path(match[1])/'release.zip').read_bytes(); self.send_response(200)
                self.send_header('Content-Type','application/zip'); self.send_header('Content-Disposition','attachment; filename="synthia-model-release.zip"')
                self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
            if path=='/corpus.json' and self.server.corpus_path:
                data=self.server.corpus_path.read_bytes(); self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data); return
            if path.startswith('/api/'): return self.send_json(404,{'error':'Endpoint not found.'})
            return super().do_GET()
        except PermissionError as error: self.send_json(403,{'error':str(error)})
        except Exception as error: self.send_json(400,{'error':str(error)})
    def do_POST(self):
        try:
            self.secure(mutation=True); length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=300000: raise ValueError('Request size is outside the supported range.')
            payload=json.loads(self.rfile.read(length)); path=urlsplit(self.path).path; w=self.server.workspace
            if path=='/api/local/train': result=w.start(payload)
            elif path=='/api/local/plans': result=w.plan(payload)
            elif path=='/api/local/releases': result=w.stage_release(payload)
            else:
                match=re.fullmatch(r'/api/local/(models|jobs|plans|releases)/([0-9a-f]{32})/(select|generate|cancel|pause|approve)',path)
                if not match: raise ValueError('Endpoint not found.')
                group,identifier,action=match.groups()
                if (group,action)==('models','select'): result=w.select(identifier)
                elif (group,action)==('models','generate'): result=w.generate(identifier,payload)
                elif (group,action)==('jobs','cancel'): result=w.cancel(identifier)
                elif (group,action)==('plans','pause'): result=w.pause_plan(identifier)
                elif (group,action)==('releases','approve'): result=w.publish(identifier,payload)
                else: raise ValueError('Unsupported action.')
            self.send_json(200,result)
        except PermissionError as error: self.send_json(403,{'error':str(error)})
        except Exception as error: self.send_json(400,{'error':str(error)})


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--data',default=str(Path(__file__).with_name('data'))); parser.add_argument('--corpus')
    args=parser.parse_args(); workspace=Workspace(args.data)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler); server.workspace=workspace
    server.corpus_path=Path(args.corpus).resolve() if args.corpus else None
    def schedule():
        while not workspace.stop_event.wait(2): workspace.tick()
    threading.Thread(target=schedule,daemon=True).start()
    print(f'Synthia local workspace: http://127.0.0.1:{args.port}\nTraining, Auto Lab, and Publishing Studio run only while this process is open.',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: workspace.close(); server.server_close()


if __name__=='__main__': main()
