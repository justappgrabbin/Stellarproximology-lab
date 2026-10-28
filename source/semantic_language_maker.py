"""SYNTHIA semantic neural language maker. Uses the existing TRIDENT PyTorch model.
No remote provider, canned response bank, or pretrained model required.
A checkpoint is NOT fluent until trained on an appropriately sized corpus.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F

from model import Trident, TridentConfig

# Lossless Unicode encoding: bytes are not truncated, remapped, or hashed.
PAD, BOS, EOS, SEP = 256, 257, 258, 259
VOCAB_SIZE = 260
MODEL_VERSION = 1


class ByteCodec:
    def encode(self, text: str) -> list[int]:
        if not isinstance(text, str):
            raise TypeError('Text must be a string')
        return list(text.encode('utf-8'))

    def decode(self, tokens: list[int]) -> str:
        data = bytes(int(t) for t in tokens if 0 <= int(t) <= 255)
        return data.decode('utf-8', errors='replace')


@dataclass
class SemanticEdge:
    subject: str
    relation: str
    object: str
    source: str = 'owner-annotation'
    verified: bool = False


class MeaningGraph:
    """A provenance-aware, directed context graph, not an authority on reality."""
    def __init__(self):
        self.edges: list[SemanticEdge] = []

    def add(self, subject: str, relation: str, object_: str,
            *, source: str = 'owner-annotation', verified: bool = False):
        values = (subject, relation, object_)
        if not all(isinstance(x, str) and 0 < len(x) <= 256 for x in values):
            raise ValueError('Typed nonempty bounded relation required')
        self.edges.append(SemanticEdge(*values, source=source, verified=bool(verified)))

    def relevant(self, text: str) -> list[SemanticEdge]:
        q = set(re.findall(r'\w+', text.casefold()))
        return [edge for edge in self.edges if q.intersection(
            re.findall(r'\w+', edge.subject.casefold()) +
            re.findall(r'\w+', edge.object.casefold()))]


def _slot(text: str, width: int) -> int:
    # Index into an observed feature bucket, never an entity identifier.
    return int.from_bytes(hashlib.blake2s(text.encode('utf-8'), digest_size=4).digest(), 'big') % width


def semantic_features(prompt: str, *, relations: list[dict] | None = None,
                      morphology: list[dict] | None = None,
                      style: str = 'neutral', human_design: dict | None = None,
                      klein: Any = None) -> torch.Tensor:
    """Eight tool channels x 32 differentiable numeric inputs.

    Channels: [0] DISEMINER [1] AUTOLING [2] ATO [3] MESSY
    [4] Morphology [5] semantic spacetime [6] style/grammar [7] HD metadata.
    Real canonical tool measurements may be supplied in ``klein`` and ARE NOT
    replaced; hand-annotated context is additive. No chart determines truth.
    """
    f = torch.zeros(8, 32, dtype=torch.float32)
    if klein is not None:
        k = torch.as_tensor(klein, dtype=torch.float32)
        if k.shape != (8, 32) or not torch.isfinite(k).all():
            raise ValueError('Klein tool output must be finite [8,32]')
        f += k
    tokens = re.findall(r'\w+', prompt.casefold(), flags=re.UNICODE)
    for word in tokens:
        f[0, _slot('co:'+word, 32)] += 0.1
    f[1, 0] += min(len(tokens) / 64.0, 1.0)
    f[6, _slot('style:'+style, 32)] += 1.0
    for edge in (relations or [])[:32]:
        if not {'subject','relation','object'} <= edge.keys():
            raise ValueError('Relation needs subject, relation, object')
        # Preserve relation type and direction; unverified assertions are not facts.
        item = f"{edge['subject']}|{edge['relation']}|{edge['object']}"
        f[5, _slot(item, 32)] += 0.5 if edge.get('verified') else 0.2
    for m in (morphology or [])[:64]:
        # Bantu noun classes and concords are language-specific annotations,
        # not predicted from arbitrary noun meaning.
        if 'noun_class' in m:
            f[4, _slot('nc:'+str(m['noun_class']), 32)] += 0.5
        if 'concord' in m:
            f[4, _slot('agr:'+str(m['concord']), 32)] += 0.5
        if 'morphemes' in m:
            for part in m['morphemes'][:8]:
                f[4, _slot('m:'+str(part), 32)] += 0.15
    if human_design:
        # Human Design is a voluntary symbolic context, not an empirical
        # predictor of personality, grammar, or factual correctness.
        for key, value in list(human_design.items())[:12]:
            f[7, _slot(f'{key}:{value}', 32)] += 0.1
    return f.clamp(-3, 3)


def canonical_klein_features(bridge: str | Path, prompt: str,
                             annotations: dict | None = None) -> dict:
    """Read actual JS Klein/ATO/Tool Factory/Model Maker results, fail closed.
    The bridge must point to a locally approved SynthAi Computer checkout.
    """
    command = ['node', str(Path(bridge).resolve())]
    payload = {'text':prompt, **(annotations or {})}
    cp = subprocess.run(command, input=json.dumps(payload), text=True,
                        capture_output=True, timeout=20, check=True)
    obj = json.loads(cp.stdout)
    if not obj.get('executed') or not isinstance(obj.get('klein'),list):
        raise RuntimeError('Canonical tools did not execute')
    arr = torch.as_tensor(obj['klein'],dtype=torch.float32)
    if arr.shape != (8,32) or not torch.isfinite(arr).all():
        raise RuntimeError('Invalid tool feature dimensions')
    return obj


class RelationalTrident(Trident):
    """Extend, never overwrite, the existing trainable TRIDENT model.
    Bilinear relation operator composes two mathematical word expressions
    into a predicted target representation: relation(subject, predicate)->object.
    """
    def __init__(self, cfg=None):
        super().__init__(cfg)
        d = self.cfg.d_model
        self.rel_composer = nn.Bilinear(d, d, d)
        self.morph_gru = nn.GRU(d, 32, batch_first=True, bidirectional=True)
        self.morph_boundary = nn.Linear(64, 2)
        self.morph_noun_class = nn.Linear(64, 24)

    def word_embedding(self, word: str) -> torch.Tensor:
        ids = torch.tensor(list(word.encode('utf-8')) or [32],
                           dtype=torch.long,device=self.embed.weight.device)
        return self.embed(ids).mean(dim=0)

    def morph_forward(self, surface: str):
        chars = list(surface.encode('utf-8'))
        if not chars: raise ValueError('Empty morphological surface')
        ids = torch.tensor(chars, dtype=torch.long, device=self.embed.weight.device)[None,:]
        hidden, _ = self.morph_gru(self.embed(ids))
        boundary = self.morph_boundary(hidden)[0]       # [UTF8 bytes, 2]
        classes = self.morph_noun_class(hidden.mean(dim=1))[0]  # 24 possible labels
        return boundary, classes

    def relation_scores(self, subject: str, predicate: str, object_: str):
        a = self.word_embedding(subject)
        r = self.word_embedding(predicate)
        b = self.word_embedding(object_)
        target = self.rel_composer(a,r)
        return (F.cosine_similarity(target,b,dim=0),
                F.cosine_similarity(target,a,dim=0))


def annotated_corpus(path: str | Path) -> list[dict]:
    rows = []
    with open(path, encoding='utf-8') as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row.get('prompt'), str) or not isinstance(row.get('response'), str):
                raise ValueError(f'Line {line_number}: expected prompt and response strings')
            if not row['response'].strip():
                raise ValueError(f'Line {line_number}: response cannot be empty')
            rows.append(row)
    if not rows:
        raise ValueError('No approved training examples')
    return rows


class NeuralMaker:
    """Trains the *actual* existing TRIDENT decoder on contextual replies."""
    def __init__(self, *, model=None, max_seq_len: int = 160, device: str = 'cpu'):
        if max_seq_len < 24 or max_seq_len > 256:
            raise ValueError('max_seq_len must be between 24 and 256')
        self.codec = ByteCodec()
        self.max_seq_len = max_seq_len
        self.device = torch.device(device)
        if model is None:
            cfg = TridentConfig()
            cfg.vocab_size = VOCAB_SIZE
            cfg.max_seq_len = max_seq_len
            cfg.d_model = 64
            cfg.n_heads = 4
            cfg.n_layers = 2
            cfg.d_ff = 192
            cfg.head_layers = 1
            cfg.head_d_ff = 96
            cfg.rag_dim = 64
            cfg.dropout = 0.05
            model = RelationalTrident(cfg)
        if model.cfg.vocab_size not in (VOCAB_SIZE, 4096):
            raise ValueError('TRIDENT must have vocab_size=260 or legacy 4096')
        self.model = model.to(self.device)
        self.steps = 0
        self.seen = 0

    @classmethod
    def from_existing_trident(cls, checkpoint: str | Path) -> 'NeuralMaker':
        """Warm-start using an existing SAME-USER TRIDENT checkpoint unmodified.
        Expects the original 4096-token model's state dict, no unsafe pickle.
        """
        cfg = TridentConfig()   # Original 128/4-layer/4096-vocab architecture.
        model = RelationalTrident(cfg)
        saved = torch.load(checkpoint,map_location='cpu',weights_only=True)
        if isinstance(saved,dict) and isinstance(saved.get('model_state_dict'),dict):
            saved=saved['model_state_dict']
        missing,unexpected=model.load_state_dict(saved,strict=False)
        allowed={k for k in model.state_dict() if k.startswith(('rel_composer.','morph_gru.','morph_boundary.','morph_noun_class.'))}
        if set(missing)!=allowed or unexpected:
            raise RuntimeError(f'Not an original TRIDENT state dict: {missing}, {unexpected}')
        # Prior training is preserved, but no claim it was conversationally fluent.
        return cls(model=model,max_seq_len=cfg.max_seq_len)

    def _example(self, row: dict) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        # Conditional next-token loss ONLY on answer, not the user prompt.
        prompt = self.codec.encode('User: ' + row['prompt'].strip() + '\nSynthia: ')
        reply = self.codec.encode(row['response']) + [EOS]
        # Keep the full reply whenever possible; truncate an oversized prompt.
        max_tokens = self.max_seq_len
        if len(reply) >= max_tokens - 1:
            reply = reply[:max_tokens - 2] + [EOS]
        room = max_tokens - 1 - len(reply)
        prompt = prompt[-room:] if room else []
        sequence = [BOS] + prompt + reply
        inp = torch.tensor(sequence[:-1], dtype=torch.long, device=self.device)[None, :]
        tgt = torch.tensor(sequence[1:], dtype=torch.long, device=self.device)[None, :]
        # Target position i predicts sequence[i+1]. Mask prompt target tokens.
        tgt[0, :len(prompt)] = -100
        if not torch.any(tgt != -100):
            raise RuntimeError('No trainable targets')
        feature = semantic_features(
            row['prompt'], relations=row.get('relations'), morphology=row.get('morphology'),
            style=row.get('style','neutral'), human_design=row.get('human_design'),
            klein=row.get('klein'))[None].to(self.device)
        return inp, tgt, feature

    def fit(self, rows: list[dict], *, steps: int = 30,
            lr: float = 0.001, seed: int = 13) -> dict:
        if not rows or steps < 1 or not 0 < lr <= 0.1:
            raise ValueError('Require nonempty examples, positive steps and learning rate')
        torch.manual_seed(seed)
        random.seed(seed)
        optimizer = torch.optim.AdamW(self.model.parameters(), lr=lr, weight_decay=0.01)
        self.model.train()
        losses = []
        for step in range(steps):
            row = rows[step % len(rows)]
            x, y, k = self._example(row)
            optimizer.zero_grad(set_to_none=True)
            logits = self.model(x, head=row.get('head','research'), klein=k)
            loss = F.cross_entropy(logits.flatten(0,1), y.flatten(), ignore_index=-100)
            # Contrastive compositional objective: directed relation differs
            # from subject identity. These are training labels, not verified facts.
            for m in row.get('morphology', [])[:4]:
                parts = m.get('morphemes') or []
                if parts and all(isinstance(x,str) and x for x in parts):
                    surface = ''.join(parts)
                    if len(surface.encode('utf-8')) <= 128:
                        boundaries, cl = self.model.morph_forward(surface)
                        tags = torch.zeros(len(surface.encode('utf-8')), dtype=torch.long,
                                           device=self.device)
                        position = 0
                        for part in parts[:-1]:
                            position += len(part.encode('utf-8'))
                            tags[position-1] = 1
                        loss = loss + 0.04 * F.cross_entropy(boundaries,tags)
                        number = m.get('noun_class')
                        if isinstance(number,int) and 1 <= number <= 24:
                            loss = loss + 0.02 * F.cross_entropy(cl[None],
                                torch.tensor([number-1],device=self.device))
            for edge in row.get('relations', [])[:4]:
                pos, neg = self.model.relation_scores(
                    str(edge['subject']),str(edge['relation']),str(edge['object']))
                loss = loss + 0.05 * F.softplus(neg-pos+0.2)
            if not torch.isfinite(loss):
                raise RuntimeError('Nonfinite training loss')
            loss.backward()
            torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.detach()))
            self.steps += 1
        self.seen += len(rows)
        return {'steps': self.steps, 'examples': self.seen, 'loss_initial': losses[0],
                'loss_final': losses[-1], 'parameters': self.model.param_count(),
                'trained': self.steps > 0}

    @torch.no_grad()
    def generate(self, prompt: str, *, max_new_bytes: int = 160,
                 temperature: float = 0.8, seed: int | None = None,
                 features: dict | None = None, head: str = 'research',
                 top_k: int = 32) -> dict:
        if self.steps == 0:
            return {'ready': False, 'reason': 'untrained-neural-model', 'text': None}
        if not 0.05 <= temperature <= 5 or not 1 <= max_new_bytes <= 512:
            raise ValueError('Temperature or generation length out of bounds')
        if seed is not None:
            torch.manual_seed(seed)
        context = self.codec.encode('User: ' + prompt.strip() + '\nSynthia: ')
        ids = [BOS] + context[-(self.max_seq_len-2):]
        k = semantic_features(prompt, **(features or {}))[None].to(self.device)
        output = []
        self.model.eval()
        for _ in range(max_new_bytes):
            x = torch.tensor(ids[-self.max_seq_len:], device=self.device)[None,:]
            logits = self.model(x, klein=k, head=head)[:, -1] / temperature
            logits[:, PAD] = -float('inf')
            logits[:, BOS] = -float('inf')
            logits[:, SEP] = -float('inf')
            # Legacy 4096-way TRIDENT logits cannot emit unmapped byte IDs.
            if logits.shape[-1] > VOCAB_SIZE:
                logits[:, VOCAB_SIZE:] = -float('inf')
            if top_k > 0:
                v = logits.topk(min(top_k, logits.shape[-1])).values[:, -1:]
                logits = logits.masked_fill(logits < v, -float('inf'))
            p = F.softmax(logits, dim=-1)
            nxt = int(torch.multinomial(p, 1).item())
            if nxt == EOS:
                break
            output.append(nxt)
            ids.append(nxt)
        return {'ready': True, 'text': self.codec.decode(output), 'bytes': len(output),
                'generatedBy': 'trained-trident-autoregressive-neural-decoder',
                'neuralSteps': self.steps, 'probabilistic': True}

    @torch.no_grad()
    def morphology(self, surface: str) -> dict:
        """Neural morpheme-boundary/noun-class hypothesis; NOT a verified gloss."""
        self.model.eval()
        boundary, classes = self.model.morph_forward(surface)
        probability = F.softmax(boundary,dim=-1)[:,1].tolist()
        class_prob = F.softmax(classes,dim=-1)
        return {'surface':surface,'boundaryScoresPerUtf8Byte':probability,
                'nounClassHypothesis':int(torch.argmax(class_prob))+1,
                'classConfidence':float(class_prob.max()),
                'note':'Requires language-specific annotated training; boundaries are byte-indexed'}

    @torch.no_grad()
    def interpret(self, text: str, *, graph: MeaningGraph | None = None) -> dict:
        """Inspect learned multi-scale embeddings and directed graph scores."""
        words = re.findall(r"[\w'-]+",text,flags=re.UNICODE)
        vectors = [self.model.word_embedding(w) for w in words[:48]]
        if not vectors:
            return {'words':[], 'phraseVector':[], 'relations':[]}
        phrase = torch.stack(vectors).mean(dim=0)
        scored=[]
        if graph:
            for edge in graph.relevant(text)[:12]:
                s,neg=self.model.relation_scores(edge.subject,edge.relation,edge.object)
                scored.append({'subject':edge.subject,'relation':edge.relation,
                               'object':edge.object,'source':edge.source,
                               'verified':edge.verified,
                               'learnedScore':float(s),'identityContrast':float(neg)})
        return {'words':words[:48], 'phraseVector':phrase.tolist(), 'relations':scored,
                'note':'Learned numerical representation; not verified entailment'}

    def paraphrase(self, prompt: str, *, candidates: int = 4, seed: int = 3,
                   features: dict | None = None) -> dict:
        """Monte Carlo sample neural continuations; inspect, do not assert entailment."""
        if not 1 <= candidates <= 16:
            raise ValueError('candidates must be 1..16')
        options = [self.generate(prompt, seed=seed+i, features=features)
                   for i in range(candidates)]
        good = [x for x in options if x.get('ready') and x.get('text','').strip()]
        if not good:
            return {'ready': False, 'text': None, 'candidates': options,
                    'reason': 'no-usable-neural-continuation'}
        # No claim of logical equivalence: score surface fluency only.
        def score(x):
            s = x['text']
            printable = sum(ch.isprintable() or ch in '\n\t' for ch in s)/max(len(s),1)
            repetition = len(set(s.split())) / max(1, len(s.split()))
            return printable + 0.25 * repetition
        best = max(good, key=score)
        return {'ready': True, 'text': best['text'], 'candidates': options,
                'selection': 'Monte-Carlo surface-score; semantic equivalence unverified'}

    def save(self, directory: str | Path) -> None:
        p = Path(directory)
        p.mkdir(parents=True, exist_ok=True)
        torch.save(self.model.state_dict(), p/'weights.pt')
        meta = {'format':'synthia-neural-language', 'version':MODEL_VERSION,
                'config':vars(self.model.cfg), 'steps':self.steps, 'seen':self.seen,
                'codec':'lossless-utf8-byte-v1'}
        (p/'config.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')

    @classmethod
    def load(cls, directory: str | Path):
        p=Path(directory)
        meta=json.loads((p/'config.json').read_text(encoding='utf-8'))
        if meta.get('format')!='synthia-neural-language' or meta.get('version')!=MODEL_VERSION:
            raise ValueError('Unknown model checkpoint format')
        cfg=TridentConfig()
        for k,v in meta['config'].items():
            setattr(cfg,k,v)
        model=RelationalTrident(cfg)
        model.load_state_dict(torch.load(p/'weights.pt', map_location='cpu', weights_only=True))
        maker=cls(model=model,max_seq_len=cfg.max_seq_len)
        maker.steps=meta['steps']
        maker.seen=meta['seen']
        return maker


def main():
    parser=argparse.ArgumentParser(description='Local neural semantic language model trainer')
    sub=parser.add_subparsers(dest='action', required=True)
    train=sub.add_parser('train')
    train.add_argument('--corpus', required=True)
    train.add_argument('--output', required=True)
    train.add_argument('--steps',type=int, default=100)
    train.add_argument('--bridge',default=None,help='Path to canonical Klein JS bridge')
    train.add_argument('--inherit-existing',default=None,help='Existing TRIDENT state dict to warm-start without overwriting')
    talk=sub.add_parser('talk')
    talk.add_argument('--model',required=True)
    talk.add_argument('--prompt',required=True)
    talk.add_argument('--seed',type=int,default=11)
    talk.add_argument('--samples',type=int,default=3)
    talk.add_argument('--bridge',default=None,help='Path to canonical Klein JS bridge')
    opts=parser.parse_args()
    if opts.action=='train':
        maker=(NeuralMaker.from_existing_trident(opts.inherit_existing)
               if opts.inherit_existing else NeuralMaker())
        rows=annotated_corpus(opts.corpus)
        if opts.bridge:
            for row in rows:
                evidence=canonical_klein_features(opts.bridge,row['prompt'],row)
                row['klein']=evidence['klein']
        stats=maker.fit(rows,steps=opts.steps)
        maker.save(opts.output)
        print(json.dumps(stats))
    else:
        maker=NeuralMaker.load(opts.model)
        f=None
        if opts.bridge:
            evidence=canonical_klein_features(opts.bridge,opts.prompt)
            f={'klein':evidence['klein']}
        print(json.dumps(maker.paraphrase(opts.prompt,candidates=opts.samples,
                                         seed=opts.seed,features=f),ensure_ascii=False))

if __name__=='__main__':
    main()