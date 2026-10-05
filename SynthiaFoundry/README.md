# Synthia Sovereign Foundry

A local, service-independent bootstrap foundry for creating Synthia's first teaching cohort.

## Purpose

This foundry exists to create the initial four positions without relying on Hugging Face services or a remote model host:

1. LLM position 1 — novelty / exploration teacher
2. LLM position 2 — verification / integration teacher
3. Tool position 1 — source observation
4. Tool position 2 — execution / testing

The combined four-position state is persisted as a genesis DNA package. The foundry also maintains an immutable-by-default artifact registry and can ingest project files without assigning fake semantic addresses when the native Synthia resolver is unavailable.

## Sovereignty

- Training happens locally with PyTorch.
- Models start from fresh random weights.
- Tokenization is byte-native (256 symbols), so there is no external tokenizer dependency.
- Checkpoints are local `.pt` files plus JSON configuration/provenance.
- No network service is required by the foundry.
- No source artifact is modified during ingestion.
- Native Synthia addressing can be connected through `synthia_address.py`; until then an artifact is explicitly marked `address_status: unresolved`.

## Quick start

```bash
cd SynthiaFoundry
python -m pip install -r requirements.txt
python foundry.py bootstrap recipes/first_four.json
python app.py
```

Then open `http://127.0.0.1:17400`.

## Commands

```bash
python foundry.py bootstrap recipes/first_four.json
python foundry.py ingest /path/to/project
python foundry.py infer state/models/llm_1 "Describe what you have learned."
python foundry.py status
```

## Output

Runtime state is written under `SynthiaFoundry/state/` and is intentionally ignored from source control in normal operation:

```text
state/
  models/
    llm_1/
    llm_2/
  positions/
    llm_1.json
    llm_2.json
    tool_1.json
    tool_2.json
  registry/
    artifacts.jsonl
  dna/
    genesis.json
  lessons/
```

This is the ignition layer, not Synthia's permanent authority. Once Synthia has learned a capability, the learned native representation should be sufficient to reproduce and execute it without recurring model assistance.
