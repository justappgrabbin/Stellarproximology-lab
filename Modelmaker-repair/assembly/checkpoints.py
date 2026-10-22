"""Pinned public coding checkpoint installation; local CPU inference only."""
import hashlib
import json
from pathlib import Path
from huggingface_hub import snapshot_download
CODING_REPO='Qwen/Qwen2.5-Coder-0.5B-Instruct'
CODING_REVISION='ea3f2471cf1b1f0db85067f1ef93848e38e88c25'
CODING_NAME='qwen2.5-coder-0.5b-instruct'

def coding_path(directory):return Path(directory)/'checkpoints'/CODING_NAME

def install_coding_checkpoint(directory):
    destination=coding_path(directory)
    existing=destination/'modelmaker_coding.json'
    if existing.is_file():
        receipt=json.loads(existing.read_text())
        if receipt.get('repository')==CODING_REPO and receipt.get('revision')==CODING_REVISION and all((destination/row['name']).is_file() and (destination/row['name']).stat().st_size==row['bytes'] for row in receipt.get('files',[])) and (destination/'model.safetensors').is_file():
            return receipt
    snapshot_download(repo_id=CODING_REPO,revision=CODING_REVISION,local_dir=destination,
        allow_patterns=['*.json','*.safetensors','merges.txt','vocab.json','LICENSE','README.md'])
    from transformers import AutoConfig,AutoTokenizer
    config=AutoConfig.from_pretrained(destination,local_files_only=True,trust_remote_code=False)
    tokenizer=AutoTokenizer.from_pretrained(destination,local_files_only=True,trust_remote_code=False)
    if config.model_type!='qwen2' or not tokenizer.chat_template or not (destination/'model.safetensors').is_file():
        raise ValueError('Downloaded coding checkpoint failed its configuration checks')
    receipt={'repository':CODING_REPO,'revision':CODING_REVISION,'path':str(destination.resolve()),
        'architecture':config.model_type,'license':'Apache-2.0','inference_device':'cpu',
        'files':[{'name':p.name,'bytes':p.stat().st_size} for p in destination.iterdir() if p.is_file() and p.name!='modelmaker_coding.json'],
        'scope':'Pretrained small coding model; generated programs and edits still require validation'}
    (destination/'modelmaker_coding.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt
if __name__=='__main__':
    from .runtime import ROOT
    import os
    print(json.dumps(install_coding_checkpoint(Path(os.getenv('MODELMAKER_DATA',ROOT/'.modelmaker'))),indent=2))
