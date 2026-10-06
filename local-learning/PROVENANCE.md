# SynthAI2 lineage

Donor repository: https://github.com/justappgrabbin/Synthai2

Pinned source commit: cfbe3ee3018c41fc8abe6e1734eee5b630595a3f

- `trident_model.py` preserves the architecture from `synthia-server/model.py`: shared transformer backbone, Code/Math/Research heads, router, and optional retrieval-fusion gate. No donor weights are copied or automatically downloaded.
- `model_registry.py` preserves `synthia-server/synthia_core/model_registry.py`: seven model roles, input/output contracts, scopes, and fallback relationships. Entries are references; presence in this registry does not establish availability, installation, inference compatibility, or quality.
- `train_local.py` adapts the donor training approach to user-supplied corpora, UTF-8 byte tokenization, bounded CPU settings, held-out evaluation, progress files, and saved local checkpoints. It replaces the donor toy-data training loop.
- The dependency-free byte n-gram trainer, local service, and Model Go Round Shoppe interface are integration code added here.

No pretrained quality is claimed. Training a tiny model from scratch is an experiment, not a replacement for an evaluated assistant.
