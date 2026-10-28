"""Real GPT2 Modelmaker training → saved weights → reload → inference.

Requires optional Torch/Transformers/Gradio dependencies. Uses only a synthetic
tiny corpus and deliberately does NOT measure useful dialogue quality.
"""
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synthia_server import ModelmakerCheckpoint, checkpoint_manifest
HAVE_STACK = all(importlib.util.find_spec(dep) for dep in (
    "torch", "transformers", "tokenizers", "gradio", "huggingface_hub"
))

@unittest.skipUnless(HAVE_STACK, "Modelmaker training dependencies are not installed")
class ActualWeightsTest(unittest.TestCase):
    def test_train_zip_load_generate(self):
        from app import train_model
        sample = ("USER: Hello Synthia.\nASSISTANT: Hello. I am your local model.\n" +
                  "USER: What are the Klein tools?\nASSISTANT: AutoLing and DISEMINER analyze language.\n") * 7
        with tempfile.TemporaryDirectory() as folder:
            message, archive = train_model(
                "synthia-smoke", sample, [], 256, 32, 1, 2, 32,
                1, 4, 0.001, False, progress=lambda *_args, **_kwargs: None)
            self.assertIsNotNone(archive, message)
            with zipfile.ZipFile(archive) as source:
                self.assertIn("model.safetensors", source.namelist())
                source.extractall(Path(folder) / "synthia-smoke")
            root = Path(folder) / "synthia-smoke"
            manifest = checkpoint_manifest(root)
            self.assertEqual(manifest["name"], "synthia-smoke")
            self.assertEqual(manifest["context_length"], 32)
            backend = ModelmakerCheckpoint(root)
            response = backend.complete([{"role": "user", "content": "Hello"}], max_tokens=8)
            self.assertEqual(response["model"], "synthia-smoke")
            self.assertGreaterEqual(response["usage"]["completion_tokens"], 1)
            self.assertIsInstance(response["choices"][0]["message"]["content"], str)
            self.assertGreater(manifest["parameters"], 0)

if __name__ == "__main__":
    unittest.main()
