---
title: Trident Modelmaker
emoji: 🧠
colorFrom: indigo
colorTo: blue
sdk: gradio
sdk_version: 6.5.1
app_file: app.py
pinned: false
hf_oauth: true
---

# Trident Modelmaker — Stellarproximology Lab

This project trains the supplied SYNTHIA TRIDENT PyTorch architecture, tracks actual gradient-update steps, saves **immutable checkpoint revisions**, evaluates on optional separate held-out prompts and exports a backup ZIP. It does **not** claim the pretrained knowledge of a foundation model. A repository containing model code is not evidence of usable trained weight files.

## Run from this GitHub repository

This is the **live source-of-truth trainer** in `justappgrabbin/Stellarproximology-lab`; the older `Modelmaker-repair/` folder is preserved for provenance and comparison. `source/model.py` and `source/semantic_language_maker.py` are SHA256-identical copies of the user-provided `Synthia-Neural-Standalone.zip` donor files—not generic GPT-2 replacements.

From the repository root: `pip install -r requirements.txt && python app.py`. Then open the URL printed by Gradio. Run `python -m unittest discover -s tests -v` to test real training, checkpoint revisions, and reload.

**GitHub does not automatically deploy to Hugging Face.** To deploy the same application to `stellarproximology/Modelmaker`, synchronize these root files (including `source/`) to the Space repository using authorized write access. No Hugging Face Space or model repository is changed by this GitHub commit.

## Data format

Each JSONL line is an explicitly approved question-answer pair with an optional head and structure:

```json
{"prompt":"How does context change meaning?","response":"Context determines which relationships are relevant.","head":"research","relations":[{"subject":"word","relation":"DEPENDS","object":"context","verified":false}]}
```

Provide a distinct held-out JSONL file for evaluation. Overlapping records invalidate the generalization estimate. Approved training examples are stored in each revision as an audit ledger; **do not upload personal information to a public or shared Space**. Free Spaces are ephemeral; export the ZIP after training. An attached persistent volume is recommended for genuine long-term use.

The 'Portable' model uses a 260-token byte vocabulary and a smaller transformer. The 'Original-size' option uses the original HF TRIDENT layer dimensions and 4096 output slots, but a **UTF-8 byte-based training representation**. Its weights are **not tokenizer-compatible** with the original HF repository unless token IDs are explicitly reconciled. Both use the extended Synthia `RelationalTrident` architecture, so the exported checkpoint must be consumed by this exact companion source, not treated as a plain Transformers `AutoModel` repo.

## Guarantees and limits

- Actual PyTorch gradients are computed. The original Synthia model source is not replaced.
- New revisions are written and reload-verified before the current pointer changes; old revisions remain.
- No training occurs without a checked approval box and a valid corpus. No uploaded checkpoint is implicitly loaded or overwritten.
- The UI does **not** implement the entire JS semantic-spacetime host and no online proactive agent is secretly running. This is a real **weight trainer**, not a full Resonance Network application.
- Metrics are answer-token loss, not proof of correct semantic reasoning, good conversation, or biological validity.
- You need a much larger, more diverse, high-quality training corpus and independent evaluation for robust language output.

## Account security

Hosted operations require the authenticated Hugging Face owner `stellarproximology` through `gr.OAuthProfile`, verified inside each action. A `LoginButton` alone is not authorization. Locally (`SPACE_ID` unset), actions are permitted on the trusted local machine. Keep this Space private if you do not want public code visibility, even though checkpoint operations are gated.

## Readiness criteria

- **Trainer source:** runnable Gradio app, tests passing, checkpoints exported with matching architecture source.
- **Trident weights:** require a representative, explicitly approved corpus, separate held-out examples with measured loss, verified regeneration after reload, and behavior checks for the intended tasks. No meaningful production-readiness claim follows from a 2- or 20-step smoke test.
- **Delivery to Hugging Face:** requires a separate authorized publish/deploy action; no token or private material should be committed to GitHub.

The old `Modelmaker-repair/` folder contains a separate GPT-2-style builder and is intentionally not executed by this root application.