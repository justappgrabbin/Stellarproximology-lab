# Modelmaker Repair

Non-destructive repair package for the Hugging Face Space `stellarproximology/Modelmaker`.

## Install

1. Copy `app.py`, `seed.py`, `swarm.js`, and `requirements.txt` into the **root** of the existing Hugging Face Modelmaker Space.
2. Do not delete existing Modelmaker files.
3. If Hugging Face still reports **No application file**, use the YAML in `README_FRONTMATTER.txt` at the very top of the Space's existing `README.md`.
4. Optional: add a Hugging Face write token as a Space secret named `HF_TOKEN` to allow Modelmaker to publish trained models.

The app can ingest training text/files, train a compact GPT-style causal language model, export it in Hugging Face `save_pretrained()` format, and return the built model as a ZIP.

The repair uses Gradio 6.8.0 and Transformers 4.x, validates training parameters,
and passes unshifted labels to GPT-2 (which performs its own next-token shift).
Only one training job runs at a time. The root lab app delegates to this file;
when installing just this portable package, copy its app.py directly into the
Space root. Tiny models trained from scratch are experimental seed models.
