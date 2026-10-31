# Dimension-assigned research team — existing Modelmaker Assembly

This is a backend feature inside the existing `Modelmaker-repair/assembly` private runtime on the `feature/dimension-source-research-team` branch. It does **not** replace the main Trident trainer or change the user's architecture.

## Assignment contract

Four user-defined research positions: **Movement, Evolution, Being, Design**. They gather source information, not primitives, verdicts, predictions, or dimensional scores. Space is not silently assigned as a fifth researcher.

Each model must be given, by the owner:
- Its named dimension and research scope/instructions.
- Its **existing local checkpoint directory**.
- The exact `document_ids` of the particular sources assigned to it.

`configure` refuses missing or invented checkpoints, sources, or instructions. It refuses documents from another profile. Assignments may overlap in sources only when explicitly supplied.

## Required research behavior

Read the full stored text of each assigned source in passage order, without keyword-search substitution. For each passage, collect terminology, claims, relationships, examples, mechanisms, counterexamples, nuances, cross-references, ambiguities, and open questions. Preserve verifiable short exact quotations, source title/reference, original character offsets, raw candidate output, and failed attempts. Do not declare unsupported correspondences.

An observation is recorded as source-anchored only if its quotation occurs verbatim in the supplied passage. Invalid JSON, invented quotations, and unavailable checkpoints remain `needs_review` and do not count toward passage traversal.

**A source can be traversed without every fact having been captured.** `traversal_complete` means that all indexed source passages have at least one anchored research note, **not** that semantic exhaustiveness or theoretical truth has been established. Verify depth separately by auditing the exported notes against the full source. No source material is approved as neural training targets by this process.

## Use it

Run from `Modelmaker-repair` with the dependencies already required by the private Modelmaker assembly:

```bash
python -m assembly.dimension_research sources
python -m assembly.dimension_research configure --manifest /path/to/owner-approved-assignments.json
python -m assembly.dimension_research status
python -m assembly.dimension_research run --dimension Movement --max-passages 5
python -m assembly.dimension_research export --dimension Movement
```

The manifest is JSON with one top-level `assignments` array containing exactly four records. Each record must supply `dimension`, `checkpoint`, `document_ids` (array), and `instructions`. The real assigned source list and real checkpoints are deliberately required instead of invented sample IDs.

The private local FastAPI application also exposes these routes:
- `GET /api/computer/research-team/sources`
- `GET /api/computer/research-team/status`
- `POST /api/computer/research-team/configure` with the manifest JSON body
- `POST /api/computer/research-team/run` with a JSON object containing `dimension` and `max_passages`
- `GET /api/computer/research-team/export/{dimension}`

No auto-run, scheduled process, internet publication, remote inference, or Hugging Face deployment is performed by this branch.

## What is already wired and what is not

- Existing document store: `Assembly.documents` in the local Modelmaker SQLite database. Use the existing private upload interface to index supported PDF/DOCX/text first.
- Existing inference interface: `Assembly.load_model` + `Assembly.generate_text`, currently compatible with its local Transformers/safetensors checkpoints. The main Trident `NeuralMaker` checkpoint format is **different** and is not silently accepted here.
- Source coverage: the new runner traverses all stored source text, even though the older upload `study` path may analyze only its first 16 passages.
- Unsupported/scanned/binary source content must be separately surfaced for extraction and cannot be counted as read. The source store only contains text successfully extracted by the original upload process.
- Team research can be checked by `python -m unittest discover -s tests -p test_dimension_research.py -v`. Tests use simulated research output; **they do not establish that four real trained research models exist or have already read the user's books**.
- Four individual dimension checkpoint assignments and a particular approved source manifest are still needed before a real research run can start.

The work remains isolated on this feature branch pending integration review. The source repository and official Modelmaker Space have not been overwritten.
