"""Local model workspace; reuses computer backends without donor interfaces."""
from __future__ import annotations
import os
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException, UploadFile, File as Upload
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from pydantic import BaseModel, Field
from .runtime import Assembly, KleinBridge, ROOT
from .coding import CodingWorkspace
from .intake import read_document
from . import self_edit
from .uploads import store_upload,uploads,MAX_UPLOAD
from .checkpoints import coding_path,install_coding_checkpoint
import tempfile
class Turn(BaseModel):
    role:str=Field(pattern='^(user|assistant)$')
    text:str=Field(max_length=12000)
class Chat(BaseModel):
    message:str=Field(min_length=1,max_length=12000)
    history:list[Turn]=Field(default_factory=list,max_length=12)
class Checkpoint(BaseModel):
    path:str=Field(min_length=1,max_length=4096)
class Tool(BaseModel):
    tool:str=Field(min_length=1,max_length=100)
    arguments:dict=Field(default_factory=dict)
class DimensionPlan(BaseModel):
    positions:list[dict]=Field(min_length=4,max_length=4)
class DimensionWork(BaseModel):
    dimension:str
    max_passages:int=Field(default=1,ge=1,le=100)
class Source(BaseModel):
    text:str=Field(min_length=1,max_length=192000)
    title:str=Field(default='Workspace source',max_length=500)
class File(BaseModel):
    name:str=Field(min_length=1,max_length=500)
    text:str=Field(max_length=2000000)
class EditProposal(BaseModel):
    file:str=Field(max_length=500)
    replacement:str=Field(min_length=1,max_length=100000)
    before_sha256:str=Field(min_length=64,max_length=64)
class EditRequest(BaseModel):
    file:str=Field(max_length=500)
    instruction:str=Field(min_length=1,max_length=5000)
class ApplyEdit(BaseModel):
    id:str=Field(pattern="^[a-f0-9]{32}$")
class Command(BaseModel):
    command:str=Field(min_length=1,max_length=16000)

class ComputerHands(KleinBridge):
    def __init__(self,directory):
        directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
        environment={**os.environ,'LINUX_CONTAINER_WORKDIR':str(directory),
            'LINUX_CONTAINER_ENABLED':'true' if os.getenv('MODELMAKER_CONTAINER')=='1' else 'false'}
        super().__init__(directory,ROOT/'computer/hands_runner.mjs',environment,node_args=['--experimental-strip-types'])
    def call(self,tool,arguments):return self.request('invoke',tool=tool,input=arguments)

def create_app(directory=None,mount_training=True):
    data=Path(directory or os.getenv('MODELMAKER_DATA',ROOT/'.modelmaker')).resolve()
    runtimes={};hands={};install_job={'status':'idle'};lock=threading.RLock();workspace=data/'computer-workspace';workspace.mkdir(parents=True,exist_ok=True)
    @asynccontextmanager
    async def lifespan(app):
        yield
        for bridge in hands.values():bridge.close()
        for r in runtimes.values():r.close()
        hands.clear();runtimes.clear()
    app=FastAPI(title='Modelmaker',lifespan=lifespan)
    @app.middleware('http')
    async def local_session(request,call_next):
        if request.url.hostname not in ('127.0.0.1','localhost','testserver','::1'):
            return HTMLResponse('Use the loopback address or an authenticated local tunnel.',status_code=403)
        if request.method not in ('GET','HEAD','OPTIONS'):
            origin=request.headers.get('origin')
            if origin and origin.rstrip('/')!=str(request.base_url).rstrip('/'):
                return HTMLResponse('Cross-origin computer commands are disabled.',status_code=403)
            if request.headers.get('sec-fetch-site')=='cross-site':
                return HTMLResponse('Cross-site requests are disabled.',status_code=403)
        key=request.cookies.get('modelmaker_session','')
        if len(key)!=48 or any(c not in '0123456789abcdef' for c in key):key=secrets.token_hex(24)
        request.state.user=key
        response=await call_next(request)
        response.set_cookie('modelmaker_session',key,httponly=True,samesite='strict',max_age=31536000)
        return response
    def runtime(request):
        with lock:
            key=request.state.user
            if key not in runtimes:runtimes[key]=Assembly(data,key)
            ready=coding_path(data)
            if not runtimes[key].setting('checkpoint') and (ready/'modelmaker_coding.json').is_file():
                runtimes[key].setting('checkpoint',str(ready.resolve()))
            return runtimes[key]
    def computer(request):
        with lock:
            key=request.state.user
            if key not in hands:hands[key]=ComputerHands(workspace/key)
            return hands[key]
    @app.get('/')
    def desktop():return FileResponse(ROOT/'computer/index.html')
    @app.get('/computer/{asset}')
    def asset(asset:str):
        if asset not in ('workspace.mjs','workspace.css'):raise HTTPException(404)
        return FileResponse(ROOT/'computer'/asset,media_type='text/javascript' if asset.endswith('mjs') else 'text/css')
    @app.get('/api/computer/status')
    def status(request:Request):
        r=runtime(request)
        return {'checkpoint':r.setting('checkpoint'),'model_loaded':r._ensure_model(),
            'klein_tools':len(r.bridge.request('catalog',user=r.user)),
            'terminal_enabled':os.getenv('MODELMAKER_CONTAINER')=='1',
            'hands_source':'SynthAi hover/synthia58-2026-09-27',
            'android':'Existing Android bridge requires a running device or emulator service'}
    @app.post('/api/computer/chat')
    def chat(body:Chat,request:Request):return runtime(request).respond(body.message,history=[turn.model_dump() for turn in body.history])
    @app.post('/api/computer/checkpoint')
    def checkpoint(body:Checkpoint,request:Request):return runtime(request).load_model(body.path)
    @app.post('/api/computer/study')
    def study(body:Source,request:Request):return runtime(request).study(body.text,title=body.title,source='modelmaker-workspace')
    @app.get('/api/computer/coding/status')
    def coding_status():return dict(install_job)
    @app.post('/api/computer/coding/install')
    def coding_install(request:Request):
        r=runtime(request)
        with lock:
            if install_job.get('status') in ('downloading','loading'):return dict(install_job)
            install_job.clear();install_job.update(status='downloading',model='Qwen2.5-Coder-0.5B-Instruct')
        def install():
            try:
                receipt=install_coding_checkpoint(data)
                with lock:install_job.update(status='loading')
                loaded=r.load_model(receipt['path'])
                r.event('coding-checkpoint',receipt)
                with lock:install_job.update(status='ready',path=receipt['path'],loaded=loaded)
            except Exception as exc:
                with lock:install_job.update(status='failed',error=str(exc))
        threading.Thread(target=install,daemon=True).start()
        return dict(install_job)
    @app.get('/api/computer/uploads')
    def upload_list(request:Request):return uploads(runtime(request))
    def owned_upload(request,item):
        if len(item)!=32 or any(c not in '0123456789abcdef' for c in item):raise HTTPException(404)
        import json
        root=data/'uploads'/request.state.user/item
        receipt=root/'receipt.json'
        if not receipt.is_file():raise HTTPException(404)
        return root,json.loads(receipt.read_text())
    @app.get('/api/computer/uploads/{item}/original')
    def original_upload(item:str,request:Request):
        root,receipt=owned_upload(request,item)
        return FileResponse(root/'original'/receipt['file'],filename=receipt['file'],media_type='application/octet-stream')
    @app.get('/api/computer/uploads/{item}/text')
    def uploaded_text(item:str,name:str,request:Request):
        root,receipt=owned_upload(request,item)
        entry=next((row for row in receipt['entries'] if row['path']==name),None)
        if not entry or entry['status'] not in ('studied','indexed-awaiting-study'):raise HTTPException(400,'File does not have indexed text')
        project=workspace/request.state.user/'imports'/item if receipt.get('project_path') else root/'original'
        from .uploads import text_content,safe_member
        path=(project/str(safe_member(name))).resolve()
        if not path.is_relative_to(project.resolve()):raise HTTPException(400,'Invalid project path')
        text=text_content(path)
        return {'file':name,'text':(text or '')[:100000],'truncated':bool(text and len(text)>100000)}
    @app.post('/api/computer/books')
    async def upload_books(request:Request,files:list[UploadFile]=Upload(...)):
        if len(files)>32:raise HTTPException(400,'Upload at most 32 files at once')
        receipts=[];request_bytes=0
        for upload in files:
            name=Path(upload.filename or 'upload.bin').name
            try:
                with tempfile.TemporaryDirectory() as temporary:
                    path=Path(temporary)/'upload';size=0
                    with path.open('wb') as output:
                        while chunk:=await upload.read(1024*1024):
                            size+=len(chunk);request_bytes+=len(chunk)
                            if size>MAX_UPLOAD or request_bytes>512*1024*1024:raise ValueError('Upload limit: 128 MB per file, 512 MB per batch')
                            output.write(chunk)
                    from starlette.concurrency import run_in_threadpool
                    result=await run_in_threadpool(store_upload,runtime(request),name,path)
                receipts.append(result)
            except Exception as exc:receipts.append({'file':name,'ok':False,'error':str(exc)})
            finally:await upload.close()
        return {'books':receipts,'policy':'Original files are retained privately. Supported text is indexed and studied. Archives are inspected without execution. Binary storage does not imply semantic understanding or weight training.'}
    @app.get('/api/computer/edit/files')
    def editable_files():
        candidates=[p.relative_to(ROOT).as_posix() for prefix in self_edit.ALLOWED_ROOTS for p in (ROOT/prefix).rglob('*') if p.is_file() and p.suffix in ('.py','.js','.mjs','.html','.css','.md','.txt') and '__pycache__' not in p.parts]
        return sorted(set(candidates+list(self_edit.ALLOWED_FILES)))
    @app.get('/api/computer/edit/file')
    def edit_file(name:str):return self_edit.file_state(name)
    @app.post('/api/computer/edit/propose')
    def propose_edit(body:EditProposal,request:Request):return self_edit.propose(runtime(request),body.file,body.replacement,expected_hash=body.before_sha256)
    @app.post('/api/computer/edit/generate')
    def generate_edit(body:EditRequest,request:Request):return self_edit.generate(runtime(request),body.file,body.instruction)
    @app.post('/api/computer/edit/apply')
    def apply_edit(body:ApplyEdit,request:Request):return self_edit.apply(runtime(request),body.id)
    @app.post('/api/computer/tool')
    def tool(body:Tool,request:Request):return runtime(request).tool(body.tool,body.arguments)
    @app.get('/api/computer/tools')
    def tools(request:Request):
        r=runtime(request);return r.bridge.request('catalog',user=r.user)
    # The research team is a backend extension of this EXISTING Modelmaker, not
    # an independent agent stack. Assignments are owner supplied; no source is
    # silently selected and work never starts without an explicit request.
    @app.get('/api/computer/research-team/sources')
    def research_sources(request:Request):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).sources()
    @app.get('/api/computer/research-team/status')
    def research_status(request:Request):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).status()
    @app.post('/api/computer/research-team/configure')
    def research_configure(body:DimensionPlan,request:Request):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).configure_shared(body.positions)
    @app.post('/api/computer/research-team/run')
    def research_run(body:DimensionWork,request:Request):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).run(body.dimension,body.max_passages)
    @app.get('/api/computer/research-team/compare')
    def research_compare(request:Request,document_id:str|None=None):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).compare(document_id=document_id)
    @app.get('/api/computer/research-team/export/{dimension}')
    def research_export(dimension:str,request:Request):
        from .dimension_research import DimensionResearch
        return DimensionResearch(runtime(request)).export(dimension)
    @app.get('/api/computer/watch')
    def watch(request:Request):return runtime(request).watch()
    @app.post('/api/computer/file')
    def save_file(body:File,request:Request):return CodingWorkspace(workspace/request.state.user).write(body.name,body.text)
    @app.post('/api/computer/hand')
    def hand(body:Tool,request:Request):
        # The UI invokes explicit operations; generated chat is never executed.
        r=runtime(request)
        try:
            result=computer(request).call(body.tool,body.arguments)
            r.event('computer-hand',{'tool':body.tool,'ok':result.get('ok',True) if isinstance(result,dict) else True})
            return result
        except Exception as exc:
            r.event('computer-hand-failure',{'tool':body.tool,'error':str(exc)})
            raise ValueError(str(exc)) from exc
    @app.post('/api/computer/terminal')
    def terminal(body:Command,request:Request):
        if os.getenv('MODELMAKER_CONTAINER')!='1':raise HTTPException(403,'Terminal requires the Linux container. Host execution is disabled.')
        return computer(request).call('terminal.exec',{'command':body.command})
    @app.exception_handler(SyntaxError)
    async def invalid_syntax(request,exc):return JSONResponse({'error':'Source syntax check failed: '+str(exc)},status_code=400)
    @app.exception_handler(ValueError)
    async def invalid(request,exc):return JSONResponse({'error':str(exc)},status_code=400)
    if mount_training:
        import gradio as gr
        import app as training_app
        def session_user(request):return request.cookies.get('modelmaker_session','local') if request else 'local'
        def assembly_for(key='local'):
            with lock:
                if key not in runtimes:runtimes[key]=Assembly(data,key)
                return runtimes[key]
        training_app._user=session_user;training_app._assembly=assembly_for
        app=gr.mount_gradio_app(app,training_app.build_ui(),path='/training')
    return app
if __name__=='__main__':
    import uvicorn
    uvicorn.run(create_app(),host=os.getenv('MODELMAKER_HOST','127.0.0.1'),port=int(os.getenv('PORT','7860')))
