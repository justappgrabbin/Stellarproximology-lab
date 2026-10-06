# Stellarproximology Lab

Modelmaker trains specialized models. The Human Design workspace explores approximate charts and reflections. The evolution workflow generates small candidates and requires the owner, `justappgrabbin`, to approve both pushing and merging each version.

## Approval cycle

1. Open **Actions → Evolution research and candidate → Run workflow**. Enter a development need without private birth details or client notes.
2. Download the `evolution-candidate` artifact. Read `REVIEW.md` and full replacement files in `proposal.json`. Generation does not execute code or push changes.
3. Approve pushing by running **Evolution approved push** on `main`, entering the research run ID and the exact SHA-256 from `REVIEW.md`.
4. The workflow creates an `evolution/…` branch and draft pull request. Main is unchanged. Credential-free checks run on the exact new commit; their status appears as `evolution/validated`.
5. Review the diff and checks. Mark the PR **Ready for review**. Approve merging by running **Evolution approved merge** on `main`, entering the PR number and the full approved commit SHA. Changed commits need a new approval.

Owner-only checks are enforced by the workflows and helper, not a browser checkbox. Repository administrators can still bypass workflows; add a main-branch ruleset with required checks and restricted direct pushes for repository-wide enforcement. This PR does not configure repository rulesets.

## Setup once, after reviewing this change

- In repository **Settings → Actions → General**, enable **Allow GitHub Actions to create and approve pull requests**. The workflow creates draft PRs; it never files an approving review as a substitute for you.
- Add the secret `EVOLUTION_HF_TOKEN` with access to an inference provider.
- Add the repository variable `EVOLUTION_MODEL` containing an inference-capable coding model ID supported by that provider. The Modelmaker Space trains a small GPT-2 model; it is not itself a general-purpose coding inference endpoint.
- To enable weekly candidate generation on Mondays at 09:21 UTC, set `EVOLUTION_SCHEDULE_ENABLED=true`. Otherwise the schedule skips code generation. It never pushes, merges, or deploys on a schedule.
- Provider inference may incur charges. Choose the provider/model and spending limits before enabling generation. No training job or paid GPU is launched by this PR.

If the model or secret is absent, research returns a setup report rather than claiming a generated improvement. Run history, downloadable artifacts, timeout limits, and explicit failure messages make interruptions visible.

## App files

`human-design/dist/` contains the frontend and the supplied approximate Synthia calculation engine. Its private source corpus is deliberately excluded from this public repository. For local use, add your `corpus.json` with `gates` and `sources` arrays. The private Site checkout has the supplied corpus already. Do not commit client charts, local storage exports, or private Drive material.

Serve the frontend with `python -m http.server 8000 --directory human-design/dist`. The Build & Evolve panel links to real GitHub workflows. GitHub authenticates approval; the browser stores no GitHub write token.

`Modelmaker-repair/` contains the original model builder with an evolution help panel. To update the existing Hugging Face Space, copy reviewed files to its root; no Space deployment or model-training job is initiated automatically.

## Verification

Run `python scripts/check_app.py`. This verifies Python and JavaScript syntax, the approval state machine, all 36 chart channels, deterministic chart calculation, and the 88-degree Design arc. It does not prove generated code is safe or that interpretations are scientifically validated. Read every proposed diff.

## Boundaries

Automated candidates are limited to app files. They cannot change workflows, approval policy, hidden files, dependency lists, or the private corpus. No deletions, direct main pushes, automatic merging, automatic deployment, or publication of advertisements are performed by the evolution automation. Broader changes can be proposed in a separately reviewed PR.

## On your computer: Auto Lab and Publishing Studio

Download this branch/approved repository ZIP and extract it. Install Python 3.10+.
Run `python local-learning/service.py` from the extracted project, then open
http://127.0.0.1:8765. Windows also has `local-learning/start-local.bat`; macOS/Linux
has `local-learning/start-local.command` (run with `sh` if the download loses permissions).
The default byte-ngram trainer needs no extra packages. For SynthAI2's experimental
TRIDENT neural trainer, install `local-learning/requirements.txt` first. No Hugging
Face reference model is silently downloaded or claimed to be installed.

Local training saves checkpoints, metrics, plans, and releases in
`local-learning/data/` on your computer. Each approved Auto Lab plan has 1–5 runs,
a bounded interval, one worker at a time, and a pause control. Plans pause when the
service restarts; the service must remain open for scheduled experiments.
Model Go Round Shoppe lets you select and test saved checkpoints and inspect
SynthAI2's seven-model reference catalog. Small byte models are experimental;
the chart assistant still uses its existing source-based rules and retrieval.

Publishing Studio stages the exact ZIP, shows its model card, included files,
metrics, destination, and SHA-256, then requires personal approval. Downloads
stay local. GitHub publishing requires `GH_TOKEN` only in the service environment,
with access to the chosen repository; it uploads a draft asset before publishing
the reviewed release. Release visibility follows repository visibility. Optional
Hugging Face publishing uses server-side `HF_TOKEN` and a **new private** model repo.
No training corpus, chart, reflection, or credential is included, but model weights
may memorize training material: inspect your training source before publishing.

For **GitHub Release + project page**, merge this PR first and set repository
Settings → Pages → Source to GitHub Actions. The token must allow workflow dispatch.
The owner-only `publish-project-page.yml` verifies the approved release ZIP's digest
and deploys its escaped static `index.html` through the `github-pages` environment.
Configure that environment to require your approval if you want an additional
deployment review. Publishing a project page replaces the repository's existing
Pages site. Other destination repositories need the same workflow installed.
A requested workflow is not a successful deployment; inspect its Actions result.

The supplied private Drive corpus is intentionally excluded from this public
repository. To use a separately downloaded corpus locally, launch with
`python local-learning/service.py --corpus /path/to/corpus.json`.

## Pure JavaScript swarm / automata analysis

Install Node.js 22+ on your computer, then open **Swarm / automata** in the local
app. Load UTF-8 text, JSON, or JavaScript (up to 200 KB). Each approved run:

1. Reduces bytes to a dictionary and minimum fixed-width dictionary indexes.
2. Reconstructs the exact full-size source and verifies its SHA-256 independently.
3. Splits work into five execution partitions named Movement, Evolution, Being,
   Design, and Space. These are partition labels, not semantic roles. Five
   contiguous byte ranges cover the entire source; JSON scalar workloads are
   separately split into five contiguous ordinal ranges.
4. Executes the supplied Automaton/AutomataMesh runtime with bounded, fixed
   mathematical analysis tools. Combines partition findings and checks coverage.
5. Records the source identity, tool addresses, partition ranges, findings,
   version changes, evidence, follow-up tasks, and routing address locally.
6. Routes a review task to `local-learning/data/routes/build`, `experiments`,
   `papers`, or `library`. Automatic routing uses JavaScript → build, numeric
   JSON → experiments, other text → library. Explicit destinations override it.

This representation is lossless but is not guaranteed to be smaller than the
original. It does not infer semantics from bytes. JSON math operates on parsed
numeric scalars; adjacent scalar transitions follow traversal order, not an
assumed timeline. Arbitrary uploaded JavaScript is **not evaluated**: the service
performs Node syntax checks and produces build-review tasks. This first integration
uses fixed analysis executors; autonomous code repair/tool creation is not enabled.

The papers route creates a local research draft from recorded results with
explicit limitations. **Prepare paper for publishing review** stages that draft,
evidence record and static project page in Publishing Studio. Inspect the bundle,
edit/review the research locally, and approve before GitHub publication. These are
computational drafts, not claims of peer review or established scientific findings.
