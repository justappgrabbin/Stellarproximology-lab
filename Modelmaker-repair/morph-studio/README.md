# Modelmaker Morph Studio

A separate **non-LLM neural image training** mode for Modelmaker. No model provider, remote inference, pretrained downloads, npm dependencies, or API keys. Images and training stay in the browser. A Web Worker optimizes real weights with Adam; rendering uses those weights.

## Use

Open the published studio or download `morph-standalone.html` and open it in a modern browser. Add at least two aligned source/target image pairs. Each pair stores the current full 13-field Trinity address, six emotion channels, and scene phase. The last pair is excluded from training. Train, inspect held-out error, render, and download ONNX **and** the JSON manifest/weights. JSON can be reimported to resume inference across sessions. Training itself starts a fresh model each time.

The full address schema is `planetary, dimension, gate, line, color, tone, base, degree, minute, second, arc {axis, arcUnit}, zodiac, house`. Its numerical encoding is specified in `dist/neural.mjs`. Dimensions retain Being/Evolution/Movement/Design/Space. This initial module learns their effects from paired images; it does not assert biochemical or physical causation. Admin notes and source document filenames are saved as provenance, not represented as image training examples.

## Architecture and limits

The compact **conditional neural image field** is a two-layer MLP (`Tanh`, `Sigmoid`) predicting RGB from a 4×4 source-image descriptor, local source RGB, Fourier position coordinates, and context. It learns color and spatial appearance at 32–128px. No forced SVG avatar shapes or predetermined destination silhouettes are used. The model outputs pixels, not a 3D rig or game entity.

This is a working training/export foundation, **not** the completed photorealistic photo-to-character/world engine. It has no face recognition, guaranteed identity preservation, pose controls, emotion sensing, skeletal animation, scene execution, or pretrained avatar quality. Photorealistic quality needs a larger architecture, suitable paired identity/pose training data, training compute, and measured identity/generalization results. A single photo or prose PDF is not enough to train that capability from scratch.

## ONNX contract

IR 8, opset 13. Float32 `features: [pixels, INPUT_SIZE]` → `rgb: [pixels, 3]`. `INPUT_SIZE` is exported by `dist/neural.mjs`; use its exact `descriptor()`, `encodeAddress()`, and `features()` preprocessing. ONNX contains the trained MLP weights, not image decoding or preprocessing. JSON includes resolution, validation history, addresses, and provenance. A CI check is included to validate exported graphs against ONNX Runtime; local dependency installation was blocked, so that independent runtime check has not yet run here.

## Develop

`node --test tests/*.test.mjs` verifies learning and persistence. `node tests/export-fixture.mjs && python tests/check_onnx.py` independently checks ONNX and inference parity (Python requires onnx, onnxruntime, numpy). `python build-standalone.py` regenerates the downloadable version. Serve `dist/` with any static HTTP server. The hosted version caches its local assets for offline revisits.

## Existing Hugging Face Modelmaker

`morph_ui.py` adds an isolated Morph Studio tab to the existing Gradio app. Copy the entire updated `Modelmaker-repair` directory when deploying to the Space so the standalone HTML is present. Existing text training is unchanged. The new feature works inside the sandboxed frame, and a file download is provided as a fallback.

## Procedural generation and nonverbal learning

A second route consumes numeric state directly and creates a deterministic 2D scene. The procedural seed controls geometry; actor/world parameters control proportions, color, ornament, environment density/elevation, phase, and walking animation. An optional manually cropped face image is placed on the procedural body. Scene JSON is exportable; photo pixels are not embedded in scene JSON. This is a basic 2D demonstrator, not a realistic avatar rendering claim.

Explicit source-to-target rules can bind numeric traits supplied by the sensory/state adapter. A separate small neural adapter learns three procedural parameters from observed numeric states, with the last example held out. It does not require words. Download/load its trained adapter JSON across sessions. The software does not infer a person's innate drawing talent from Human Design or claim that visualExpression is an empirically validated trait. Trait definitions and observations must be supplied by the user.
