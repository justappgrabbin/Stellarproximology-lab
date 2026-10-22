# Modelmaker Repair

Non-destructive repair package for the Hugging Face Space `stellarproximology/Modelmaker`.

## Install

1. Copy `app.py` and `requirements.txt` into the **root** of the existing Hugging Face Modelmaker Space.
2. Do not delete existing Modelmaker files.
3. If Hugging Face still reports **No application file**, use the YAML in `README_FRONTMATTER.txt` at the very top of the Space's existing `README.md`.
4. Optional: add a Hugging Face write token as a Space secret named `HF_TOKEN` to allow Modelmaker to publish trained models.

The app can ingest training text/files, train a compact GPT-style causal language model, export it in Hugging Face `save_pretrained()` format, and return the built model as a ZIP.

## Private chat workspace

The complete local application now includes a fresh chat interface, book uploads,
Klein analysis and retrieval, CPU checkpoint inference, and reviewed self-editing
with checks and rollback. Run `python -m assembly.desktop_server` and open
`http://127.0.0.1:7860`. See [PRIVATE-CHAT.md](PRIVATE-CHAT.md) for setup,
capability limits, source provenance, and the optional local MCP toolbox.

The workspace includes an **Install coding model (CPU)** action for a pinned
Qwen2.5-Coder checkpoint. Uploads retain any file type and can inspect ZIP/TAR
projects, index supported content, and expose imported source files to chat.
See PRIVATE-CHAT.md for the exact upload, analysis, and execution boundaries.
