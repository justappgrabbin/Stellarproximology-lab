from __future__ import annotations
import json
import math
from pathlib import Path
import torch
from tokenizers import ByteLevelBPETokenizer
from transformers import GPT2Config, GPT2LMHeadModel, GPT2TokenizerFast


def make_sequences(token_ids, context_length):
    length = int(context_length)
    if length < 4:
        raise ValueError('Context length must be at least four tokens')
    usable = len(token_ids) // length * length
    if usable < length:
        raise ValueError(f'Need at least {length} tokens; got {len(token_ids)}')
    return torch.tensor(token_ids[:usable], dtype=torch.long).view(-1, length)


def build_tokenizer(text, output_dir, vocab_size):
    directory = Path(output_dir) / 'tokenizer_build'
    directory.mkdir(parents=True, exist_ok=True)
    trainer = ByteLevelBPETokenizer()
    trainer.train_from_iterator([text], vocab_size=max(260, int(vocab_size)), min_frequency=1,
                                special_tokens=['<|pad|>', '<|bos|>', '<|eos|>', '<|unk|>'])
    trainer.save_model(str(directory))
    tokenizer = GPT2TokenizerFast.from_pretrained(str(directory), bos_token='<|bos|>',
        eos_token='<|eos|>', pad_token='<|pad|>', unk_token='<|unk|>')
    if len(tokenizer) < 260 or not tokenizer.encode('test'):
        raise ValueError('Tokenizer is empty or lacks the byte alphabet')
    return tokenizer


def causal_loss(model, batch):
    # GPT2 shifts labels internally. Already-shifted labels train two tokens ahead.
    return model(input_ids=batch, attention_mask=torch.ones_like(batch), labels=batch).loss


def fit_model(text, output_dir, *, context_length=128, layers=2, heads=4,
              embedding_size=256, vocab_size=4096, epochs=2, batch_size=4,
              learning_rate=.0003, seed=42, base_checkpoint=None, progress=None):
    shape = [context_length, layers, heads, embedding_size, epochs, batch_size]
    if any(not isinstance(v, int) or v < 1 for v in shape):
        raise ValueError('Model sizes, epochs and batch size must be positive integers')
    if context_length < 4 or context_length > 2048 or embedding_size % heads:
        raise ValueError('Context must be 4..2048 and embedding size divisible by heads')
    if not math.isfinite(learning_rate) or not 0 < learning_rate <= .1:
        raise ValueError('Learning rate must be finite and in (0, .1]')
    if len(text.strip()) < 200:
        raise ValueError('Add at least 200 characters of training material')
    torch.manual_seed(seed)
    # CPU is the explicit runtime contract, even on machines that have CUDA.
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    # Hold out trailing source text before learning the tokenizer, so evaluation
    # data does not teach its vocabulary/merges. Tiny corpora may have no holdout.
    cut = int(len(text) * .9)
    train_text, held_text = text[:cut], text[cut:]
    if base_checkpoint:
        tokenizer = GPT2TokenizerFast.from_pretrained(base_checkpoint, local_files_only=True)
        model = GPT2LMHeadModel.from_pretrained(base_checkpoint, local_files_only=True).cpu()
        context_length = min(context_length, model.config.n_positions)
    else:
        tokenizer = build_tokenizer(train_text, directory, vocab_size)
        config = GPT2Config(vocab_size=len(tokenizer), n_positions=context_length, n_ctx=context_length,
            n_embd=embedding_size, n_layer=layers, n_head=heads,
            bos_token_id=tokenizer.bos_token_id, eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.pad_token_id)
        model = GPT2LMHeadModel(config).cpu()
    train = make_sequences(tokenizer.encode(train_text, add_special_tokens=False), context_length)
    held_ids = tokenizer.encode(held_text, add_special_tokens=False)
    held = make_sequences(held_ids, context_length) if len(held_ids) >= context_length else None
    parameters = sum(p.numel() for p in model.parameters())
    before = model.transformer.wte.weight.detach().clone()
    def measure(batch):
        model.eval()
        with torch.no_grad(): return float(causal_loss(model, batch[:batch_size]))
    initial = measure(train)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    losses, steps = [], 0
    total_steps = epochs * math.ceil(len(train) / batch_size)
    for epoch in range(epochs):
        model.train()
        permutation = torch.randperm(len(train))
        total = 0.
        count = 0
        for start in range(0, len(train), batch_size):
            batch = train[permutation[start:start + batch_size]]
            optimizer.zero_grad(set_to_none=True)
            loss = causal_loss(model, batch)
            if not torch.isfinite(loss): raise ValueError('Non-finite training loss; checkpoint not exported')
            loss.backward()
            norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.)
            if not torch.isfinite(norm): raise ValueError('Non-finite gradients; checkpoint not exported')
            optimizer.step()
            total += float(loss.detach()) * len(batch)
            count += len(batch)
            steps += 1
            if progress: progress(.16 + .68 * steps / total_steps, desc=f'Epoch {epoch + 1}/{epochs} · CPU')
        losses.append(total / count)
    delta = float(torch.linalg.vector_norm(model.transformer.wte.weight.detach() - before))
    if not math.isfinite(delta) or delta <= 0: raise ValueError('No finite weight update occurred')
    if any(not torch.isfinite(p).all() for p in model.parameters()): raise ValueError('Non-finite model weights')
    final = measure(train)
    validation = measure(held) if held is not None else None
    model.eval()
    with torch.no_grad(): reference = model(train[:1]).logits
    model.save_pretrained(directory, safe_serialization=True)
    tokenizer.save_pretrained(directory)
    reloaded = GPT2LMHeadModel.from_pretrained(directory, local_files_only=True).cpu().eval()
    with torch.no_grad(): actual = reloaded(train[:1]).logits
    if not torch.allclose(reference, actual, atol=1e-6): raise ValueError('Saved weights fail reload equivalence')
    meta = {'schema':'modelmaker.training.v2', 'parameters':parameters, 'device':'cpu',
        'context_length':context_length,'vocab_size':len(tokenizer),'epochs':epochs,'optimizer_steps':steps,
        'initial_loss':initial,'final_loss':final,'loss_history':losses,'validation_loss':validation,
        'validation_status':'trailing-text-holdout' if held is not None else 'insufficient-held-out-tokens',
        'embedding_update_norm':delta,'reload_verified':True,'train_sequences':len(train),
        'base_checkpoint':str(base_checkpoint) if base_checkpoint else None,
        'objective':'causal next-token supervision; response correctness is evaluated separately',
        'labels_policy':'labels=input_ids; one internal causal shift'}
    (directory / 'modelmaker_build.json').write_text(json.dumps(meta, indent=2))
    (directory / 'README.md').write_text(f'---\nlibrary_name: transformers\npipeline_tag: text-generation\n---\n\n# Modelmaker checkpoint\n\nCPU-trained GPT-2 causal model.\n\nTraining receipts: `modelmaker_build.json`. '\
        'Weights were updated and reloaded locally. Small-corpus training does not establish general reasoning or coding competence. '\
        'Klein tools and retrieval are external runtime components; they are not embedded inside these weights.\n')
    return meta
