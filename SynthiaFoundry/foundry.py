from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

import torch
import torch.nn as nn
import torch.nn.functional as F


TEXT_EXTENSIONS = {
    ".txt", ".md", ".json", ".jsonl", ".py", ".js", ".mjs", ".cjs",
    ".ts", ".tsx", ".jsx", ".html", ".css", ".csv", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".xml", ".sql", ".sh",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")
    temp.replace(path)


def append_jsonl(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(value, ensure_ascii=False) + "\n")


def runtime_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def relative_or_absolute(path: Path, base: Path) -> str:
    try:
        return str(path.resolve().relative_to(base.resolve()))
    except ValueError:
        return str(path.resolve())


def collect_text(root: Path) -> tuple[str, list[dict[str, Any]]]:
    if not root.exists():
        raise FileNotFoundError(f"Corpus path does not exist: {root}")

    files = [root] if root.is_file() else sorted(p for p in root.rglob("*") if p.is_file())
    chunks: list[str] = []
    evidence: list[dict[str, Any]] = []

    for path in files:
        if path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        raw = path.read_bytes()
        text = raw.decode("utf-8", errors="ignore")
        if not text.strip():
            continue
        chunks.append(f"\n\n<<<SOURCE {path.name}>>>\n{text}\n<<<END SOURCE>>>\n")
        evidence.append(
            {
                "path": str(path),
                "sha256": sha256_bytes(raw),
                "bytes": len(raw),
            }
        )

    corpus = "".join(chunks)
    if len(corpus.encode("utf-8")) < 512:
        raise ValueError(
            f"Corpus is too small for a useful bootstrap model: {root}. "
            "Provide at least 512 UTF-8 bytes."
        )
    return corpus, evidence


@dataclass
class ModelConfig:
    vocab_size: int = 256
    context: int = 128
    embedding: int = 128
    layers: int = 2
    heads: int = 4
    ff_multiplier: int = 4


class TinyCausalLM(nn.Module):
    """A small byte-native causal transformer with no external tokenizer."""

    def __init__(self, config: ModelConfig):
        super().__init__()
        if config.embedding % config.heads != 0:
            raise ValueError("embedding must divide evenly by heads")
        self.config = config
        self.token_embedding = nn.Embedding(config.vocab_size, config.embedding)
        self.position_embedding = nn.Embedding(config.context, config.embedding)
        layer = nn.TransformerEncoderLayer(
            d_model=config.embedding,
            nhead=config.heads,
            dim_feedforward=config.embedding * config.ff_multiplier,
            dropout=0.0,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=config.layers)
        self.final_norm = nn.LayerNorm(config.embedding)
        self.lm_head = nn.Linear(config.embedding, config.vocab_size, bias=False)

    def forward(self, token_ids: torch.Tensor) -> torch.Tensor:
        batch, steps = token_ids.shape
        if steps > self.config.context:
            raise ValueError(
                f"Sequence length {steps} exceeds context {self.config.context}"
            )
        positions = torch.arange(steps, device=token_ids.device).unsqueeze(0)
        hidden = self.token_embedding(token_ids) + self.position_embedding(positions)
        causal_mask = torch.triu(
            torch.ones((steps, steps), device=token_ids.device, dtype=torch.bool),
            diagonal=1,
        )
        hidden = self.transformer(hidden, mask=causal_mask)
        hidden = self.final_norm(hidden)
        return self.lm_head(hidden)


def parameter_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def train_model(
    *,
    model_id: str,
    role: str,
    corpus_path: Path,
    output_dir: Path,
    training: dict[str, Any],
) -> dict[str, Any]:
    context = int(training.get("context", 128))
    embedding = int(training.get("embedding", 128))
    layers = int(training.get("layers", 2))
    heads = int(training.get("heads", 4))
    batch_size = int(training.get("batch_size", 8))
    epochs = int(training.get("epochs", 3))
    learning_rate = float(training.get("learning_rate", 3e-4))
    max_steps = int(training.get("max_steps", 500))
    seed = int(training.get("seed", 1701 if model_id.endswith("1") else 1702))

    corpus, source_evidence = collect_text(corpus_path)
    raw = corpus.encode("utf-8")
    if len(raw) <= context + 1:
        raise ValueError(
            f"Corpus for {model_id} has {len(raw)} bytes but needs more than "
            f"context+1 ({context + 1})."
        )

    torch.manual_seed(seed)
    device = runtime_device()
    config = ModelConfig(
        context=context,
        embedding=embedding,
        layers=layers,
        heads=heads,
    )
    model = TinyCausalLM(config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    data = torch.tensor(list(raw), dtype=torch.long)
    max_start = len(data) - context - 1
    natural_steps = max(1, math.ceil(max_start / max(1, batch_size)))
    steps_per_epoch = min(natural_steps, max_steps)
    total_limit = max_steps
    losses: list[float] = []
    global_step = 0
    started = time.time()

    model.train()
    for epoch in range(epochs):
        epoch_losses: list[float] = []
        for _ in range(steps_per_epoch):
            if global_step >= total_limit:
                break

            starts = torch.randint(0, max_start + 1, (batch_size,))
            x = torch.stack([data[s : s + context] for s in starts]).to(device)
            y = torch.stack([data[s + 1 : s + context + 1] for s in starts]).to(device)

            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = F.cross_entropy(
                logits.reshape(-1, config.vocab_size),
                y.reshape(-1),
            )
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            value = float(loss.detach().cpu())
            epoch_losses.append(value)
            global_step += 1

        if epoch_losses:
            losses.append(sum(epoch_losses) / len(epoch_losses))
        if global_step >= total_limit:
            break

    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = output_dir / "model.pt"
    torch.save(model.state_dict(), checkpoint)

    config_data = asdict(config)
    atomic_json(output_dir / "config.json", config_data)

    build = {
        "schema": "synthia.foundry.model.v1",
        "model_id": model_id,
        "role": role,
        "architecture": "byte-native-causal-transformer",
        "parameters": parameter_count(model),
        "device_used_for_training": device.type,
        "training": {
            "epochs_requested": epochs,
            "steps_completed": global_step,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "loss_history": losses,
            "seed": seed,
            "duration_seconds": round(time.time() - started, 3),
        },
        "corpus": {
            "sha256": sha256_bytes(raw),
            "bytes": len(raw),
            "sources": source_evidence,
        },
        "checkpoint": {
            "file": "model.pt",
            "sha256": sha256_file(checkpoint),
        },
        "dependencies": {
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
            "torch": torch.__version__,
            "network_required": False,
        },
    }
    atomic_json(output_dir / "build.json", build)
    return build


def load_model(model_dir: Path) -> tuple[TinyCausalLM, ModelConfig]:
    cfg = ModelConfig(**json.loads((model_dir / "config.json").read_text(encoding="utf-8")))
    model = TinyCausalLM(cfg)
    state = torch.load(model_dir / "model.pt", map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model, cfg


@torch.inference_mode()
def generate(
    model_dir: Path,
    prompt: str,
    max_new_bytes: int = 256,
    temperature: float = 0.0,
    top_k: int = 32,
) -> str:
    model, cfg = load_model(model_dir)
    device = runtime_device()
    model = model.to(device)
    seed = list(prompt.encode("utf-8")) or [10]
    tokens = torch.tensor(seed[-cfg.context :], dtype=torch.long, device=device).unsqueeze(0)

    for _ in range(max_new_bytes):
        window = tokens[:, -cfg.context :]
        logits = model(window)[:, -1, :]

        if temperature <= 0:
            next_token = logits.argmax(dim=-1, keepdim=True)
        else:
            logits = logits / max(temperature, 1e-6)
            if top_k > 0:
                values, indices = torch.topk(logits, k=min(top_k, logits.shape[-1]))
                probs = torch.softmax(values, dim=-1)
                chosen = torch.multinomial(probs, num_samples=1)
                next_token = indices.gather(-1, chosen)
            else:
                probs = torch.softmax(logits, dim=-1)
                next_token = torch.multinomial(probs, num_samples=1)

        tokens = torch.cat([tokens, next_token], dim=1)

    result = bytes(tokens[0].detach().cpu().tolist())
    return result.decode("utf-8", errors="replace")


def native_address(path: Path, metadata: dict[str, Any]) -> dict[str, Any]:
    """
    Connect the recovered Synthia address system by adding SynthiaFoundry/synthia_address.py
    with a resolve(path: Path, metadata: dict) -> dict function.

    Until that real resolver is present, the foundry records uncertainty rather than
    manufacturing a replacement address.
    """
    try:
        import synthia_address  # type: ignore
    except ImportError:
        return {
            "address_status": "unresolved",
            "address": None,
            "reason": "native Synthia address resolver is not connected",
        }

    resolver = getattr(synthia_address, "resolve", None)
    if not callable(resolver):
        return {
            "address_status": "unresolved",
            "address": None,
            "reason": "synthia_address.py exists but has no callable resolve()",
        }

    result = resolver(path, metadata)
    if not isinstance(result, dict):
        raise TypeError("synthia_address.resolve() must return a dictionary")
    return result


def artifact_record(path: Path, root: Path) -> dict[str, Any]:
    stat = path.stat()
    meta = {
        "schema": "synthia.foundry.artifact.v1",
        "origin": str(path.resolve()),
        "relative_path": relative_or_absolute(path, root),
        "sha256": sha256_file(path),
        "bytes": stat.st_size,
        "extension": path.suffix.lower(),
        "modified_ns": stat.st_mtime_ns,
        "ingest_mode": "read-only",
    }
    meta["synthia_address"] = native_address(path, meta)
    return meta


def ingest(root: Path, state_root: Path) -> dict[str, Any]:
    if not root.exists():
        raise FileNotFoundError(root)

    paths = [root] if root.is_file() else sorted(p for p in root.rglob("*") if p.is_file())
    registry_path = state_root / "registry" / "artifacts.jsonl"
    seen: set[str] = set()

    if registry_path.exists():
        for line in registry_path.read_text(encoding="utf-8").splitlines():
            try:
                seen.add(json.loads(line)["sha256"])
            except Exception:
                continue

    added = 0
    known = 0
    for path in paths:
        record = artifact_record(path, root)
        if record["sha256"] in seen:
            known += 1
            continue
        append_jsonl(registry_path, record)
        seen.add(record["sha256"])
        added += 1

    summary = {
        "schema": "synthia.foundry.ingest.v1",
        "root": str(root.resolve()),
        "discovered": len(paths),
        "added": added,
        "already_known": known,
        "registry": str(registry_path),
    }
    atomic_json(state_root / "registry" / "last_ingest.json", summary)
    return summary


def position_record(
    *,
    position_id: str,
    kind: str,
    role: str,
    state_root: Path,
    build: dict[str, Any] | None = None,
    capabilities: list[str] | None = None,
) -> dict[str, Any]:
    record: dict[str, Any] = {
        "schema": "synthia.foundry.position.v1",
        "id": position_id,
        "kind": kind,
        "role": role,
        "authority": "bootstrap-teaching",
        "persistent_state": f"positions/{position_id}.json",
    }
    if build is not None:
        record["model"] = {
            "path": f"models/{position_id}",
            "checkpoint_sha256": build["checkpoint"]["sha256"],
            "corpus_sha256": build["corpus"]["sha256"],
            "parameters": build["parameters"],
        }
    if capabilities is not None:
        record["capabilities"] = capabilities

    atomic_json(state_root / "positions" / f"{position_id}.json", record)
    return record


def bootstrap(recipe_path: Path) -> dict[str, Any]:
    recipe_path = recipe_path.resolve()
    base = recipe_path.parent.parent
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))

    state_root_value = Path(recipe.get("state_root", "state"))
    state_root = state_root_value if state_root_value.is_absolute() else base / state_root_value
    state_root.mkdir(parents=True, exist_ok=True)

    positions: list[dict[str, Any]] = []
    model_builds: list[dict[str, Any]] = []

    for model_spec in recipe.get("models", []):
        model_id = model_spec["id"]
        corpus_value = Path(model_spec["corpus"])
        corpus_path = corpus_value if corpus_value.is_absolute() else base / corpus_value
        model_dir = state_root / "models" / model_id
        build = train_model(
            model_id=model_id,
            role=model_spec["role"],
            corpus_path=corpus_path,
            output_dir=model_dir,
            training=model_spec.get("training", {}),
        )
        model_builds.append(build)
        positions.append(
            position_record(
                position_id=model_id,
                kind="llm",
                role=model_spec["role"],
                state_root=state_root,
                build=build,
            )
        )

    for tool_spec in recipe.get("tools", []):
        positions.append(
            position_record(
                position_id=tool_spec["id"],
                kind="tool",
                role=tool_spec["role"],
                state_root=state_root,
                capabilities=list(tool_spec.get("capabilities", [])),
            )
        )

    dna = {
        "schema": "synthia.dna.bootstrap.v1",
        "generation": int(recipe.get("generation", 0)),
        "derivation": "2 model positions + 2 tool positions",
        "positions": positions,
        "model_builds": [
            {
                "model_id": build["model_id"],
                "role": build["role"],
                "checkpoint_sha256": build["checkpoint"]["sha256"],
                "corpus_sha256": build["corpus"]["sha256"],
                "parameters": build["parameters"],
            }
            for build in model_builds
        ],
        "independence": {
            "hugging_face_service_required": False,
            "network_required_for_training": False,
            "external_tokenizer_required": False,
        },
        "next_state": "ready_for_first_four_inference",
    }

    derived = Path(recipe.get("derived_output", "dna/genesis.json"))
    dna_path = derived if derived.is_absolute() else state_root / derived
    atomic_json(dna_path, dna)

    summary = {
        "state_root": str(state_root.resolve()),
        "dna": str(dna_path.resolve()),
        "positions": [p["id"] for p in positions],
        "status": dna["next_state"],
    }
    atomic_json(state_root / "bootstrap_status.json", summary)
    return summary


def status(state_root: Path) -> dict[str, Any]:
    state_root = state_root.resolve()
    bootstrap_status = state_root / "bootstrap_status.json"
    positions_dir = state_root / "positions"
    models_dir = state_root / "models"
    return {
        "state_root": str(state_root),
        "bootstrapped": bootstrap_status.exists(),
        "bootstrap_status": (
            json.loads(bootstrap_status.read_text(encoding="utf-8"))
            if bootstrap_status.exists()
            else None
        ),
        "positions": sorted(p.stem for p in positions_dir.glob("*.json")) if positions_dir.exists() else [],
        "models": sorted(p.name for p in models_dir.iterdir() if p.is_dir()) if models_dir.exists() else [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Synthia Sovereign Foundry")
    sub = parser.add_subparsers(dest="command", required=True)

    boot = sub.add_parser("bootstrap", help="Build the first four positions")
    boot.add_argument("recipe", type=Path)

    ing = sub.add_parser("ingest", help="Read-only artifact ingestion")
    ing.add_argument("path", type=Path)
    ing.add_argument("--state", type=Path, default=Path("state"))

    inf = sub.add_parser("infer", help="Run a local model")
    inf.add_argument("model_dir", type=Path)
    inf.add_argument("prompt")
    inf.add_argument("--bytes", type=int, default=256)
    inf.add_argument("--temperature", type=float, default=0.0)

    stat = sub.add_parser("status", help="Inspect foundry state")
    stat.add_argument("--state", type=Path, default=Path("state"))

    args = parser.parse_args()

    if args.command == "bootstrap":
        print(json.dumps(bootstrap(args.recipe), indent=2))
    elif args.command == "ingest":
        print(json.dumps(ingest(args.path, args.state), indent=2))
    elif args.command == "infer":
        print(generate(args.model_dir, args.prompt, args.bytes, args.temperature))
    elif args.command == "status":
        print(json.dumps(status(args.state), indent=2))
    else:
        parser.error("unknown command")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
