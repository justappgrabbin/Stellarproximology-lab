"""Loopback-only OpenAI-compatible inference using REAL SYNTHIA/TRIDENT weights.

The checkpoint must be created by the root TRIDENT Modelmaker, not the legacy
GPT-2 Modelmaker-repair. This API intentionally makes no fluency claims.
"""
from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from training_core import _read_pointer
from semantic_language_maker import NeuralMaker
from dimensional_router import DEFAULT_ROUTER

MAX_BODY_BYTES = 65536


def load_model(path: str | Path):
    root = Path(path).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError('Expected a checkpoint directory')
    if (root / 'current.json').is_file():
        revision = _read_pointer(root)
        if revision is None:
            raise ValueError('Workspace has no current checkpoint')
        root = root / revision
    for name in ('config.json', 'weights.pt'):
        if not (root / name).is_file() or (root / name).is_symlink():
            raise ValueError(f'Missing regular checkpoint file: {name}')
    maker = NeuralMaker.load(root)
    if maker.steps < 1:
        raise ValueError('This checkpoint is not trained')
    return maker, f'synthia-trident-{root.name}'


def parse_request(data: object, model_id: str):
    if not isinstance(data, dict) or data.get('stream') not in (None, False):
        raise ValueError('Only non-streaming chat completions are supported')
    if data.get('model') != model_id:
        raise ValueError('Requested model differs from loaded checkpoint')
    messages = data.get('messages')
    if not isinstance(messages, list) or not 1 <= len(messages) <= 20:
        raise ValueError('Expected one to twenty messages')
    if any(not isinstance(m, dict) or m.get('role') not in {'system','user','assistant'}
           or not isinstance(m.get('content'), str) for m in messages):
        raise ValueError('Messages must have a supported role and text content')
    if messages[-1]['role'] != 'user' or not messages[-1]['content'].strip():
        raise ValueError('Final message must be a nonempty user message')
    if sum(len(m['content']) for m in messages) > 16000:
        raise ValueError('Prompt is too long')
    count = data.get('max_tokens', 64)
    if type(count) is not int or not 1 <= count <= 128:
        raise ValueError('max_tokens must be an integer 1..128')
    head = data.get('head','research')
    if head not in {'code','math','research'}:
        raise ValueError('Invalid specialist head')
    seed = data.get('seed',11)
    if type(seed) is not int or seed < 0 or seed > 2147483647:
        raise ValueError('seed must be a nonnegative 32-bit integer')
    conversation = '\n'.join(f"{m['role'].upper()}: {m['content']}" for m in messages)
    return conversation, count, head, seed


def handler_for(maker, model_id: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return  # Do not expose prompts to logs

        def json_response(self, code, data):
            raw=json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path == '/health':
                return self.json_response(200,{'checkpoint_loaded': True,'trained':maker.steps>0,
                    'model':model_id,'optimizer_steps':maker.steps,'production_ready':False})
            if self.path == '/v1/models':
                return self.json_response(200,{'object':'list','data':[{'id':model_id,'object':'model','owned_by':'synthia-local'}]})
            return self.json_response(404,{'error':'Unknown route'})

        def do_POST(self):
            if self.path != '/v1/chat/completions':
                return self.json_response(404,{'error':'Unknown route'})
            try:
                size_raw=self.headers.get('Content-Length','')
                if not size_raw.isascii() or not size_raw.isdecimal():
                    raise ValueError('Content-Length required')
                size=int(size_raw)
                if size < 2 or size > MAX_BODY_BYTES:
                    return self.json_response(413,{'error':'Invalid request size'})
                data=json.loads(self.rfile.read(size))
                prompt,count,head,seed=parse_request(data,model_id)
                events=data.get('dimension_events')
                if events is not None:
                    DEFAULT_ROUTER.encode(events)  # Reject unsupported edges, including guesses.
                context={'dimension_events':events} if events is not None else None
                result=maker.generate(prompt,head=head,max_new_bytes=count,seed=seed,features=context)
                if not result.get('ready'):
                    return self.json_response(503,{'error':'Model has no usable trained weights'})
                output=result['text']
                return self.json_response(200,{
                    'id':f'trident-{time.time_ns()}','object':'chat.completion','model':model_id,
                    'choices':[{'index':0,'message':{'role':'assistant','content':output},'finish_reason':'length'}],
                    'usage':{'prompt_tokens':len(prompt.encode('utf-8')),'completion_tokens':result['bytes'],
                             'total_tokens':len(prompt.encode('utf-8'))+result['bytes']},
                    'metadata':{'architecture':'synthia-relational-trident','optimizer_steps':maker.steps,
                                'note':'Byte counts, not standard LLM token counts. Unverified output.'}})
            except (ValueError, json.JSONDecodeError) as err:
                return self.json_response(400,{'error':str(err)[:200]})
            except Exception:
                return self.json_response(503,{'error':'Local TRIDENT inference failed'})
    return Handler


def main():
    parser=argparse.ArgumentParser(description='Serve a locally trained SYNTHIA TRIDENT checkpoint')
    parser.add_argument('--model-dir',required=True,help='Modelmaker workspace or revision folder')
    parser.add_argument('--port',type=int,default=11735)
    args=parser.parse_args()
    if not 1024 <= args.port <= 65535:parser.error('Port must be 1024..65535')
    maker,name=load_model(args.model_dir)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(maker,name))
    server.daemon_threads=True
    print(f'TRIDENT loaded at http://127.0.0.1:{args.port} model={name} steps={maker.steps}',flush=True)
    try:server.serve_forever()
    finally:server.server_close()

if __name__=='__main__':main()