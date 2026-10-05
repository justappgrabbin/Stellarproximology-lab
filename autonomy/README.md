# Four-perspective capability builder

This is a working first capability builder, not an unrestricted self-rewriting
system. It adds verified capability code and data without rewriting the engine,
validators, model credentials, or deployment configuration.

The loop is **research → hypothesis → build → isolated verification → reflection**.
Failed rounds feed research, predictions, measured failures, and reflections
into the next round. Every perspective remains separate; there is no fifth model
and no vote that forces semantic agreement. A test pass supports the capability
contract, not every claim in a hypothesis.

The first contract is concrete: each of Movement, Evolution, Being, and Design
generates `capability.py` implementing `build_units(dimension)`. A trusted
validator checks 64 unique six-bit units per dimension, the three heart pairs,
two mind triples, one body hexagram, identity, and the original perspective.
All four passing outputs form a 256-unit catalog. Space remains the user's
representation formed from the contributors; this catalog is its input data,
not a completed 3D user scene.

## Run a real sandbox demonstration

Install the project's requirements and provision Docker with `python:3.12-slim`.
The CLI binds to the local `/var/run/docker.sock` daemon.

```sh
docker pull python:3.12-slim
python -m autonomy.demo /tmp/stellar-replay --broken-first-round
python -m autonomy --replay /tmp/stellar-replay --workspace /tmp/stellar-builder
```

This explicitly uses recorded responses. The first Movement candidate fails;
the second round recovers. The code genuinely runs in isolated containers.
No live LLM research is claimed in this mode.

## Connect live models

Copy `config.example.json` to an ignored local config and set the four chosen
Hugging Face model IDs. Set `HF_TOKEN` through your runtime's secret mechanism
with Inference Providers permission. A model repository read token alone does
not establish inference permission. Never put the token in the config file.

```sh
python -m autonomy --config autonomy/config.local.json --workspace autonomy-workspace
```

No model identities are invented: Dilbert, Cynthia, or Trident are not silently
assigned to bigrams, trigrams, or hexagrams. Four model connections are four
dimension perspectives; six-line units are the representation they build.

The model adapter performs real Hugging Face chat-completion calls, parses JSON,
and reports auth/provider/model failures. Exactly four perspective slots exist;
the same pretrained weights can be used in more than one slot if deliberately
configured. This is distinct from training four models from scratch.

## Persistent worker

```sh
python -m autonomy --config autonomy/config.local.json --serve
```

Submit `autonomy-workspace/queue/job-name.json` containing
`{"task":"hexagram-catalog"}`. The worker stays running and processes queued
jobs; it does not make unbounded model calls when idle. Jobs have at most three
rounds. Finished and blocked jobs move into their respective queue folders.
Use a process supervisor on an always-on machine for 24/7 service. Nothing is
deployed or scheduled on a paid service by this package.

## Evidence and active capabilities

Each run writes a journal with source text and content hashes, research
citations, hypothesis predictions, candidate code hashes, code, measured results,
and reflections. Source content is evidence rather than instructions. Research
is grounded in configured local files or HTTPS URLs; this first version does
not discover new web sources itself or claim an unsupported citation is true.
Model citations must refer to successfully retrieved evidence IDs. Semantic
support still needs a stronger evaluator or human review.

After all four contributions pass, `active.json` atomically points to that
version's `catalog.json`. A failed job leaves the previous active capability
untouched. The catalog works as ordinary data without ongoing LLM calls.
Generated Python modules are retained as versioned capabilities; they should
continue to run through the sandbox rather than being imported onto the host.

Containers have no network, no credentials, a read-only candidate mount, a
read-only root, no added capabilities, a non-root user, and time/memory/output
limits. If Docker is unavailable the builder stops. It never falls back to
executing generated code in the host process. Accepted data is validated in
the trusted host engine, not by model-written tests.

The trusted core and acceptance rules are ordinary maintained code. Extending
to general app changes requires additional capability contracts and validators;
this first job cannot arbitrarily modify the website or its own engine.
