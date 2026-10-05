Modelmaker visual animation training
===================================

The Visual animation models panel trains a real photo-conditioned neural frame
renderer. This is a specialized supervised model, not a pretrained general image
or video generator. It is separate from VQ-VAE episodic memory.

Upload a ZIP containing manifest.json and images. Example manifest:

```json
{"samples":[
  {"identity":"identity.png","target":"walk-0.png","theme":"butterfly-city","action":"walk","phase":0.0},
  {"identity":"identity.png","target":"walk-1.png","theme":"butterfly-city","action":"walk","phase":0.5}
]}
```

Include varied identities and full animation cycles for each desired theme and
action. A single photo alone cannot teach motion or new worlds. Real game captures,
authored animations, or licensed paired assets can provide those target frames.
The trainer uses reconstruction loss and exports actual learned weights in
safetensors, TorchScript and ONNX executables, and visual.json describing its inputs.
The cyclic phase input lets a game request successive frames while its simulation
controls position, collisions, and actions; videos do not replace that simulation.

Python use:

```python
from visual_models import train_visual, render_animation
train_visual("dataset/manifest.json", "visual-model", epochs=100)
render_animation("visual-model", "identity.png", "butterfly-city", "walk", "walk.gif")
```

Exported coverage is restricted to trained themes/actions. TorchScript is a tested
Python inference artifact, not a claim of working Android/iOS deployment. Native
phone inference and the game renderer adapter still need integration. This compact
renderer is an initial trainable component; it does not meet photoreal reference
fidelity or arbitrary request-driven generation by itself.
