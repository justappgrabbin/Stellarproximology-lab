import json
import tempfile
import unittest
from pathlib import Path
import torch
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
from visual_models import train_visual, render_animation, VisualMotionModel
from safetensors.torch import load_file

class VisualTrainingTest(unittest.TestCase):
    def test_training_export_and_moving_frames(self):
        torch.manual_seed(5)
        torch.set_num_threads(1)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            Image.new('RGB', (32, 32), (90, 70, 120)).save(root / 'photo.png')
            samples = []
            for number, phase in enumerate((0., .25, .5, .75)):
                image = Image.new('RGB', (32, 32), (15, 20, 30))
                ImageDraw.Draw(image).rectangle((number*5, 8, number*5+10, 24), fill=(230, 130, 50))
                image.save(root / f'frame-{number}.png')
                samples.append(dict(identity='photo.png', target=f'frame-{number}.png', theme='test', action='walk', phase=phase))
            (root / 'manifest.json').write_text(json.dumps(dict(samples=samples)))
            info = train_visual(str(root / 'manifest.json'), str(root / 'model'), epochs=30, size=32, width=8)
            self.assertLess(info['loss'][-1], info['loss'][0] * .8)
            model = VisualMotionModel(2, 8)
            model.load_state_dict(load_file(str(root / 'model/visual.safetensors')))
            model.eval()
            compiled = torch.jit.load(str(root / 'model/visual.pt'))
            inputs = (torch.rand(1, 3, 32, 32), torch.ones(1, 2), torch.tensor([[.25]]))
            torch.testing.assert_close(model(*inputs), compiled(*inputs))
            portable = ort.InferenceSession(str(root / 'model/visual.onnx'), providers=['CPUExecutionProvider'])
            actual = portable.run(None, dict(zip(['identity_rgb', 'theme_action_onehot', 'cycle_phase'], [x.numpy() for x in inputs])))[0]
            np.testing.assert_allclose(actual, model(*inputs).detach().numpy(), atol=1e-5)
            render_animation(str(root / 'model'), str(root / 'photo.png'), 'test', 'walk', str(root / 'motion.gif'), frames=4)
            with Image.open(root / 'motion.gif') as animation:
                self.assertGreater(animation.n_frames, 1)
            with self.assertRaises(ValueError):
                render_animation(str(root / 'model'), str(root / 'photo.png'), 'untrained', 'walk', str(root / 'bad.gif'))
            samples[0]['identity'] = '../outside.png'
            (root / 'manifest.json').write_text(json.dumps(dict(samples=samples)))
            with self.assertRaises(ValueError):
                train_visual(str(root / 'manifest.json'), str(root / 'invalid'), epochs=1, size=32)

if __name__ == '__main__':
    unittest.main()
