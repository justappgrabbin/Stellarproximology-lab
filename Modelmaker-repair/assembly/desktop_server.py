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
    runtimes={};hands={};lock=threading.RLock();workspace=data/'computer-workspace';workspace.mkdir(parents=True,exist_ok=True)
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
    @app.post('/api/computer/books')
    async def upload_books(request:Request,files:list[UploadFile]=Upload(...)):
        receipts=[]
        for upload in files:
            name=Path(upload.filename or 'book.txt').name
            try:
                payload=await upload.read(32*1024*1024+1)
                if len(payload)>32*1024*1024:raise ValueError('Book exceeds the 32 MB upload limit')
                with tempfile.TemporaryDirectory() as temporary:
                    path=Path(temporary)/name;path.write_bytes(payload)
                    text=read_document(path)
                # Run synchronous source analysis off the ASGI event loop.
                from starlette.concurrency import run_in_threadpool
                result=await run_in_threadpool(runtime(request).study,text,title=name,source='uploaded:'+name)
                receipts.append({'file':name,'ok':True,'receipt':result})
            except Exception as exc:receipts.append({'file':name,'ok':False,'error':str(exc)})
            finally:await upload.close()
        return {'books':receipts,'policy':'Source passages remain retrievable; analysis receipts report any unprocessed passages. Uploading is not a weight-training run.'}
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
