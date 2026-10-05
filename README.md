---
title: Modelmaker
emoji: 🧬
colorFrom: purple
colorTo: indigo
sdk: gradio
sdk_version: 6.8.0
app_file: app.py
pinned: false
---

# Stellarproximology lab / Modelmaker

The root application is the repaired Hugging Face Gradio entrypoint. The original
Space's TypeScript files are preserved separately in Hugging Face; they reference
an incomplete Node application and are not the Gradio entrypoint.

Run `pip install -r requirements.txt` then `python app.py`.

Modelmaker trains a small GPT-2 model from scratch on supplied text and exports a
Hugging Face model ZIP. A tiny model trained this way is an experiment, not a
pretrained general-purpose LLM. Publishing models is optional and needs a write
token in `HF_TOKEN`.

`Modelmaker-repair/` remains the portable repair package. Root `app.py` delegates
to it, so there is one source of the trainer implementation.

The next architecture has **exactly four configurable LLM dimensions**. Their
interactions produce swarm units. The user's stated mappings are:

| Unit | Mapping | Meaning |
| --- | --- | --- |
| Bigram | 3 = 1 | Heart: direction / social |
| Trigram | 2 = 1 | Mind: transpersonal thought |
| Hexagram | 1 = 1 | Body: personal action |

Whether these are three partitions of the same six lines is pending confirmation.
TCS is also unresolved; it is not implemented as TypeScript or assumed to be an
ISO standard. Binary/ASCII/Unicode/NATO spelling are representations, not model
dimensions. No I Ching sequence or linguistic grammar is silently substituted.

Repair checks: `python -m unittest discover -s tests -v`.
