# Synthia Research Mesh Android

A mobile-first Android research instrument built from the user's earlier Synthia architecture.

## What is implemented

- **Automatic registered intake** for imported Drive/Android files, pasted conversations, research runs, reports and coder proposals.
- **Local RAG** across the registered corpus and canon seed.
- **arXiv retrieval** through the arXiv Atom API.
- **PubMed retrieval** through NCBI E-utilities.
- **Google search adapter** through optional Google Programmable Search credentials stored locally on-device.
- **Google Drive intake without embedded OAuth secrets** through Android's Storage Access Framework. On Android, the system file picker can expose Google Drive when Drive is installed/configured.
- **Pure Synthia lineage** as the runtime concept: deterministic registered automata, recursive state, provenance and explicit rule status.
- **Klein context mesh**: edges are derived from co-active terms in explicit context and keyed by deterministic context signatures.
- **Concept Miner** representing a first lightweight DISEMINER + MESSY + AUTOLING pass.
- **AutoNovel** report assembly that separates retrieved evidence from generated synthesis.
- **Synthia Coder** that emits additive component specs, JavaScript scaffolds and tests without modifying canon.
- Mobile purple UI packaged inside a native Android WebView shell.

## Architecture

```
Android shell
  ├─ Drive / Files intake
  ├─ Native HTTPS bridge
  │    ├─ arXiv
  │    ├─ PubMed
  │    └─ Google Programmable Search (optional)
  └─ Synthia Research Runtime
       ├─ IntakeRegistrar
       ├─ ResearchScout
       ├─ EvidenceMiner
       ├─ ConceptMiner (DISEMINER/MESSY/AUTOLING first pass)
       ├─ KleinResolver / witnessed mesh
       ├─ AutoNovel
       ├─ ReportVerifier boundary
       └─ SynthiaCoder
```

## Important integrity rule

Retrieved evidence, registered project/canon material, and generated synthesis are separate object classes. AutoNovel reports identify generated narrative as synthesis.

## Build APK

The repository includes `.github/workflows/build-apk.yml`.

Push to `main` or manually run **Build Android APK** from GitHub Actions. The workflow builds `app-debug.apk` and uploads it as the artifact `synthia-research-mesh-apk`.

No terminal is required on the phone.

## Current version

`0.1.0` is the first runnable research-mesh build. It intentionally does not claim that the lightweight Concept Miner is the complete historical AUTOLING/DISEMINER/MESSY implementation. Those names define the target functional lineage; this version provides the working intake, retrieval, provenance, mesh, concept, report and coder spine needed to grow them without replacing the architecture.
