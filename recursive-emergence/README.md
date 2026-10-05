# Recursive Emergence v1

This branch implements the complete local runtime path for the current experiment:

```
local model carriers on cognitive / 2D side
        |
        | every action
        v
SwarmEmitter
        |
        v
existing Pure-Synthia IntakeGate
primitive reduction + canonical address + provenance
        |
        v
addressed swarm pieces
        |
        v
ContactRegistry -> EmbodiedField -> EmergentChannels
        |
        v
Pure-Synthia bundle / sequence / graph composition
        |
        v
embodied field form + relationship feedback
        |
        v
carrier memory + local model fitness
        |
        +--> descendant Modelmaker candidate
        |
        +--> witnessed peer-mesh learning capsule
        |
        `--> next cognitive action
```

There is no hosted inference call in that loop.

## The boundary is now explicit

The LLMs live on the cognitive side. They emit actions. They do not directly
write embodied state.

Every action is passed through the existing Pure-Synthia intake/addressing
machinery and is released as microscopic swarm pieces carrying model
fingerprint, carrier identity, derivation, canonical address, and fractal path.

The embodied field owns contact, cycling, activation, composition, and
persistent channels. Feedback from that field is what the model carriers learn
from.

## Contact is not a single hard-coded relation

`ContactRegistry` currently has executable rules for:

- common action origin
- same gate
- canonical channel relationship
- one-bit / Hamming-adjacent state
- shared canonical center
- exact lexical contact
- Klein distributional contact learned from repeated contexts

The registry is open. A recovered Bantu/contact mechanism or another verified
relational mechanism can be registered without replacing the field runtime.

Repeated crossings are also fed into the existing Pure-Synthia
`EmergentChannels`: after the existing promotion threshold, the relationship
itself becomes a persistent composite capability.

## Relationship learning changes the models

A carrier retains local embodied experiences and witness-verified peer
observations. They are included in subsequent local prompts immediately.

When the configured experience threshold is reached, `EvolutionManager`
creates a **new Modelmaker descendant artifact** from the preserved canonical
training corpus plus accumulated relationship experience. The parent model is
not overwritten. The child records the parent's SHA-256 model fingerprint.

The parent and child remain candidates in the carrier's local survival pool.
The UCB selector explores candidates and local embodied contribution supplies
their fitness evidence.

## Distributed mesh

`PeerMeshBridge` exchanges witness-protected learning capsules. A peer capsule
must match the local carrier identity, dimension, and optional gate before it
can enter local learning memory. Peer model scores remain evidence rather than
authority.

Two dependency-free transports exist:

- `BroadcastChannel` for same-origin/local app contexts.
- `WebRTCPeerTransport` for direct browser/webview data-channel links. Its
  default ICE configuration uses no hosted STUN/TURN service. A self-hosted ICE
  configuration can be injected when NAT traversal is required.

Any other transport implementing `send(message)` can attach to the same
bridge.

## Four carriers or a larger field

Carrier count is configuration.

The minimum baseline is Movement, Evolution, Being, and Design.

A config may declare 64 carrier identities and assign each an explicit gate and
model key. Those carriers can either:

1. reference 64 independent local model artifacts, or
2. initially share a smaller set of local model backbones while retaining
   separate identity, relationship memory, swarm history, and descendant
   evolution.

The runtime does not silently invent a universal 64-to-4 mapping. If a 64
carrier field is used, that mapping is explicit data.

## Local persistent inference

`LocalPythonModelPort` starts a persistent local worker for each model
artifact. The model and tokenizer load once, then accept JSONL inference
requests. Multiple carriers referencing the same model key share that resident
backbone instead of spawning and reloading a model for every action.

The worker uses `local_files_only=True` and forces Transformers/Hugging Face
offline mode.

## Canonical training corpora

A deterministic corpus builder is included so the experiment no longer needs
hand-written fake dimension prompts:

```bash
cd recursive-emergence
node build-corpora.mjs --output ./local-corpora
```

It derives four corpora from explicit existing Pure-Synthia dimensional
metadata, primitive attributions, dimension vocabularies, shared operators,
named transitions, scale law, and channel topology. It does not invent an
untested gate-to-dimension assignment.

Build the actual local models with the existing Modelmaker:

```bash
python3 python/build_dimensions.py \
  --config ./local-corpora/dimensions.json \
  --output ./local-models
```

Then copy `system.example.json`, set local paths, and run:

```bash
node run-system.mjs \
  --config ./system.local.json \
  --steps 1 \
  --stimulus "initial condition"
```

Increasing `--steps` closes the recursive loop. With evolution enabled,
relationship experience can materialize new descendant local models.

## Persistence

Runtime state is never maintained as one destructively overwritten save file.
`AppendOnlyStateStore` writes versioned immutable snapshots. Model evolution
writes new child directories. Retired swarm pieces retain provenance in the
field/graph history.

## Verification boundary

The JavaScript modules have been syntax-checked as modules and contract tests
are included for embodied contact, append-only persistence, peer transport,
contact multiplicity, model-survival selection, and refusal to fabricate
missing model artifacts.

The one check that cannot be truthfully marked complete from this ChatGPT
environment is a real four-model training + inference run: this environment
does not contain the local `transformers` / `tokenizers` packages, and the
available remote compute job path is not enabled for this account. The branch
therefore does not fabricate an ARRIVAL result. Run the commands above in the
self-hosted app environment to produce that evidence.

See `IMPLEMENTATION_CONTRACT.json` and `SOURCE_LOCK.json`.
