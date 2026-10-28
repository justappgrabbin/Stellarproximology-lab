"""Standalone copy of existing SYNTH AI / Synthai2 TRIDENT model architecture.
Source: justappgrabbin/Synthai2, synthia-server/model.py (feature/trident-semantic-reasoning-20261026).
Keep public class/module names for checkpoint compatibility.
"""
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

class TridentConfig:
    vocab_size = 4096
    max_seq_len = 256
    d_model = 128
    n_heads = 4
    n_layers = 4
    d_ff = 512
    dropout = 0.1
    head_layers = 1
    head_d_ff = 256
    rag_top_k = 3
    rag_dim = 128
    heads = ['code','math','research']

class PositionalEncoding(nn.Module):
    def __init__(self,d_model,max_len=512,dropout=.1):
        super().__init__()
        self.drop=nn.Dropout(dropout)
        pe=torch.zeros(max_len,d_model)
        pos=torch.arange(max_len).unsqueeze(1).float()
        div=torch.exp(torch.arange(0,d_model,2).float()*(-math.log(10000.)/d_model))
        pe[:,0::2]=torch.sin(pos*div)
        pe[:,1::2]=torch.cos(pos*div)
        self.register_buffer('pe',pe.unsqueeze(0))
    def forward(self,x): return self.drop(x+self.pe[:,:x.size(1)])

class TransformerBlock(nn.Module):
    def __init__(self,d_model,n_heads,d_ff,dropout=.1):
        super().__init__()
        self.attn=nn.MultiheadAttention(d_model,n_heads,dropout=dropout,batch_first=True)
        self.ff=nn.Sequential(nn.Linear(d_model,d_ff),nn.GELU(),nn.Dropout(dropout),nn.Linear(d_ff,d_model))
        self.ln1=nn.LayerNorm(d_model)
        self.ln2=nn.LayerNorm(d_model)
        self.drop=nn.Dropout(dropout)
    def forward(self,x,mask=None):
        a,_=self.attn(x,x,x,attn_mask=mask,is_causal=(mask is None))
        x=self.ln1(x+self.drop(a))
        return self.ln2(x+self.drop(self.ff(x)))

class RAGFusionGate(nn.Module):
    def __init__(self,d_model,rag_dim):
        super().__init__()
        self.xattn=nn.MultiheadAttention(d_model,4,batch_first=True,kdim=rag_dim,vdim=rag_dim)
        self.gate=nn.Linear(d_model*2,d_model)
        self.ln=nn.LayerNorm(d_model)
    def forward(self,x,chunks):
        if chunks is None: return x
        ctx,_=self.xattn(x,chunks,chunks)
        fused=torch.sigmoid(self.gate(torch.cat([x,ctx],dim=-1)))*ctx
        return self.ln(x+fused)

class SpecialistHead(nn.Module):
    def __init__(self,cfg,name):
        super().__init__()
        self.name=name
        self.rag_gate=RAGFusionGate(cfg.d_model,cfg.rag_dim)
        self.layers=nn.ModuleList([TransformerBlock(cfg.d_model,cfg.n_heads,cfg.head_d_ff,cfg.dropout) for _ in range(cfg.head_layers)])
        self.ln_out=nn.LayerNorm(cfg.d_model)
        self.lm_head=nn.Linear(cfg.d_model,cfg.vocab_size,bias=False)
    def forward(self,x,chunks=None,mask=None):
        x=self.rag_gate(x,chunks)
        for layer in self.layers: x=layer(x,mask)
        return self.lm_head(self.ln_out(x))

class HeadRouter(nn.Module):
    def __init__(self,d_model,n=3):
        super().__init__()
        self.proj=nn.Sequential(nn.Linear(d_model,64),nn.GELU(),nn.Linear(64,n))
    def forward(self,x): return F.softmax(self.proj(x.mean(dim=1)),dim=-1)

class Trident(nn.Module):
    def __init__(self,cfg=None):
        super().__init__()
        self.cfg=cfg or TridentConfig()
        c=self.cfg
        self.embed=nn.Embedding(c.vocab_size,c.d_model)
        self.pos_enc=PositionalEncoding(c.d_model,c.max_seq_len,c.dropout)
        self.backbone=nn.ModuleList([TransformerBlock(c.d_model,c.n_heads,c.d_ff,c.dropout) for _ in range(c.n_layers)])
        self.ln_back=nn.LayerNorm(c.d_model)
        self.klein_encoder=nn.Sequential(nn.Linear(32,c.rag_dim),nn.GELU(),nn.Linear(c.rag_dim,c.rag_dim),nn.LayerNorm(c.rag_dim))
        self.klein_backbone=nn.Linear(c.rag_dim,c.d_model,bias=False)
        self.klein_gain=nn.Parameter(torch.tensor(.25))
        self.router=HeadRouter(c.d_model,len(c.heads))
        self.heads=nn.ModuleDict({n:SpecialistHead(c,n) for n in c.heads})
        self.apply(self._init)
    def _init(self,m):
        if isinstance(m,nn.Linear):
            nn.init.normal_(m.weight,0,.02)
            if m.bias is not None: nn.init.zeros_(m.bias)
        elif isinstance(m,nn.Embedding): nn.init.normal_(m.weight,0,.02)
    def forward(self,ids,rag=None,head=None,return_router=False,klein=None):
        B,T=ids.shape
        mask=torch.triu(torch.full((T,T),float('-inf'),device=ids.device),diagonal=1)
        x=self.pos_enc(self.embed(ids))
        klein_embedding=None
        if klein is not None:
            if klein.ndim!=3 or klein.shape!=(B,8,32): raise ValueError('klein must be [batch,8 tools,32 features]')
            if not torch.isfinite(klein).all(): raise ValueError('nonfinite klein features')
            klein_embedding=self.klein_encoder(klein.to(device=ids.device,dtype=x.dtype))
            x=x+torch.tanh(self.klein_gain)*self.klein_backbone(klein_embedding.mean(dim=1)).unsqueeze(1)
        for layer in self.backbone: x=layer(x,mask)
        x=self.ln_back(x)
        rw=self.router(x)
        def _rag(name):
            chunks=rag.get(name) if isinstance(rag,dict) else rag
            if chunks is not None:
                if chunks.ndim!=3 or chunks.shape[0]!=B or chunks.shape[2]!=self.cfg.rag_dim:
                    raise ValueError('rag must be [batch,chunks,rag_dim]')
                chunks=chunks.to(device=ids.device,dtype=x.dtype)
            if klein_embedding is None: return chunks
            return klein_embedding if chunks is None else torch.cat((chunks,klein_embedding),dim=1)
        if head:
            logits=self.heads[head](x,_rag(head),mask)
        else:
            stack=torch.stack([self.heads[n](x,_rag(n),mask) for n in self.cfg.heads],dim=1)
            logits=(stack*rw.unsqueeze(-1).unsqueeze(-1)).sum(dim=1)
        return (logits,rw) if return_router else logits
    @torch.no_grad()
    def generate(self,ids,max_new=64,temp=.8,top_k=40,rag=None,head=None,klein=None):
        if temp<=0: raise ValueError('temp must be positive')
        if max_new<0 or max_new>256: raise ValueError('max_new out of bounds')
        self.eval()
        for _ in range(max_new):
            ctx=ids[:,-self.cfg.max_seq_len:]
            logits=self.forward(ctx,rag=rag,head=head,klein=klein)[:,-1,:]/temp
            if top_k:
                v,_=torch.topk(logits,min(top_k,logits.size(-1)))
                logits[logits<v[:,-1:]]=float('-inf')
            ids=torch.cat([ids,torch.multinomial(F.softmax(logits,-1),1)],dim=1)
        return ids
    def param_count(self): return sum(p.numel() for p in self.parameters() if p.requires_grad)