# Modelmaker: adaptive personal models (opt-in prototype)

This folder contains the **existing** GPT-style Modelmaker training function and a separate, functional personal adaptation mode. Neither the pretrained model trainer nor the original project files are replaced.

## Available now

- **Individual observations:** An explicitly attributed statement about a consenting person becomes an immutable event.
- **Evolving preferences:** Topic/value/evidence are stored as events; a newer correction becomes the active preference without deleting prior evidence.
- **Observer perspectives:** The Python API scopes records to the `(person_id, observer_id)` pair. The Gradio interface currently uses the `self` perspective.
- **Pre-action clarification:** When no prior evidence exists, a recommendation flags the cold start and asks which of the supplied actions the person actually prefers.
- **Personalized recommendations:** A contextual, outcome-driven **Thompson sampler** selects among actions supplied at runtime. Each action's reward estimate uses prior feedback, weighted by agreement with the current context. No content topics or human-design categories are hard-coded.
- **Post-action learning:** Recording helpfulness in `[0,1]` updates future action selection. Corrections append a new feedback event and supersede the previous value *in the learned projection only*.
- **Persistence:** Person-specific, append-only event history is held in a local SQLite file. The active view is reconstructed from the history, so the earlier state is recoverable.

Core code: `adaptive_person.py` (Python standard library). UI: the **Adaptive personal models** tab in `app.py`. Existing language-model training remains in the **Language model** tab.

## Run and test

The original requirements in `requirements.txt` are still needed to run the Gradio interface.

```sh
cd Modelmaker-repair
python -m unittest discover -s . -p 'test_adaptive_person.py' -v
python app.py
```

The SQLite file defaults to `~/.modelmaker/adaptive.sqlite3`. Set `MODELMAKER_ADAPTIVE_DB` to a trusted persistent path to override that location. The default is **not guaranteed durable** on an ephemeral hosted Space. Store no personal test data on a public Space.

## Evidence and integration boundaries

The choices below were inspired by the features described in the following public references, **not copied from their implementations**:

- Plastic Labs Honcho — peer-centric, changing human representations and observer viewpoints: https://github.com/plastic-labs/honcho (AGPL-3.0; **no Honcho AGPL code is embedded here**).
- Meta PAHF — pre-action clarification and post-action feedback: https://github.com/facebookresearch/PAHF (MIT).
- Thoughtworks SimpleBandit — feedback-driven action choice: https://github.com/thoughtworks/simplebandit (Apache-2.0; source is archived).
- Cognitive Engine — per-person preferences and social learning: https://github.com/medonomator/cognitive-engine (Apache-2.0).
- OpenSelf — provenance, revision history, and recoverable memory: https://github.com/Open-Self/Open-Self (MIT).
- Inno Agent — adaptive educational use case: https://github.com/hhyqhh/inno-agent (MIT).

This implementation covers **a minimal working slice** of those learning mechanisms, not their entire codebases or claimed capabilities. It does **not** run Honcho's LLM-derived psychographic model, the Cognitive Engine orchestrator, OpenSelf's signed provenance, PAHF's LLM question generation, or Inno Agent's full learner planning system. It cannot infer complex personal traits from raw speech or prove a person is understood. It learns **explicit observations/preferences and action outcomes**.

**Important Synthia boundary:** This branch lives in the existing standalone GitHub Modelmaker repair project. The SQLite event log is local storage for the slice; it is **not yet the canonical SWARM-OS state-space event store**, and it does not silently introduce a new canonical space. Before connecting to Synthia, use the already-implemented state-space address/provenance and model-to-swarm interfaces; inspect their current versions and add explicit round-trip tests. Do not invent a replacement mesh, another Model Maker primitive, or a new ontology.

## Security and privacy

**Do not publish this Gradio view for multiple real people yet.** The input ID and observer ID are data selectors, **not authentication**. Authentication, authorization, per-person consent, storage encryption, data retention controls, and participant-controlled access must be implemented and verified before public deployment. Use synthetic data or consenting participants in a trusted local session.

No external LLMs, web calls, background workers, model downloads, or Hugging Face API keys are required for the adaptive mechanism itself. The existing independent GPT language-model trainer has its existing dependencies and optional Hugging Face publishing behavior.

## Verification scope

GitHub Actions runs syntax checking and 6 standard-library unit tests covering:
1. Append-only observations and corrections.
2. Isolation of people and observer perspectives.
3. Context-weighted feedback learning and superseding outcomes.
4. Explicit cold start and clarifying question.
5. Invalid reward and wrong-person feedback rejection.
6. Persistence after reopening the database.

A **Gradio UI launch** and **Android / browser / shared-state-space integration** remain separate verification tasks. Successful unit tests are not evidence that those integrations work.
