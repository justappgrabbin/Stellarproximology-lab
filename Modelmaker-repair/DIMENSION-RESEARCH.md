# Modelmaker — shared-source, comparative Klein research positions

This is an extension to the **existing Modelmaker** on the GitHub branch `feature/dimension-source-research-team`. It does not replace the user's native TRIDENT model, the retained Klein automata or the official computer. It is an isolated draft, not a production deployment.

## Contract: one corpus, four independently situated positions

- **Movement**, **Evolution**, **Being**, and **Design** are positions in the same source field, not four partitions of the library.
- Every one receives **exactly the same indexed document collection** from the current private Modelmaker user profile, including new documents added later.
- Every position keeps a separate tool state, source-reading receipts and model checkpoint reference. No source-level labels or primitive vocabulary are assigned in advance.
- Each position investigates the whole source through its own lens. Researchers collect information, nuance, relationships, examples, disagreements, questions and boundaries. No primitive-extraction goal is imposed.
- A later comparison preserves their separately grounded observations, including divergence. Quote overlap alone is **not** proof of equivalent interpretation.
- Space is not invented as a fifth assigned position.

## Integrations already in this branch

The existing `Assembly` provides owner-scoped SQLite documents and source text. The existing `KleinBridge` invokes the **preserved Klein automata** (including AUTOLING and DISEMINER) under a distinct deterministic per-position state key. `DimensionResearch` adds a shared-source registry, independent research receipts, source coverage tracking and cross-position comparison. Its `observe_klein` path uses actual Klein tools; its `run` path invokes an explicitly loaded local **compatible** language-model checkpoint. These are separate operations with separate receipts.

Native positional meaning is taken from the existing `state-space/dimensions.js` `projectDimension`, not from a new invented set of synonyms. Each successful Klein tool receipt also retains `behavioralChain` from that file and `sourceCrystalChain` from `state-space/dimension-canon.js` as **different, unresolved chain interpretations**; neither is silently promoted over the other. Space remains unassigned as a researcher and its unresolved first-class/emergent role is untouched.

The comparison works on exact document IDs and character ranges. Each position can be incomplete; failures and unprocessed passages remain visible. Native Klein analysis receipts are **not** proof of complete semantic extraction. A source may be fully traversed with information still missing.

## The three October 30 user-supplied ZIP references

| Source | Verified contents | Contribution without replacing user architecture |
|---|---|---|
| `train-llm-from-scratch-main.zip` | PyTorch training, classic/modern Transformers, LoRA, next-token/SFT losses, model checkpoints, preference training, evaluations | Engineering reference for training/benchmark implementation; not imported as a replacement for the owner's TRIDENT |
| `Smart-File-Organizer-main.zip` | Tkinter folder watcher, configurable keyword rules, file-extension sorting, `shutil.move` | Use only source monitoring and non-destructive routing ideas; do not automatically move original research files |
| `bazi-profile-main.zip` | Calculation engine, structural signatures, pairwise differentiation, anti-generic linting | Use evidence/interpretation separation and comparison checks as *patterns*; no unsupported BaZi↔Klein correspondences are asserted |

The ZIP contents were inspected for design. No third-party package was copied into the model, and none is silently executed or installed.

## Setup and running

After importing supported text/PDF/DOCX material into the existing private Modelmaker source store:

```bash
cd Modelmaker-repair
python -m assembly.dimension_research sources
```

Configure **positions**, never per-position document lists. Example manifest format (replace position instructions with the owner's real intended comparison lenses; no checkpoints need to be invented at setup):

```json
{
  "positions": [
    {"dimension":"Movement","checkpoint":null},
    {"dimension":"Evolution","checkpoint":null},
    {"dimension":"Being","checkpoint":null},
    {"dimension":"Design","checkpoint":null}
  ]
}
```

```bash
python -m assembly.dimension_research configure --manifest /path/to/positions.json
python -m assembly.dimension_research klein-all --max-passages 5
python -m assembly.dimension_research klein --dimension Movement --max-passages 5
python -m assembly.dimension_research klein --dimension Evolution --max-passages 5
python -m assembly.dimension_research klein --dimension Being --max-passages 5
python -m assembly.dimension_research klein --dimension Design --max-passages 5
python -m assembly.dimension_research compare
python -m assembly.dimension_research status
```

Re-running an unchanged configuration preserves prior observations. New text documents become available to all four. If a position's checkpoint or owner-specified instructions change, that position's old research receipts are invalidated and a different Klein state key is used.

## Selected architecture: one shared native TRIDENT and four learned positions

The owner selected **one shared frozen native TRIDENT base** plus four independent trainable Klein adapters, not four separate Transformer checkpoints. See [SHARED-TRIDENT-POSITIONS.md](SHARED-TRIDENT-POSITIONS.md) for the actual implementation, exact input/approval contract, native tool evidence gate, training CLI, private UI and real-weight regression tests.

In the local Modelmaker choose **Klein research team**, configure the shared sources, process the same sources under all four native Klein positions, then load **one actual trained native TRIDENT**. Review distinct source-anchored training/held-out examples for each position and train the adapters independently. Original TRIDENT weights are frozen and not copied into each position.

The older `assembly.dimension_research run` pathway still accepts a *per-position separate Transformers/safetensors checkpoint*, but it is **not the selected neural build**; do not use it in place of the shared TRIDENT implementation. This legacy path remains for existing compatibility and has not been silently rewritten to accept incompatible TRIDENT checkpoints.

## Private API in existing Modelmaker

- `GET /api/computer/research-team/sources`
- `POST /api/computer/research-team/configure` with the manifest body containing `positions`
- `POST /api/computer/research-team/klein-all` with `max_passages_per_position` (advances all four)
- `POST /api/computer/research-team/klein` with `dimension`, `max_passages`
- `POST /api/computer/research-team/run` with `dimension`, `max_passages` (requires compatible checkpoint) — legacy separate-checkpoint mode, not the selected shared-TRIDENT mode
- `GET /api/computer/research-team/status`
- `GET /api/computer/research-team/compare` (optional `document_id`)
- `GET /api/computer/research-team/export/{dimension}`
- `GET /api/computer/research-team/trident/status` and `POST /api/computer/research-team/trident/{train,generate,compare}` (selected shared native TRIDENT)

The private app is **not** automatically deployed to Hugging Face. The ZIP references themselves are not a substitute for user-selected research corpora. Imported unreadable/scanned/binary material is not considered complete; the existing upload layer reports its actual extraction limits.

## Evidence and verification

Run `python -m unittest discover -s tests -p test_dimension_research.py -v`. Tests cover same corpus delivered to each position, separate position state keys, incomplete receipts, source isolation, dynamic source arrival, and invalid quote rejection. A passing unit test does not establish that the user's actual model weights are trained or that substantive research has finished.

The collection-to-research-to-model-training connection remains a verifiable future step: detailed annotations from an actually trained model or owner-approved outputs could be used as structured supervised material **after review**, not silently installed as facts or trained weights.
