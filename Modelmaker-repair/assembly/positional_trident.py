"""Four learned Klein positional adapters on ONE owner-trained native TRIDENT.

The byte codec, RelationalTrident architecture, 8x32 Klein feature contract,
and three specialist heads are preserved from the owner-provided Modelmaker
main branch. Only the selected small adapter is optimized; the base is frozen.

Source coverage/Klein automata remain in assembly.dimension_research. This
module performs actual adapter gradient training on source-anchored,
owner-approved response examples. Reading a source never silently trains.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F

TRIDENT_SOURCE = Path(__file__).resolve().parents[1] / 'vendor' / 'trident'
if str(TRIDENT_SOURCE) not in sys.path:
    sys.path.insert(0, str(TRIDENT_SOURCE))
from semantic_language_maker import NeuralMaker, VOCAB_SIZE, PAD, BOS, EOS, SEP  # noqa: E402

POSITIONS = ('Movement', 'Evolution', 'Being', 'Design')
HEADS = frozenset({'research', 'math', 'code'})


def _sha_file(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _checkpoint_folder(path):
    root = Path(path).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError('TRIDENT checkpoint must be a directory')
    pointer = root / 'current.json'
    if pointer.exists():
        if pointer.is_symlink():
            raise ValueError('Symlink checkpoint pointer is not accepted')
        revision = json.loads(pointer.read_text(encoding='utf-8')).get('revision')
        if not isinstance(revision, str) or not revision.startswith('revision-') or not revision[9:].isalnum():
            raise ValueError('Invalid TRIDENT revision pointer')
        root = (root / revision).resolve(strict=True)
        if not root.is_relative_to(Path(path).expanduser().resolve(strict=True)):
            raise ValueError('Checkpoint revision escapes workspace')
    for name in ('config.json', 'weights.pt'):
        item = root / name
        if not item.is_file() or item.is_symlink():
            raise ValueError(f'Missing or non-regular TRIDENT checkpoint {name}')
    metadata = json.loads((root / 'config.json').read_text(encoding='utf-8'))
    if metadata.get('format') != 'synthia-neural-language':
        raise ValueError('This is not a native SYNTHIA/TRIDENT NeuralMaker checkpoint')
    if metadata.get('codec') != 'lossless-utf8-byte-v1':
        raise ValueError('Unsupported TRIDENT token codec')
    if not isinstance(metadata.get('steps'), int) or metadata['steps'] < 1:
        raise ValueError('Base TRIDENT checkpoint has no verified optimizer steps')
    return root


class KleinPositionAdapter(nn.Module):
    """Per-tool rank-4 residual over TRIDENT's existing [batch, 8, 32] contract."""
    def __init__(self, rank=4):
        super().__init__()
        if not 1 <= rank <= 16:
            raise ValueError('Rank must be between 1 and 16')
        self.rank = rank
        self.down = nn.Parameter(torch.empty(8, 32, rank))
        self.up = nn.Parameter(torch.zeros(8, rank, 32))
        self.bias = nn.Parameter(torch.zeros(8, 32))
        nn.init.normal_(self.down, mean=0, std=0.01)

    def forward(self, klein):
        if klein.ndim != 3 or klein.shape[1:] != (8, 32):
            raise ValueError('Klein conditioning needs [batch,8,32]')
        if not torch.isfinite(klein).all():
            raise ValueError('Klein conditioning contains non-finite numbers')
        # No substitution of a new latent/state-space architecture. The
        # adapter remains inside the owner's native eight-tool feature field.
        residual = torch.einsum('btd,tdr,tre->bte', klein, self.down, self.up)
        return (klein + self.bias[None, :, :] + residual).clamp(-3.0, 3.0)


class SharedTridentPositions:
    """One frozen TRIDENT backbone; four separately learned positional deltas."""
    def __init__(self, base_checkpoint, *, workspace, assembly=None, device='cpu'):
        self.base_folder = _checkpoint_folder(base_checkpoint)
        self.base_hash = hashlib.sha256((
            _sha_file(self.base_folder / 'weights.pt') + ':' +
            _sha_file(self.base_folder / 'config.json')).encode()).hexdigest()
        self.maker = NeuralMaker.load(self.base_folder)
        self.base_steps = self.maker.steps
        self.base = self.maker.model.to(device).eval()
        self.codec = self.maker.codec
        self.device = torch.device(device)
        for parameter in self.base.parameters():
            parameter.requires_grad_(False)
        self.adapters = nn.ModuleDict({
            position: KleinPositionAdapter() for position in POSITIONS
        }).to(self.device)
        self.workspace = Path(workspace).expanduser().resolve() / 'positional-trident' / self.base_hash
        self.assembly = assembly
        self.revisions = {p:None for p in POSITIONS}
        self.optimizer_steps = {p:0 for p in POSITIONS}
        self._load_adapters()

    def _folder(self, position):
        self._check_position(position)
        return self.workspace / position

    @staticmethod
    def _check_position(position):
        if position not in POSITIONS:
            raise ValueError('Position must be Movement, Evolution, Being or Design')

    def _load_adapters(self):
        for position in POSITIONS:
            folder = self._folder(position)
            pointer = folder / 'current.json'
            if not pointer.exists():
                continue
            if pointer.is_symlink():
                raise ValueError('Adapter pointer cannot be a symlink')
            revision = json.loads(pointer.read_text(encoding='utf-8')).get('revision')
            if not isinstance(revision,str) or not revision.startswith('revision-') or not revision[9:].isalnum():
                raise ValueError('Invalid position revision pointer')
            directory = folder / revision
            if not directory.is_dir() or directory.is_symlink():
                raise ValueError('Missing adapter revision directory')
            meta_path = directory / 'metadata.json'
            weight_path = directory / 'adapter.pt'
            if any(not p.is_file() or p.is_symlink() for p in (meta_path,weight_path)):
                raise ValueError('Adapter revision incomplete')
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            if meta.get('base_hash') != self.base_hash or meta.get('position') != position:
                raise ValueError('Adapter weights belong to another base or position')
            if meta.get('schema') != 'synthia.trident.klein.position.v1':
                raise ValueError('Unsupported adapter revision format')
            if meta.get('weight_sha256') != _sha_file(weight_path):
                raise ValueError('Adapter weights checksum mismatch')
            state = torch.load(weight_path, map_location='cpu', weights_only=True)
            self.adapters[position].load_state_dict(state, strict=True)
            self.optimizer_steps[position] = int(meta['optimizer_steps'])
            self.revisions[position] = revision

    def _source_receipt(self, row, position):
        if self.assembly is None:
            raise ValueError('Source-anchored training requires an existing Modelmaker Assembly')
        if not isinstance(row, dict) or row.get('approved') is not True:
            raise ValueError('Every training and held-out record must be owner-approved')
        if row.get('position') != position:
            raise ValueError('Training example position does not match the selected adapter')
        if row.get('head','research') not in HEADS:
            raise ValueError('Unsupported original TRIDENT head')
        source_id, quote = row.get('source_id'), row.get('source_quote')
        if not isinstance(source_id, str) or not source_id:
            raise ValueError('Source document ID is required')
        if not isinstance(quote, str) or not quote.strip():
            raise ValueError('Exact source quotation is required')
        with self.assembly.lock:
            source = self.assembly.db.execute(
                'SELECT title,source,text FROM documents WHERE user=? AND id=?',
                (self.assembly.user,source_id)).fetchone()
        if source is None or quote not in source['text']:
            raise ValueError('Evidence quotation is absent from the original shared source')
        for field in ('prompt','response'):
            value = row.get(field)
            if not isinstance(value, str) or not value.strip() or len(value)>4000:
                raise ValueError(f'Approved example has invalid {field}')
        if 'klein' in row:
            matrix = torch.as_tensor(row['klein'],dtype=torch.float32)
            if matrix.shape != (8,32) or not torch.isfinite(matrix).all():
                raise ValueError('Optional canonical Klein measurements must be finite [8,32]')
        return {'source_id': source_id, 'source_sha256': hashlib.sha256(
            source['text'].encode('utf-8')).hexdigest(),
            'source_quote_sha256': hashlib.sha256(quote.encode('utf-8')).hexdigest(),
            'canonical_klein_provided': 'klein' in row}

    def _loss(self, position, rows, require_grad=False):
        if not rows:
            raise ValueError('No annotated examples supplied')
        total = 0.
        tokens = 0
        context = torch.enable_grad() if require_grad else torch.no_grad()
        with context:
            for row in rows:
                ids, targets, features = self.maker._example(row)
                ids = ids.to(self.device)
                targets = targets.to(self.device)
                features = features.to(self.device)
                conditioned = self.adapters[position](features)
                logits = self.base(ids, head=row.get('head','research'),klein=conditioned)
                loss = F.cross_entropy(logits.flatten(0,1), targets.flatten(), ignore_index=-100, reduction='sum')
                total = total + loss
                tokens += int((targets!=-100).sum())
        if tokens < 1:
            raise ValueError('No answer tokens available for training or evaluation')
        return total / tokens

    def train(self, position, examples, heldout, *, steps=10, lr=0.003, seed=13):
        """Train exactly one adapter, with a frozen shared backbone."""
        self._check_position(position)
        if not isinstance(examples,list) or not 1 <= len(examples) <= 2000:
            raise ValueError('Provide 1..2000 reviewed, source-anchored training records')
        if not isinstance(heldout,list) or not 1 <= len(heldout) <= 2000:
            raise ValueError('Provide a separate approved held-out evaluation set')
        if type(steps) is not int or not 1 <= steps <= 1000:
            raise ValueError('Optimizer steps must be 1..1000')
        if not isinstance(lr,(float,int)) or not math.isfinite(lr) or not 0 < lr <= 0.1:
            raise ValueError('Learning rate must be finite, positive and <= 0.1')
        train_receipts = [self._source_receipt(r,position) for r in examples]
        held_receipts = [self._source_receipt(r,position) for r in heldout]
        train_pairs = {(r['prompt'].strip(),r['response'].strip()) for r in examples}
        eval_pairs = {(r['prompt'].strip(),r['response'].strip()) for r in heldout}
        if train_pairs & eval_pairs:
            raise ValueError('Training and held-out records overlap')
        torch.manual_seed(seed)
        self.base.eval()
        adapter = self.adapters[position]
        optimizer = torch.optim.AdamW(adapter.parameters(),lr=float(lr),weight_decay=0.0)
        before = float(self._loss(position,heldout))
        initial_revision = self.revisions[position]
        losses=[]
        for step in range(steps):
            row=examples[step % len(examples)]
            optimizer.zero_grad(set_to_none=True)
            loss=self._loss(position,[row],require_grad=True)
            if not torch.isfinite(loss):
                raise ValueError('Non-finite gradient loss')
            loss.backward()
            torch.nn.utils.clip_grad_norm_(adapter.parameters(),1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
        after = float(self._loss(position,heldout))
        # Save only this position; never mutate the base or the other three.
        revision = 'revision-'+uuid.uuid4().hex
        folder = self._folder(position)
        folder.mkdir(parents=True,exist_ok=True)
        staged = Path(tempfile.mkdtemp(prefix='staging-',dir=folder))
        try:
            weight = staged / 'adapter.pt'
            torch.save(adapter.state_dict(),weight)
            metadata = {
                'schema':'synthia.trident.klein.position.v1',
                'position':position,'base_hash':self.base_hash,'base_optimizer_steps':self.base_steps,
                'parent':initial_revision,'revision':revision,
                'optimizer_steps':self.optimizer_steps[position]+steps,
                'learned_parameters':sum(x.numel() for x in adapter.parameters()),
                'training_examples':len(examples),'heldout_examples':len(heldout),
                'heldout_before':before,'heldout_after':after,
                'training_loss_first':losses[0],'training_loss_last':losses[-1],
                'sources_train':train_receipts,'sources_heldout':held_receipts,
                'weight_sha256':_sha_file(weight),
                'limitations':'Held-out next-token loss is not proof of factual or semantic correctness. '
                              'Native Klein tool state and neural gradients are separately recorded.'
            }
            (staged/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
            check = KleinPositionAdapter(rank=adapter.rank)
            check.load_state_dict(torch.load(weight,map_location='cpu',weights_only=True),strict=True)
            for a,b in zip(adapter.state_dict().values(),check.state_dict().values()):
                if not torch.equal(a.cpu(),b):
                    raise RuntimeError('Adapter save/reload equivalence failed')
            staged.rename(folder/revision)
            temp=folder/('pointer-'+uuid.uuid4().hex+'.tmp')
            temp.write_text(json.dumps({'revision':revision}),encoding='utf-8')
            temp.replace(folder/'current.json')
        finally:
            if staged.exists():
                shutil.rmtree(staged)
        self.revisions[position]=revision
        self.optimizer_steps[position]+=steps
        return {'trained_position':position,'revision':revision,'parent':initial_revision,
                'base_hash':self.base_hash,'base_weights_updated':False,
                'other_positions_updated':False,'optimizer_steps':self.optimizer_steps[position],
                'heldout_before':before,'heldout_after':after,
                'observed_canonical_klein_features':sum(v['canonical_klein_provided'] for v in train_receipts),
                'source_anchored_examples':len(examples),
                'status':'adapter-trained-not-validated-for-research-correctness'}

    def status(self):
        return {'architecture':'one-frozen-native-relational-trident-four-learnable-klein-feature-adapters',
                'base_checkpoint':str(self.base_folder),'base_hash':self.base_hash,
                'base_optimizer_steps':self.base_steps,'base_parameters':sum(p.numel() for p in self.base.parameters()),
                'positions':{p:{'revision':self.revisions[p],'optimizer_steps':self.optimizer_steps[p],
                    'learned_parameters':sum(t.numel() for t in self.adapters[p].parameters()),
                    'ready':self.revisions[p] is not None} for p in POSITIONS},
                'research_source_policy':'same-owner-scoped-collection',
                'note':'Base weights frozen. Each position needs its own approved, source-anchored targets.'}

    @torch.no_grad()
    def generate(self, position, prompt, *, klein=None, head='research', max_new_bytes=64, seed=13):
        self._check_position(position)
        if self.revisions[position] is None:
            raise ValueError('Position adapter is not trained')
        if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>4000:
            raise ValueError('Enter a nonempty bounded prompt')
        if head not in HEADS:
            raise ValueError('Unknown TRIDENT specialist head')
        if type(max_new_bytes) is not int or not 1 <= max_new_bytes <= 256:
            raise ValueError('Generate between 1 and 256 output bytes')
        # Base's original observed/context feature builder is retained. Optional
        # measured native Klein matrix is additive, not inferred from a word list.
        from semantic_language_maker import semantic_features
        feature = semantic_features(prompt,klein=klein)[None].to(self.device)
        conditioned = self.adapters[position](feature)
        ctx=self.codec.encode('User: '+prompt.strip()+'\nSynthia: ')
        ids=[BOS]+ctx[-(self.maker.max_seq_len-2):]
        results=[]
        generator=torch.Generator(device=self.device).manual_seed(seed)
        self.base.eval()
        for _ in range(max_new_bytes):
            model_input=torch.tensor(ids[-self.maker.max_seq_len:],dtype=torch.long,device=self.device)[None,:]
            logits=self.base(model_input,head=head,klein=conditioned)[:,-1].clone()
            logits[:,PAD]=float('-inf')
            logits[:,BOS]=float('-inf')
            logits[:,SEP]=float('-inf')
            if logits.shape[-1] > VOCAB_SIZE:
                logits[:,VOCAB_SIZE:]=float('-inf')
            probs=F.softmax(logits,dim=-1)
            token=int(torch.multinomial(probs,1,generator=generator).item())
            if token==EOS:
                break
            ids.append(token)
            results.append(token)
        return {'position':position,'revision':self.revisions[position],
                'base_hash':self.base_hash,'text':self.codec.decode(results),
                'raw_bytes_generated':len(results),'trained_adapter':True,
                'canonical_klein_provided':klein is not None,
                'note':'Unverified probabilistic byte continuation, not an established research finding.'}


def main():
    import argparse
    from .runtime import Assembly

    parser=argparse.ArgumentParser(description='Train native Klein positional adapters without changing shared TRIDENT weights')
    parser.add_argument('command',choices=('status','train','generate'))
    parser.add_argument('--base',required=True,help='Directory with existing trained native TRIDENT config.json and weights.pt, or revision workspace')
    parser.add_argument('--data',help='Same private Modelmaker data directory used for uploaded source documents')
    parser.add_argument('--user',default='local',help='Existing Modelmaker profile key')
    parser.add_argument('--position',choices=POSITIONS)
    parser.add_argument('--train-jsonl',help='Owner-approved source-anchored JSONL training rows')
    parser.add_argument('--heldout-jsonl',help='Separate owner-approved source-anchored JSONL evaluation rows')
    parser.add_argument('--steps',type=int,default=10)
    parser.add_argument('--prompt')
    parser.add_argument('--max-new-bytes',type=int,default=64)
    args=parser.parse_args()
    from .runtime import ROOT
    data=args.data or os.environ.get('MODELMAKER_DATA') or str(ROOT/'.modelmaker')
    assembly=Assembly(data,args.user)
    try:
        model=SharedTridentPositions(args.base,workspace=assembly.directory,assembly=assembly)
        if args.command=='status':
            result=model.status()
        elif args.command=='train':
            if not args.position or not args.train_jsonl or not args.heldout_jsonl:
                parser.error('train requires --position, --train-jsonl and --heldout-jsonl')
            def load_jsonl(path):
                path=Path(path)
                if not path.is_file() or path.stat().st_size>5_000_000:
                    raise ValueError('Training JSONL file is missing or larger than 5 MB')
                values=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
                if not isinstance(values,list) or not values or any(not isinstance(x,dict) for x in values):
                    raise ValueError('Expect a nonempty JSONL record set')
                return values
            result=model.train(args.position,load_jsonl(args.train_jsonl),load_jsonl(args.heldout_jsonl),steps=args.steps)
        else:
            if not args.position or not args.prompt:
                parser.error('generate requires --position and --prompt')
            result=model.generate(args.position,args.prompt,max_new_bytes=args.max_new_bytes)
        print(json.dumps(result,indent=2,ensure_ascii=False))
    finally:
        assembly.close()


if __name__=='__main__':
    main()
