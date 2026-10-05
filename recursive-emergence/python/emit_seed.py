#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def fingerprint_dir(path: Path) -> str:
    h = hashlib.sha256()
    for file in sorted(p for p in path.rglob("*") if p.is_file() and p.name != "dimension_manifest.json"):
        h.update(file.relative_to(path).as_posix().encode())
        h.update(b"\0")
        h.update(hashlib.sha256(file.read_bytes()).digest())
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--dimension", required=True)
    args = parser.parse_args()

    request = json.loads(sys.stdin.read() or "{}")
    prompt = str(request.get("prompt", "")).strip()
    if not prompt:
        raise SystemExit("prompt is required")

    manifest_path = args.model_dir / "dimension_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("dimension") != args.dimension:
        raise SystemExit("dimension mismatch")
    fingerprint = fingerprint_dir(args.model_dir)
    if fingerprint != manifest.get("modelFingerprint"):
        raise SystemExit("model fingerprint mismatch")

    from transformers import GPT2LMHeadModel, GPT2TokenizerFast
    import torch

    tokenizer = GPT2TokenizerFast.from_pretrained(args.model_dir, local_files_only=True)
    model = GPT2LMHeadModel.from_pretrained(args.model_dir, local_files_only=True)
    model.eval()

    encoded = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=max(8, int(model.config.n_positions) - 32),
    )
    with torch.no_grad():
        output = model.generate(
            **encoded,
            max_new_tokens=min(32, max(4, int(model.config.n_positions) // 4)),
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    new_tokens = output[0][encoded["input_ids"].shape[1]:]
    text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
    if not text:
        text = tokenizer.decode(output[0], skip_special_tokens=True).strip()
    if not text:
        raise SystemExit("local model produced empty text")

    print(json.dumps({
        "schema": "stellar.modelmaker.emission.v1",
        "modelId": manifest["modelId"],
        "modelFingerprint": fingerprint,
        "dimension": args.dimension,
        "generation": request.get("generation", 1),
        "parentWitness": request.get("parentWitness"),
        "text": text,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
