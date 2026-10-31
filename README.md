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

## Serving exported TRIDENT weights to a local Synthia client

After training and exporting a checkpoint, unpack the ZIP and execute:

```bash
python trident_inference.py --model-dir ./trident --port 11735
```

The loopback-only endpoint `http://127.0.0.1:11735/v1/chat/completions` uses the **actual native TRIDENT architecture** and can be selected by an OpenAI-compatible local client using the model identifier shown at startup. `GET /health` reports whether real weights were loaded; `production_ready` stays false until independent task evaluations establish it. This is not the GPT-2 `Modelmaker-repair/synthia_server.py` from an older integration branch, and those two checkpoint formats are **not interchangeable**. The client must explicitly select the configured local model endpoint; deploying the trainer does not silently change Synthia's inference model.

## Source-validated dimensional routing (draft PR, additive to native TRIDENT)

This optional feature accepts **explicit structural transitions**, not guessed
classifications. It operates within the existing `RelationalTrident` 8×32 feature
channels. Nothing changes for datasets or inference requests without
`dimension_events`. The model continues to learn with its existing weight
updates; this feature does **not** implement the unfinished Klein learning laws.

Each of Movement, Evolution, Being, Design, and Space has its **own source-word
ordering**. An adjacent pair is represented as an *ordered chain adjacency*,
**not a demonstrated causal state transformation**. No causal rule is inferred. The current source documents provide one full leading
*interdimensional traversal order*: **Being → Movement → Space → Design →
Evolution**. Leading orders for the other four are **unresolved**, not default
rotations. The source material also distinguishes four originating dimensions
from emergent Space; describing Space's named chain here does not claim to have
computed its emergence. Source background: `Synthia_Semantic_Swarm_Master_Spec_v3.docx`
§4; `Paper.html` `spec-locked-dimensional-relations.mjs`.

An approved training JSONL record can include:
```json
{"prompt":"What transforms?","response":"A documented relation.","head":"research","dimension_events":[{"dimension":"Movement","from":"Energy","to":"Creation","frame_dimension":"Being"}]}
```

The local `/v1/chat/completions` endpoint accepts the same optional
top-level `dimension_events` array; the Sample tab exposes an optional JSON
field. The structural adjacency is validated before an event becomes a model
feature. If a `frame_dimension` is requested but its frame-leading order is
unresolved, encoding **fails closed** rather than silently using another order. For example, `Seeing → Illusion` has **no verified cross-dimensional
edge** in these source chains, so the router rejects it rather than inventing
one. Frame orders must have an explicit source and evidence before activation.

The new file `source/dimensional_router.py` maintains these contracts, provides
inspection and records unresolved mappings. Its 32-float feature summary is
lossy neural input, not a replacement for the 13-field ontological address,
source state-space geometry, or a deterministic prediction engine.

```bash
python -m unittest discover -s tests -v
```

The original `Modelmaker-repair/` implementation, external research branches,
and their original Klein tools are not modified by this change.

The existing separate `feature/dimension-source-research-team` branch uses one frozen
native TRIDENT with four independently trained Klein positional adapters. This
PR does **not** replace or merge those adapters. Future integration must preserve
the original 8×32 conditioning interface and compare the two paths on the same
source-anchored inputs, rather than creating competing backbones.
