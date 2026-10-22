from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
import traceback
import zipfile
from pathlib import Path
from typing import Iterable
from assembly.training import fit_model, make_sequences
from assembly.runtime import Assembly
from assembly.intake import read_document

_RUNTIMES = {}
def _assembly(user="local"):
    user = str(user or "local")
    if user not in _RUNTIMES:
        _RUNTIMES[user] = Assembly(user=user)
    return _RUNTIMES[user]

def _user(request):
    return getattr(request, "session_hash", None) or "local"


import gradio as gr
import torch
from huggingface_hub import HfApi
from tokenizers import ByteLevelBPETokenizer
from transformers import GPT2Config, GPT2LMHeadModel, GPT2TokenizerFast

APP_TITLE = "Modelmaker"
DEFAULT_NAMESPACE = "stellarproximology"


def _read_uploads(files: Iterable | None) -> str:
    chunks: list[str] = []
    if not files:
        return ""

    for item in files:
        path = getattr(item, "name", None) or str(item)
        p = Path(path)
        if not p.exists() or not p.is_file():
            continue

        chunks.append(read_document(p))

    return "\n\n".join(chunks)


def _dataset_text(pasted_text: str, files: Iterable | None) -> str:
    pieces = []
    if pasted_text and pasted_text.strip():
        pieces.append(pasted_text.strip())
    upload_text = _read_uploads(files)
    if upload_text.strip():
        pieces.append(upload_text.strip())
    return "\n\n".join(pieces)


def _safe_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_." else "-" for c in (name or "").strip())
    cleaned = cleaned.strip("-._")
    return cleaned or "modelmaker-model"


def _build_tokenizer(text_path: Path, output_dir: Path, vocab_size: int) -> GPT2TokenizerFast:
    tokenizer_dir = output_dir / "tokenizer_build"
    tokenizer_dir.mkdir(parents=True, exist_ok=True)

    trainer = ByteLevelBPETokenizer()
    trainer.train(
        files=[str(text_path)],
        vocab_size=max(256, int(vocab_size)),
        min_frequency=1,
        special_tokens=["<|pad|>", "<|bos|>", "<|eos|>", "<|unk|>"],
    )
    trainer.save_model(str(tokenizer_dir))

    # Load from the saved vocab.json/merges.txt via from_pretrained. transformers 5.x
    # no longer accepts vocab_file=/merges_file= in the constructor (they are silently
    # ignored, leaving an empty vocabulary); from_pretrained works on 4.x and 5.x.
    tokenizer = GPT2TokenizerFast.from_pretrained(
        str(tokenizer_dir),
        bos_token="<|bos|>",
        eos_token="<|eos|>",
        unk_token="<|unk|>",
        pad_token="<|pad|>",
    )
    return tokenizer


def _make_sequences(token_ids: list[int], context_length: int) -> torch.Tensor:
    return make_sequences(token_ids, context_length)


def _zip_dir(directory: Path, zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in directory.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(directory))


def _push_model(model_dir: Path, model_name: str) -> str:
    token = os.getenv("HF_TOKEN", "").strip()
    if not token:
        return "HF_TOKEN is not set, so the model was built locally but not pushed."

    repo_id = model_name if "/" in model_name else f"{DEFAULT_NAMESPACE}/{model_name}"
    api = HfApi(token=token)
    api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True)
    api.upload_folder(folder_path=str(model_dir), repo_id=repo_id, repo_type="model")
    return f"Pushed to https://huggingface.co/{repo_id}"


def train_model(
    model_name: str,
    pasted_text: str,
    files,
    vocab_size: int,
    context_length: int,
    layers: int,
    heads: int,
    embedding_size: int,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    push_to_hub: bool,
    progress=gr.Progress(track_tqdm=False),
    request: gr.Request = None,
):
    storage = Path(os.getenv("MODELMAKER_DATA", Path(__file__).resolve().parent / ".modelmaker")) / "checkpoints"
    storage.mkdir(parents=True, exist_ok=True)
    work_root = Path(tempfile.mkdtemp(prefix="modelmaker-", dir=storage))
    try:
        name = _safe_name(model_name)
        model_dir = work_root / name
        text = _dataset_text(pasted_text, files)
        runtime = _assembly(_user(request))
        study = runtime.study(text, title=name, source="modelmaker-training")
        # Only explicitly reviewed feedback is added as a supervised target.
        approved = runtime.approved_training_text()
        if approved:
            text += "\n\n" + approved
        meta = fit_model(text, model_dir, vocab_size=int(vocab_size), context_length=int(context_length),
            layers=int(layers), heads=int(heads), embedding_size=int(embedding_size), epochs=int(epochs),
            batch_size=int(batch_size), learning_rate=float(learning_rate), progress=progress)
        runtime.load_model(str(model_dir))
        runtime.event("training", {**meta, "study_source":study["document_id"], "checkpoint":str(model_dir)})
        push_message = _push_model(model_dir, name) if push_to_hub else "Push disabled."
        zip_path = work_root / f"{name}.zip"
        _zip_dir(model_dir, zip_path)
        return (f"### Built {name}\n- CPU parameters: **{meta['parameters']:,}**\n"
            f"- Loss: **{meta['initial_loss']:.4f} → {meta['final_loss']:.4f}**\n"
            f"- Weight update: **{meta['embedding_update_norm']:.6f}**\n"
            f"- Saved/reloaded weights verified: **{meta['reload_verified']}**\n- {push_message}", str(zip_path))
    except Exception as exc:
        return f"### Build failed\n**{type(exc).__name__}:** {exc}\n\n```text\n{traceback.format_exc(limit=5)}\n```", None


def build_ui():
    with gr.Blocks(title=APP_TITLE, theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            "# 🧬 Modelmaker\n"
            "Build a compact causal LLM from your own material. The result is saved in Hugging Face `save_pretrained()` format."
        )

        with gr.Row():
            with gr.Column(scale=3):
                model_name = gr.Textbox(label="Model name", value="synthia-seed")
                pasted_text = gr.Textbox(
                    label="Training text",
                    lines=14,
                    placeholder="Paste training material here, or upload files below.",
                )
                files = gr.File(
                    label="Training files",
                    file_count="multiple",
                    file_types=[".txt", ".md", ".json", ".jsonl", ".pdf", ".docx", ".py", ".js", ".ts", ".html", ".css", ".csv"],
                )

            with gr.Column(scale=2):
                gr.Markdown("### Model shape")
                vocab_size = gr.Slider(512, 16000, value=4096, step=256, label="Vocabulary")
                context_length = gr.Slider(32, 512, value=128, step=32, label="Context length")
                layers = gr.Slider(1, 12, value=2, step=1, label="Transformer layers")
                heads = gr.Dropdown([1, 2, 4, 8], value=4, label="Attention heads")
                embedding_size = gr.Dropdown([64, 128, 256, 512], value=256, label="Embedding size")

                gr.Markdown("### Training")
                epochs = gr.Slider(1, 20, value=2, step=1, label="Epochs")
                batch_size = gr.Dropdown([1, 2, 4, 8, 16], value=4, label="Batch size")
                learning_rate = gr.Number(value=0.0003, label="Learning rate")
                push_to_hub = gr.Checkbox(
                    value=False,
                    label="Push model to Hugging Face after training (requires HF_TOKEN Space secret)",
                )

        build = gr.Button("Build model", variant="primary")
        status = gr.Markdown()
        artifact = gr.File(label="Built model package")

        build.click(
            fn=train_model,
            inputs=[
                model_name,
                pasted_text,
                files,
                vocab_size,
                context_length,
                layers,
                heads,
                embedding_size,
                epochs,
                batch_size,
                learning_rate,
                push_to_hub,
            ],
            outputs=[status, artifact],
        )

        from assembly.ui import add_assembly_ui
        add_assembly_ui(_assembly, _user, pasted_text, files)

        gr.Markdown(
            "Small models are intentional here: Modelmaker should create testable specialized brains first, then scale only when the data and role justify it."
        )

    return demo


if __name__ == "__main__":
    build_ui().launch()
