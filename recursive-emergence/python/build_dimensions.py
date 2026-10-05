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

DIMENSIONS = ("Movement", "Evolution", "Being", "Design")


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
        rel = file.relative_to(path).as_posix().encode()
        h.update(rel)
        h.update(b"\0")
        h.update(hashlib.sha256(file.read_bytes()).digest())
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build four real local dimensional LLMs using existing Modelmaker.")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--modelmaker-app",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "Modelmaker-repair" / "app.py",
    )
    args = parser.parse_args()

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

    config = json.loads(args.config.read_text(encoding="utf-8"))
    missing = [d for d in DIMENSIONS if d not in config]
    if missing:
        raise SystemExit(f"Missing dimension configs: {', '.join(missing)}")

    modelmaker = load_modelmaker(args.modelmaker_app)
    args.output.mkdir(parents=True, exist_ok=True)
    built = {}

    for index, dimension in enumerate(DIMENSIONS, start=1):
        spec = config[dimension]
        corpus_path = Path(spec["corpus"]).expanduser().resolve()
        if not corpus_path.is_file():
            raise FileNotFoundError(f"{dimension} corpus not found: {corpus_path}")
        corpus = corpus_path.read_text(encoding="utf-8")
        if len(corpus.strip()) < 200:
            raise ValueError(f"{dimension} corpus is too small for Modelmaker")

        seed = int(spec.get("seed", 1000 + index))
        random.seed(seed)
        try:
            import torch
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)
        except Exception:
            pass

        name = spec.get("name", f"synthia-{dimension.lower()}")
        summary, zip_path = modelmaker.train_model(
            name,
            corpus,
            [],
            int(spec.get("vocab_size", 4096)),
            int(spec.get("context_length", 128)),
            int(spec.get("layers", 2)),
            int(spec.get("heads", 4)),
            int(spec.get("embedding_size", 256)),
            int(spec.get("epochs", 2)),
            int(spec.get("batch_size", 4)),
            float(spec.get("learning_rate", 0.0003)),
            False,
            progress=QuietProgress(),
        )
        if not zip_path:
            raise RuntimeError(f"Modelmaker failed for {dimension}: {summary}")

        destination = args.output / dimension
        if destination.exists():
            shutil.rmtree(destination)
        destination.mkdir(parents=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(destination)

        fingerprint = fingerprint_dir(destination)
        manifest = {
            "schema": "stellar.modelmaker.dimension.v1",
            "builder": "stellarproximology/Modelmaker",
            "dimension": dimension,
            "modelId": name,
            "modelFingerprint": fingerprint,
            "parentModelFingerprint": spec.get("parent_model_fingerprint"),
            "trainingCorpus": corpus_path.name,
            "trainingCorpusSha256": hashlib.sha256(corpus.encode()).hexdigest(),
            "seed": seed,
            "offlineBuild": True,
        }
        (destination / "dimension_manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )
        built[dimension] = {
            "path": str(destination.resolve()),
            "modelId": name,
            "modelFingerprint": fingerprint,
        }

    (args.output / "models.json").write_text(json.dumps(built, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "models": built}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
