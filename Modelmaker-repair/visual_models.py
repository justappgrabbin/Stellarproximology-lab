"""Supervised photo-conditioned animation models. Memory models are separate."""
from __future__ import annotations
import json
import math
from pathlib import Path
import torch
from torch import nn
from PIL import Image
from safetensors.torch import save_file, load_file

class VisualMotionModel(nn.Module):
    def __init__(self, conditions: int, width: int = 32):
        super().__init__()
        self.condition = nn.Linear(conditions + 2, width)
        self.encoder = nn.Sequential(nn.Conv2d(3, width, 3, padding=1), nn.SiLU(),
                                     nn.Conv2d(width, width, 3, padding=1), nn.SiLU())
        self.decoder = nn.Sequential(nn.Conv2d(width, width, 3, padding=1), nn.SiLU(),
                                     nn.Conv2d(width, 3, 3, padding=1), nn.Sigmoid())
    def forward(self, identity: torch.Tensor, condition: torch.Tensor, phase: torch.Tensor):
        cycle = torch.cat((torch.sin(phase * 2 * math.pi), torch.cos(phase * 2 * math.pi)), dim=1)
        features = self.encoder(identity)
        control = self.condition(torch.cat((condition, cycle), dim=1))[:, :, None, None]
        return self.decoder(features + control)

def image_tensor(path: Path, size: int):
    with Image.open(path) as image:
        image = image.convert('RGB').resize((size, size))
        values = torch.tensor(bytearray(image.tobytes()), dtype=torch.float32)
    return values.reshape(size, size, 3).permute(2, 0, 1) / 255

def inside(root: Path, relative: str):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('Dataset paths must name existing files inside the dataset folder')
    return path

def train_visual(manifest_path: str, output: str, epochs: int = 10, size: int = 64,
                 width: int = 32, learning_rate: float = 0.001):
    """Manifest samples: identity, target, theme, action, phase [0,1).

    Target frames are real supervision; no fabricated training pairs or claim of
    general-purpose text-to-video capabilities from an untrained compact model.
    """
    manifest = Path(manifest_path).resolve()
    samples = json.loads(manifest.read_text())['samples']
    if not samples or len(samples) > 1024 or not 1 <= int(epochs) <= 500 or size not in (32, 64, 128, 256):
        raise ValueError('Supply 1–1024 samples, 1–500 epochs, and a supported image size')
    themes = sorted({str(s['theme']) for s in samples})
    actions = sorted({str(s['action']) for s in samples})
    count = len(themes) + len(actions)
    model = VisualMotionModel(count, width)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    pairs = []
    for sample in samples:
        phase = float(sample['phase'])
        if not math.isfinite(phase) or not 0 <= phase < 1:
            raise ValueError('Frame phase must be finite and in [0,1)')
        condition = torch.zeros(1, count)
        condition[0, themes.index(str(sample['theme']))] = 1
        condition[0, len(themes) + actions.index(str(sample['action']))] = 1
        pairs.append((image_tensor(inside(manifest.parent, sample['identity']), size)[None],
                      condition, torch.tensor([[phase]]),
                      image_tensor(inside(manifest.parent, sample['target']), size)[None]))
    losses = []
    for _ in range(int(epochs)):
        total = 0
        for identity, condition, phase, target in pairs:
            optimizer.zero_grad()
            loss = nn.functional.mse_loss(model(identity, condition, phase), target)
            loss.backward()
            optimizer.step()
            total += float(loss.detach())
        losses.append(total / len(pairs))
    destination = Path(output)
    destination.mkdir(parents=True, exist_ok=True)
    model.eval()
    save_file(model.state_dict(), str(destination / 'visual.safetensors'))
    torch.jit.trace(model, pairs[0][:3]).save(str(destination / 'visual.pt'))
    torch.onnx.export(model, pairs[0][:3], str(destination / 'visual.onnx'),
                      input_names=['identity_rgb', 'theme_action_onehot', 'cycle_phase'],
                      output_names=['frame_rgb'], opset_version=17, dynamo=False,
                      dynamic_axes={name: {0: 'batch'} for name in
                                    ['identity_rgb', 'theme_action_onehot', 'cycle_phase', 'frame_rgb']})
    metadata = dict(schema='synthia.visual-motion.v1', themes=themes, actions=actions,
                    size=size, width=width, samples=len(pairs), epochs=int(epochs), loss=losses,
                    role='photo-conditioned-animation', general_text_generation=False,
                    runtime_inputs=['identity_rgb', 'theme_action_onehot', 'cycle_phase'])
    (destination / 'visual.json').write_text(json.dumps(metadata, indent=2))
    return metadata

def render_animation(package: str, identity: str, theme: str, action: str,
                     output: str, frames: int = 24, fps: int = 12):
    root = Path(package)
    info = json.loads((root / 'visual.json').read_text())
    if theme not in info['themes'] or action not in info['actions']:
        raise ValueError('This trained model does not cover that theme/action')
    if not 2 <= frames <= 240 or not 1 <= fps <= 60:
        raise ValueError('Use 2–240 frames and 1–60 fps')
    count = len(info['themes']) + len(info['actions'])
    model = VisualMotionModel(count, info['width'])
    model.load_state_dict(load_file(str(root / 'visual.safetensors')))
    model.eval()
    condition = torch.zeros(1, count)
    condition[0, info['themes'].index(theme)] = 1
    condition[0, len(info['themes']) + info['actions'].index(action)] = 1
    photo = image_tensor(Path(identity), info['size'])[None]
    images = []
    with torch.inference_mode():
        for frame in range(frames):
            pixels = model(photo, condition, torch.tensor([[frame / frames]]))[0]
            values = (pixels.permute(1, 2, 0).clamp(0, 1) * 255).byte().contiguous()
            images.append(Image.frombytes('RGB', (info['size'], info['size']), bytes(values.flatten().tolist())))
    images[0].save(output, save_all=True, append_images=images[1:], duration=round(1000/fps), loop=0)
    return output
