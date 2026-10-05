#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import random
import shutil
import zipfile
from pathlib import Path


class QuietProgress:
    def __call__(self, *_args, **_kwargs):
        return None


def load_modelmaker(app_path: Path):
    spec = importlib.util.spec_from_file_location("stellar_modelmaker_app", app_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load Modelmaker app from {app_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fingerprint_dir(path: Path) -> str:
    h = hashlib.sha256()
    for file in sorted(p for p in path.rglob("*") if p.is_file() and p.name != "dimension_manifest.json"):
        h.update(file.relative_to(path).as_posix().encode())
        h.update(b"\0")
        h.update(hashlib.sha256(file.read_bytes()).digest())
    return h.hexdigest()


def safe_name(value: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_." else "-" for c in value).strip("-._")
    return cleaned or "carrier"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a local descendant model from relational experience.")
    parser.add_argument("--parent-model-dir", required=True, type=Path)
    parser.add_argument("--experience-file", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--carrier-id", required=True)
    parser.add_argument("--evolution-index", required=True, type=int)
    parser.add_argument(
        "--modelmaker-app",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "Modelmaker-repair" / "app.py",
    )
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    manifest_path = args.parent_model_dir / "dimension_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    corpus_path_raw = manifest.get("trainingCorpusPath")
    if not corpus_path_raw:
        raise SystemExit("Parent model has no trainingCorpusPath; rebuild it with the v2 dimensional builder before autonomous evolution.")
    corpus_path = Path(corpus_path_raw)
    if not corpus_path.is_file():
        raise SystemExit(f"Parent corpus is unavailable locally: {corpus_path}")

    base_corpus = corpus_path.read_text(encoding="utf-8")
    experience = args.experience_file.read_text(encoding="utf-8")
    if not experience.strip():
        raise SystemExit("No relational experience was supplied.")

    combined = (
        base_corpus
        + "\n\n# RELATIONAL EXPERIENCE — DESCENDANT TRAINING MATERIAL\n"
        + experience
    )

    params = dict(manifest.get("buildParams") or {})
    params.setdefault("vocab_size", 4096)
    params.setdefault("context_length", 128)
    params.setdefault("layers", 2)
    params.setdefault("heads", 4)
    params.setdefault("embedding_size", 256)
    params["epochs"] = max(1, min(2, int(params.get("epochs", 1))))
    params["batch_size"] = max(1, int(params.get("batch_size", 4)))
    params["learning_rate"] = min(float(params.get("learning_rate", 0.0003)), 0.0003)

    seed = int(manifest.get("seed", 1000)) + int(args.evolution_index)
    random.seed(seed)
    try:
        import torch
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except Exception:
        pass

    modelmaker = load_modelmaker(args.modelmaker_app)
    name = f"{manifest['modelId']}-{safe_name(args.carrier_id)}-e{args.evolution_index:06d}"
    summary, zip_path = modelmaker.train_model(
        name,
        combined,
        [],
        int(params["vocab_size"]),
        int(params["context_length"]),
        int(params["layers"]),
        int(params["heads"]),
        int(params["embedding_size"]),
        int(params["epochs"]),
        int(params["batch_size"]),
        float(params["learning_rate"]),
        False,
        progress=QuietProgress(),
    )
    if not zip_path:
        raise RuntimeError(f"Modelmaker failed: {summary}")

    if args.output_dir.exists():
        raise FileExistsError(f"Refusing to overwrite descendant model: {args.output_dir}")
    args.output_dir.mkdir(parents=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(args.output_dir)

    fingerprint = fingerprint_dir(args.output_dir)
    child_manifest = {
        "schema": "stellar.modelmaker.dimension.v2",
        "builder": "stellarproximology/Modelmaker",
        "dimension": manifest["dimension"],
        "modelId": name,
        "modelFingerprint": fingerprint,
        "parentModelFingerprint": manifest["modelFingerprint"],
        "carrierId": args.carrier_id,
        "evolutionIndex": args.evolution_index,
        "trainingCorpus": corpus_path.name,
        "trainingCorpusPath": str(corpus_path),
        "trainingCorpusSha256": manifest.get("trainingCorpusSha256"),
        "relationshipExperienceSha256": hashlib.sha256(experience.encode()).hexdigest(),
        "seed": seed,
        "offlineBuild": True,
        "buildParams": params,
    }
    (args.output_dir / "dimension_manifest.json").write_text(
        json.dumps(child_manifest, indent=2) + "\n",
        encoding="utf-8",
    )

    print(json.dumps({
        "ok": True,
        "modelDir": str(args.output_dir.resolve()),
        "modelId": name,
        "modelFingerprint": fingerprint,
        "parentModelFingerprint": manifest["modelFingerprint"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
