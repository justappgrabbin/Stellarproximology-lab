"""Trainer for the owner's PyTorch TRIDENT source, with preserved revisions.

The transformer is preserved from the owner's Synthia-Neural-Standalone archive.
Only explicitly owner-approved prompt-response records are used for training.
This does not claim to produce a pretrained or fluent language model.
"""
from __future__ import annotations
import json
import os
import shutil
import tempfile
import threading
import uuid
import zipfile
from collections import Counter
from pathlib import Path
import sys

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "source"))

import torch
from model import TridentConfig
from semantic_language_maker import NeuralMaker, RelationalTrident

torch.set_num_threads(min(2, max(1, os.cpu_count() or 1)))
GUARD = threading.RLock()
ROOT = Path(os.environ.get('MODELMAKER_WORKSPACE') or ('/data/modelmaker' if Path('/data').is_dir() else BASE/'workspace')).resolve()
MODES = {'Portable · 260-byte vocabulary': 'portable', 'Original-size · 4096-token vocabulary': 'original-shape'}
HEADS = {'code','math','research'}


def _jsonl(path_or_text: str, *, from_file: bool = True) -> list[dict]:
    if from_file:
        p=Path(path_or_text)
        if not p.is_file(): raise ValueError('Choose a JSONL file')
        if p.stat().st_size > 5_000_000: raise ValueError('Dataset exceeds the 5 MB safety limit')
        content=p.read_text(encoding='utf-8')
    else: content=path_or_text
    lines=[line for line in content.splitlines() if line.strip()]
    if not 1<=len(lines)<=2000: raise ValueError('Provide between 1 and 2000 JSONL records')
    result=[]
    for line_no,line in enumerate(lines,1):
        try: obj=json.loads(line)
        except json.JSONDecodeError as e: raise ValueError(f'Invalid JSON on line {line_no}: {e.msg}') from e
        if not isinstance(obj,dict):raise ValueError(f'Line {line_no} must be a JSON object')
        for key,limit in [('prompt',12000),('response',4000)]:
            if not isinstance(obj.get(key),str) or not obj[key].strip() or len(obj[key])>limit:
                raise ValueError(f'Line {line_no}: {key} must be nonempty text no longer than {limit} characters')
        if obj.get('head','research') not in HEADS:
            raise ValueError(f'Line {line_no}: head must be code, math, or research')
        if obj.get('relations') is not None and not isinstance(obj['relations'],list):
            raise ValueError(f'Line {line_no}: relations must be an array')
        if obj.get('morphology') is not None and not isinstance(obj['morphology'],list):
            raise ValueError(f'Line {line_no}: morphology must be an array')
        if obj.get('human_design') is not None and not isinstance(obj['human_design'],dict):
            raise ValueError(f'Line {line_no}: human_design must be an object')
        result.append(obj)
    return result


def _read_pointer(directory: Path):
    f=directory/'current.json'
    if not f.exists():return None
    revision=json.loads(f.read_text(encoding='utf-8')).get('revision')
    if not isinstance(revision,str) or not revision.startswith('revision-') or not revision[9:].isalnum():
        raise RuntimeError('Invalid checkpoint pointer; refusing to initialize over it')
    return revision


def _new_maker(mode: str) -> NeuralMaker:
    if mode == 'portable':return NeuralMaker()
    if mode == 'original-shape':
        cfg=TridentConfig()
        return NeuralMaker(model=RelationalTrident(cfg),max_seq_len=cfg.max_seq_len)
    raise ValueError('Unknown model variant')


def _mode_of(maker: NeuralMaker):
    c=maker.model.cfg
    if c.vocab_size==260 and c.d_model==64 and c.n_layers==2:return 'portable'
    if c.vocab_size==4096 and c.d_model==128 and c.n_layers==4:return 'original-shape'
    return 'custom'


def _load(directory:Path):
    rev=_read_pointer(directory)
    if rev is None:return None,None
    model_dir=directory/rev
    if not model_dir.is_dir():raise RuntimeError('Checkpoint referenced by current.json is missing')
    return NeuralMaker.load(model_dir),rev


def _evaluate(maker:NeuralMaker,rows:list[dict],max_items:int=128)->dict:
    """Measured teacher-forced answer loss, not fluency or semantic correctness."""
    import torch.nn.functional as F
    maker.model.eval()
    total=0.0
    tokens=0
    with torch.no_grad():
        for row in rows[:max_items]:
            x,y,k=maker._example(row)
            logits=maker.model(x,head=row.get('head','research'),klein=k)
            loss=F.cross_entropy(logits.flatten(0,1),y.flatten(),ignore_index=-100,reduction='sum')
            count=int((y!=-100).sum().item())
            total+=float(loss)
            tokens+=count
    return {'examples':min(len(rows),max_items),'answer_tokens':tokens,
            'teacher_forced_loss':(total/tokens if tokens else None),
            'scope':'Held-out answer-token prediction; not measured conversational ability'}


def model_status() -> dict:
    with GUARD:
        maker,rev=_load(ROOT)
        if maker is None:
            return {'trained':False,'revision':None,'parameters':None,
                    'message':'No saved weights in this workspace. Hugging Face Trident contains source code, not a published checkpoint.',
                    'workspace_persistent':str(ROOT).startswith('/data/')}
        return {'trained':maker.steps>0,'revision':rev,'variant':_mode_of(maker),
                'optimizer_steps':maker.steps,'examples_seen':maker.seen,'parameters':maker.model.param_count(),
                'workspace_persistent':str(ROOT).startswith('/data/'),
                'note':'Checkpoint weights exist. Language fluency and generalization have NOT been established.'}


def train_uploaded(corpus_path:str, heldout_path:str|None, variant:str, steps:int, approved:bool):
    if not approved: raise ValueError('Check the approval box. Do not upload private material without consent.')
    if not corpus_path:raise ValueError('Upload an approved training JSONL file')
    rows=_jsonl(corpus_path)
    heldout=_jsonl(heldout_path) if heldout_path else []
    steps=int(steps)
    if not 1<=steps<=1000:raise ValueError('Training steps must be between 1 and 1000')
    mode=MODES.get(variant)
    if not mode:raise ValueError('Select a model variant')
    with GUARD:
        ROOT.mkdir(parents=True,exist_ok=True)
        maker,previous=_load(ROOT)
        if maker is not None and _mode_of(maker)!=mode:
            raise ValueError(f'This workspace has {_mode_of(maker)} weights. Cannot switch architectures without a separate workspace.')
        if maker is None:maker=_new_maker(mode)
        before=_evaluate(maker,heldout) if heldout else None
        stats=maker.fit(rows,steps=steps)
        after=_evaluate(maker,heldout) if heldout else None
        revision='revision-'+uuid.uuid4().hex
        temp=ROOT/('staging-'+uuid.uuid4().hex)
        target=ROOT/revision
        temp.mkdir(mode=0o700)
        try:
            maker.save(temp)
            (temp/'training.json').write_text(json.dumps({
                'stats':stats,'variant':mode,'parent':previous,'heads':dict(Counter(r.get('head','research') for r in rows)),
                'heldout_before':before,'heldout_after':after,
                'limitations':'Tiny datasets can memorize; next-token loss does not establish fluency, factuality or human-design validity.'
            },indent=2),encoding='utf-8')
            (temp/'approved_corpus.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
            # Verify exact tensors are reloadable before publication of new pointer.
            recovered=NeuralMaker.load(temp)
            if recovered.steps!=maker.steps or recovered.model.param_count()!=maker.model.param_count():
                raise RuntimeError('Checkpoint round trip failed')
            temp.rename(target)
            pointer_temp=ROOT/('pointer-'+uuid.uuid4().hex+'.tmp')
            pointer_temp.write_text(json.dumps({'revision':revision}),encoding='utf-8')
            pointer_temp.replace(ROOT/'current.json')
        finally:
            if temp.exists():shutil.rmtree(temp)
        return {'revision':revision,'parent':previous,'variant':mode,**stats,
                'head_counts':dict(Counter(r.get('head','research') for r in rows)),
                'heldout_before':before,'heldout_after':after,
                'note':'Real gradients updated and reloaded. This is NOT a general-language proficiency claim.'}


def evaluate_uploaded(heldout_path: str):
    with GUARD:
        maker,rev=_load(ROOT)
        if maker is None:raise ValueError('Train a checkpoint first')
        return {'revision':rev,**_evaluate(maker,_jsonl(heldout_path))}


def sample(prompt:str,head:str,max_bytes:int,seed:int):
    if not isinstance(prompt,str) or not 0<len(prompt.strip())<=2000:raise ValueError('Enter a short prompt')
    if head not in HEADS:raise ValueError('Invalid head')
    with GUARD:
        maker,rev=_load(ROOT)
        if maker is None:raise ValueError('No trained checkpoint exists')
        result=maker.generate(prompt,head=head,max_new_bytes=int(max_bytes),seed=int(seed))
        return {'revision':rev,'head':head,**result,'note':'Raw neural sampling; outputs are not verified.'}


def checkpoint_bundle()->str:
    with GUARD:
        maker,rev=_load(ROOT)
        if maker is None:raise ValueError('No checkpoint exists to export')
        output=ROOT/('export-'+rev+'.zip')
        folder=ROOT/rev
        with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as z:
            for basename in ['config.json','weights.pt','training.json','approved_corpus.jsonl']:
                if (folder/basename).exists():z.write(folder/basename,arcname=f'trident/{basename}')
            for basename in ['model.py','semantic_language_maker.py']:
                source_file=BASE/'source'/basename
                if source_file.is_file(): z.write(source_file,arcname=f'source/{basename}')
            z.writestr('README.txt',
                'SYNTHIA/TRIDENT checkpoint from Modelmaker. Not a pretrained foundation model.\n'
                'The source/ folder contains the companion TRIDENT architecture, including the byte codec.\n'
                'To load: add source/ to PYTHONPATH, then call NeuralMaker.load("trident").\n'
                'Do not overwrite an existing Trident checkpoint or load this through AutoModel;\n'
                'the architecture and byte-token mapping must match exactly.\n')
        return str(output)