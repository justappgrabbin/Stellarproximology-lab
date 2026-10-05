import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("trainer", ROOT / "Modelmaker-repair" / "app.py")
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)


class ModelmakerTests(unittest.TestCase):
    def test_ui_constructs(self):
        self.assertIsNotNone(trainer.build_ui())

    def test_small_corpus_and_invalid_parameters(self):
        args = ["seed", "too small", None, 512, 32, 1, 1, 32, 1, 1, 0.0003, False]
        status, artifact = trainer.train_model(*args, progress=lambda *a, **k: None)
        self.assertIn("Build failed", status)
        self.assertIsNone(artifact)
        args[9] = 0
        status, artifact = trainer.train_model(*args, progress=lambda *a, **k: None)
        self.assertIn("batch_size must be a positive integer", status)
        self.assertIsNone(artifact)

    def test_train_export_reload_and_label_alignment(self):
        torch.set_num_threads(1)
        corpus = "Heart direction social. Mind transpersonal thought. Body personal action. Unicode: 心 ☰.\n" * 30
        observed = []
        forward = GPT2LMHeadModel.forward

        def checked_forward(model, *args, **kwargs):
            if "labels" in kwargs:
                observed.append(torch.equal(kwargs["input_ids"], kwargs["labels"]))
            return forward(model, *args, **kwargs)

        with patch.object(GPT2LMHeadModel, "forward", checked_forward):
            status, artifact = trainer.train_model(
                "smoke-seed", corpus, None, 512, 32, 1, 1, 32, 1, 4, 0.0003, False,
                progress=lambda *a, **k: None,
            )
        self.assertIsNotNone(artifact, status)
        self.assertTrue(observed and all(observed), "GPT2 must shift its own labels once")
        with tempfile.TemporaryDirectory() as directory:
            with zipfile.ZipFile(artifact) as archive:
                archive.extractall(directory)
            meta = json.loads((Path(directory) / "modelmaker_build.json").read_text())
            self.assertEqual(meta["layers"], 1)
            self.assertTrue(meta["loss_history"][0] > 0)
            tokenizer = GPT2TokenizerFast.from_pretrained(directory)
            model = GPT2LMHeadModel.from_pretrained(directory)
            tokens = tokenizer("Heart", return_tensors="pt")
            result = model.generate(**tokens, max_new_tokens=4, do_sample=False,
                                    pad_token_id=tokenizer.pad_token_id)
            self.assertGreater(result.shape[1], tokens["input_ids"].shape[1])


if __name__ == "__main__":
    unittest.main()
