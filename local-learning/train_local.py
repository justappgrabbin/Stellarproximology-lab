"""Local training workers: dependency-free baseline and optional SynthAI2 TRIDENT."""
from __future__ import annotations
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import random


def write_json(path, value):
    path = Path(path)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False))
    temp.replace(path)


def windows(text, size=32):
    data = list(text.encode('utf-8'))
    return [data[i:i+size+1] for i in range(0, len(data)-size, size+1)]


def partition(items):
    if len(items) < 5:
        raise ValueError('Need at least five complete training windows (about 165 UTF-8 bytes).')
    evaluation = items[::5]
    training = [x for i, x in enumerate(items) if i % 5]
    return training, evaluation


def ngram_loss(sequences, counts, order):
    loss = total = 0
    for sequence in sequences:
        for index in range(1, len(sequence)):
            key = ','.join(str(b) for b in sequence[max(0, index-order):index])
            bucket = counts.get(key, {})
            # Add-one smoothing keeps held-out unseen bytes measurable.
            probability = (bucket.get(str(sequence[index]), 0) + 1) / (sum(bucket.values()) + 256)
            loss -= math.log(probability); total += 1
    return loss / total if total else None


def train_baseline(text, output, progress, order=2):
    training, evaluation = partition(windows(text))
    counts = defaultdict(Counter)
    for sequence in training:
        for index in range(1, len(sequence)):
            key = ','.join(str(b) for b in sequence[max(0, index-order):index])
            counts[key][str(sequence[index])] += 1
    plain = {key: dict(value) for key, value in counts.items()}
    artifact = {'engine': 'byte-ngram', 'order': order, 'counts': plain,
                'training_loss': ngram_loss(training, plain, order),
                'evaluation_loss': ngram_loss(evaluation, plain, order),
                'training_windows': len(training), 'evaluation_windows': len(evaluation)}
    Path(output).mkdir(parents=True, exist_ok=True)
    write_json(Path(output) / 'baseline.json', artifact)
    write_json(progress, {'status': 'completed', 'fraction': 1, 'epochs': 1,
                          'training_loss': artifact['training_loss'], 'evaluation_loss': artifact['evaluation_loss']})
    return artifact


def generate_baseline(artifact, prompt, max_new=80):
    rng = random.Random(42)
    data = list(prompt.encode('utf-8')) or [32]
    start = len(data)
    for _ in range(max_new):
        bucket = {}
        for width in range(min(artifact['order'], len(data)), 0, -1):
            key = ','.join(str(b) for b in data[-width:])
            bucket = artifact['counts'].get(key, {})
            if bucket: break
        if not bucket: break
        values = [(int(k), v) for k, v in bucket.items()]
        data.append(rng.choices([v[0] for v in values], weights=[v[1] for v in values])[0])
    return bytes(data[start:]).decode('utf-8', errors='replace')


def train_trident(text, output, progress, epochs=2, head='research', size=32):
    import torch
    import torch.nn.functional as F
    from trident_model import Trident, TridentConfig
    torch.set_num_threads(2)
    torch.manual_seed(42)
    cfg = TridentConfig()
    cfg.vocab_size = 256; cfg.max_seq_len = size; cfg.d_model = 32
    cfg.n_heads = 4; cfg.n_layers = 1; cfg.d_ff = 64
    cfg.head_layers = 1; cfg.head_d_ff = 64; cfg.rag_dim = 32
    training, evaluation = partition(windows(text, size))
    # Bound each run on CPU and disclose how much of the corpus was used.
    training = training[:512]; evaluation = evaluation[:128]
    data = torch.tensor(training, dtype=torch.long)
    held_out = torch.tensor(evaluation, dtype=torch.long)
    model = Trident(cfg)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0003)
    output = Path(output); output.mkdir(parents=True, exist_ok=True)
    history = []
    for epoch in range(epochs):
        model.train(); losses = []
        for start in range(0, len(data), 4):
            batch = data[start:start+4]
            optimizer.zero_grad(set_to_none=True)
            logits = model(batch[:, :-1], head=head)
            loss = F.cross_entropy(logits.reshape(-1, cfg.vocab_size), batch[:, 1:].reshape(-1))
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1)
            optimizer.step(); losses.append(float(loss.detach()))
            write_json(progress, {'status': 'running', 'fraction': (epoch+(start+len(batch))/len(data))/epochs,
                                  'epoch': epoch+1, 'epochs': epochs, 'training_loss': sum(losses)/len(losses)})
        model.eval(); evaluation_losses = []
        with torch.no_grad():
            for start in range(0, len(held_out), 4):
                batch = held_out[start:start+4]
                logits = model(batch[:, :-1], head=head)
                value = F.cross_entropy(logits.reshape(-1, cfg.vocab_size), batch[:, 1:].reshape(-1))
                evaluation_losses.append(float(value))
        row = {'epoch': epoch+1, 'training_loss': sum(losses)/len(losses),
               'evaluation_loss': sum(evaluation_losses)/len(evaluation_losses)}
        history.append(row)
        torch.save(model.state_dict(), output / 'trident.pt')
        config = {key: getattr(cfg, key) for key in ['vocab_size','max_seq_len','d_model','n_heads','n_layers','d_ff','dropout','head_layers','head_d_ff','rag_dim','heads']}
        write_json(output / 'config.json', {'config': config, 'head': head, 'engine': 'trident',
                                           'epochs_completed': epoch+1, 'history': history,
                                           'training_windows': len(training), 'evaluation_windows': len(evaluation),
                                           'tokenizer': 'UTF-8 bytes; vocabulary 0–255'})
    result = {**history[-1], 'parameters': model.param_count(), 'engine': 'trident'}
    write_json(progress, {'status': 'completed', 'fraction': 1, **result})
    return result


def generate_trident(directory, prompt, max_new=80):
    import torch
    from trident_model import Trident, TridentConfig
    directory = Path(directory)
    metadata = json.loads((directory / 'config.json').read_text())
    cfg = TridentConfig()
    for key, value in metadata['config'].items(): setattr(cfg, key, value)
    model = Trident(cfg)
    # Load only checkpoints created by this service; never import arbitrary model Python.
    model.load_state_dict(torch.load(directory / 'trident.pt', map_location='cpu', weights_only=True))
    torch.set_num_threads(2)
    ids = torch.tensor([list(prompt.encode('utf-8')) or [32]], dtype=torch.long)
    output = model.generate(ids, max_new=max_new, head=metadata['head'], temp=0.8)
    return bytes(output[0, ids.size(1):].tolist()).decode('utf-8', errors='replace')


def run(config_path):
    cfg = json.loads(Path(config_path).read_text())
    corpus = Path(cfg['corpus']).read_text()
    if cfg['engine'] == 'byte-ngram':
        return train_baseline(corpus, cfg['output'], cfg['progress'], cfg.get('order', 2))
    return train_trident(corpus, cfg['output'], cfg['progress'], cfg['epochs'], cfg['head'])


if __name__ == '__main__':
    import sys
    try: run(sys.argv[1])
    except Exception as error:
        cfg = json.loads(Path(sys.argv[1]).read_text())
        write_json(cfg['progress'], {'status': 'failed', 'error': str(error)})
        raise
