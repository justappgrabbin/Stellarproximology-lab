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
