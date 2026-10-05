# Recursive Emergence v0

This branch is the minimum executable mechanism for:

```
system instance
  -> real local Modelmaker dimensional LLMs
  -> dimensional conditions/seeds
  -> one shared Pure-Synthia substrate
  -> primitive reduction + addressing
  -> peer/swarm interplay
  -> Pure-Synthia composition
  -> first arrived higher-scale automaton
  -> backward provenance to model fingerprints
```

It does **not** claim the full Synthia/Resonance system is assembled. It creates
and tests the growth spine only.

## What is reused intact

The files under `vendor/pure-synthia/` are exact copies of the already
recovered Pure-Synthia lineage in `justappgrabbin/Back-up-` at the commit
recorded in `SOURCE_LOCK.json`. They include the existing IntakeGate,
addressing, operators, Automaton, AutomataMesh, FSM composition, cross-scale
experiment support, and graph trace.

The existing `Modelmaker-repair/app.py` remains the model builder. This branch
calls it rather than creating another trainer.

## What the new glue does

1. `python/build_dimensions.py` calls the existing Modelmaker four times to
   create four real local models: Movement, Evolution, Being, Design.
2. Every model gets a `dimension_manifest.json` with a content fingerprint.
3. `python/emit_seed.py` loads each model **offline** and emits one real
   condition.
4. `RecursiveEmergenceRuntime` sends that condition through the existing
   `IntakeGate` to obtain primitives and an address.
5. Each dimensional condition becomes a sovereign Automaton on one
   `AutomataMesh`. Peers are connected by typed contracts; routing does not
   execute or override another peer.
6. Existing `o_bundle`, `o_sequence`, and the existing FSM
   `AutomataComposer` build upward.
7. `GraphTraceBuilder` records decomposition and composition edges.
8. The runtime emits `ACCEPT` only when all four real model fingerprints,
   derivations, primitives, and composition traces are present.
9. Accepted output can become the parent context for the next generation.
10. Model candidates are held in per-dimension UCB survival pools. Peer score
    gossip is recorded as evidence, but never silently overrides local fitness.

That last distinction is deliberate: the mesh can teach an instance without
becoming a central authority.

## Local/offline model build

The current Modelmaker builds GPT-2-style causal models from scratch. It does
not require downloading a pretrained base model. Python packages are local
software dependencies; the build and inference path sets Hugging Face /
Transformers offline mode and requires no hosted inference service.

Prepare four actual corpora, copy `dimensions.example.json`, and replace the
paths with real local files.

```bash
python3 recursive-emergence/python/build_dimensions.py \
  --config /path/to/dimensions.json \
  --output /path/to/models
```

The builder writes `/path/to/models/models.json`.

Then disconnect the network if desired and run:

```bash
node recursive-emergence/run-arrival.mjs \
  --models /path/to/models/models.json \
  --generations 1
```

For recursive growth after the first proof:

```bash
node recursive-emergence/run-arrival.mjs \
  --models /path/to/models/models.json \
  --generations 4
```

Each accepted generation becomes context for the next. The underlying laws and
source mechanisms are not rewritten by this loop.

## Acceptance boundary

An arrival is structurally accepted only when:

- Movement, Evolution, Being, and Design each came from a real local-model port;
- each emission carries the SHA-256 fingerprint of its built model artifact;
- each condition has a real IntakeGate derivation;
- each condition reduced to at least one primitive;
- the composed automaton has real states/transitions produced from those
  primitives;
- graph-trace contains causal/dependency evidence for the upward composition.

The contract test intentionally verifies that the runtime **fails** rather than
inventing a model when any dimension is missing.

Run:

```bash
cd recursive-emergence
npm test
```

## Recursive emergence, not uncontrolled self-editing

Conway Automaton contributes the lineage/audit idea, Tribler contributes
survival competition and gossip, and Dream Machine contributes evidence-gated
evolution. v0 therefore grows state/structure recursively while preserving the
kernel and evidence boundary. Source-code mutation is a later candidate
capability and must pass the same provenance/evaluation gate before it can ever
be promoted.

See `SOURCE_LOCK.json` for exact source revisions and licensing boundary.
