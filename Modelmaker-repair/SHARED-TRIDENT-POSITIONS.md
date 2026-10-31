# One shared TRIDENT base + four independently learned Klein positions

**Implemented on the existing Modelmaker research-team branch.** This does not replace TRIDENT, any five-dimension canon, or the user's state-space. It does not silently train weights from an uploaded book.

## Actual neural architecture

```
Existing native SYNTHIA RelationalTrident (loaded once, parameters frozen)
  ├── original byte codec (260-byte/extended compatible)
  ├── original eight Klein-tool channels x 32 observed numerical features
  ├── original Klein encoder, backbone, and research/math/code heads
  └── select independently trained low-rank 8x32 feature adaptation
      ├── Movement adapter (separate weights / revisions)
      ├── Evolution adapter (separate weights / revisions)
      ├── Being adapter (separate weights / revisions)
      └── Design adapter (separate weights / revisions)
```

Each positional adapter has rank four on each of the eight existing feature channels. The learnable update is `clamp(features + bias[position] + features @ down[position] @ up[position], -3, 3)`. The same backbone receives the resulting valid native `[batch,8,32]` `klein` tensor. All original TRIDENT backbone parameters have `requires_grad=False`; the optimizer receives **only the selected position's** parameters. Other positions and base weights remain unchanged.

The 8x32 feature vector uses **the original** `semantic_features` from the user's `semantic_language_maker.py`. If genuine canonical 8x32 Klein tool measurements are available, records can include them in `klein`; they are validated and passed through the original additive interface. If absent, the original context feature builder is used and the receipt explicitly says no canonical Klein vector was provided. We do **not** invent a conversion of arbitrary AUTOLING JSON to numeric Klein features.

## One common corpus, four situated Klein processes

`DimensionResearch` makes the same currently indexed source text available to each position. Before a positional training record is accepted, the selected position must have run its existing, real, isolated Klein automata over the exact source span. Every accepted receipt includes the native `projectDimension` result, separated runtime behavioral chain and source crystal chain, and exact source hash. The neural trainer rejects missing/stale tool receipts, rejected tools, missing source quotations and source hashes that no longer match.

The source pool remains shared; the **approvals and response targets** can differ per position. That is the source of independently learned positional differences, not four different assigned reading lists. There is no primitive-extraction goal for the researchers.

## Deployment boundary

This branch carries unchanged copies of the two **existing** native TRIDENT files from `main` under `Modelmaker-repair/vendor/trident`. The CI workflow checks their exact Git blob SHA values against the original sources on `main`. The separate legacy GPT-2 training interface remains intact and is NOT used for these positional adapters.

You need **a real trained native TRIDENT checkpoint** (`config.json`, `weights.pt`) exported from the actual Modelmaker trainer. This code refuses a nonexistent, zero-step or non-native base. Training the 4 adapters does not create or substitute a pretrained base. An existing workspace `current.json` pointing to a revision can also be supplied.

## Use through private Modelmaker UI

Run the existing local private app from `Modelmaker-repair`, then select **Klein research team**. Import your actual source material via Books. Click **Configure shared source team** once, then **Analyze shared material with all four Klein positions** as many times as needed. Enter the actual native TRIDENT checkpoint directory, select the position, and paste approved training and held-out JSONL data. Click **Train only this position's adapter**. Compare all four on the same prompt after each has been trained.

**No example IDs are fabricated:** use `GET /api/computer/research-team/sources` (or `python -m assembly.dimension_research sources`) to obtain actual uploaded document IDs.

## Approved training record contract

Each JSONL record must contain:

```json
{
  "position": "Movement",
  "approved": true,
  "source_id": "ACTUAL_DOCUMENT_ID_FROM_YOUR_PRIVATE_MODELMAKER",
  "source_quote": "An exact quotation occurring in that indexed document",
  "prompt": "A question grounded in this source",
  "response": "The owner's approved response to the question",
  "head": "research"
}
```

This is a **schema illustration, not supplied training data**. Those values are intentionally descriptive; the source ID must be read from the user's actual local store. The selected position must match every record. Separate held-out records cannot overlap any training prompt/response pair. Inference, training and validation are intentionally different functions. Unread or nontext material cannot count as processed. Input longer than the native TRIDENT context is rejected instead of silently truncated.

## CLI

```bash
cd Modelmaker-repair
python -m assembly.dimension_research sources
python -m assembly.dimension_research configure --manifest positions.json
python -m assembly.dimension_research klein-all --max-passages 5
python -m assembly.positional_trident status --base /absolute/path/to/trained/trident
python -m assembly.positional_trident train --base /absolute/path/to/trained/trident --position Movement --train-jsonl movement-approved.jsonl --heldout-jsonl movement-heldout.jsonl --steps 10
python -m assembly.positional_trident generate --base /absolute/path/to/trained/trident --position Movement --prompt "What did the source observe?"
```

The CLI paths describe required user-provided inputs; they are **not** claims that those files already exist. Use the `--data` and `--user` options if the private source-profile is not the local default.

Training saves immutable adapter revision folders (under `.modelmaker/positional-trident/<base-hash>/<position>`), containing only adapter weights and provenance, not four copies of the full TRIDENT model.

Private API also exposes:
- `GET /api/computer/research-team/trident/status?base_checkpoint=...`
- `POST /api/computer/research-team/trident/train`
- `POST /api/computer/research-team/trident/generate`
- `POST /api/computer/research-team/trident/compare`

## What tests establish

`test_positional_trident.py` trains a real small native TRIDENT checkpoint, invokes real native Klein source analyses under all four separate position states, updates adapter weights with PyTorch gradients, reloads them, checks the frozen base fingerprint and unchanged other-position weights, then checks invalid/unapproved/stale research cases fail. `test-native-trident-positions.yml` executes those tests with CPU PyTorch.

A passed gradient/update test is **not** a claim that the user’s chosen sources have been comprehensively researched, that four fully trained researchers exist, or that the resulting model already predicts outcomes more accurately or cheaply than a reference model. Those require actual source intake, owner-approved training examples, held-out behavior evaluation and measured runtime/cost benchmarks.
