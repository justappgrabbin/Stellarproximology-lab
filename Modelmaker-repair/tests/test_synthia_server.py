"""Protocol and checkpoint gates. No model download; no user data required."""
import importlib.util
import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synthia_server import checkpoint_manifest, validated_request, plain_chat_prompt, make_handler

class FakeModel:
    model_id = "synthia-seed"
    manifest = {"sha256": "0" * 64}
    received = None

    def complete(self, messages, max_tokens):
        self.received = (messages, max_tokens)
        return {"model": self.model_id, "choices": [
            {"message": {"role": "assistant", "content": "fake protocol reply"}}]}

class ServerTests(unittest.TestCase):
    def test_manifest_contains_unmodified_checkpoint_fingerprint(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            root = Path(d) / "synthia-seed"
            root.mkdir()
            (root / "model.safetensors").write_bytes(b"12345678" * 256)
            (root / "config.json").write_text(json.dumps({"model_type": "gpt2", "n_positions": 128}))
            (root / "tokenizer_config.json").write_text("{}")
            (root / "modelmaker_build.json").write_text(json.dumps({"name": "synthia-seed"}))
            before = (root / "model.safetensors").read_bytes()
            manifest = checkpoint_manifest(root)
            self.assertEqual(manifest["name"], "synthia-seed")
            self.assertEqual(manifest["sha256"], hashlib.sha256(before).hexdigest())
            self.assertEqual((root / "model.safetensors").read_bytes(), before)
            (root / "config.json").write_text('{"model_type":"other"}')
            with self.assertRaisesRegex(ValueError, "GPT-2"):
                checkpoint_manifest(root)

    def test_reject_unauthorized_model_and_malformed_chat(self):
        base = {"model": "synthia-seed", "messages": [{"role": "user", "content": "Hello"}],
                "max_tokens": 32}
        self.assertEqual(validated_request(base, "synthia-seed")[1], 32)
        for patch in (
            {"model": "../../another-model"},
            {"stream": True},
            {"max_tokens": True},
            {"messages": [{"role": "system", "content": "not user"}]},
            {"messages": [{"role": "tool", "content": "run shell"}]},
            {"messages": [{"role": "user", "content": "x" * 33000}]},
        ):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                validated_request({**base, **patch}, "synthia-seed")
        self.assertTrue(plain_chat_prompt(base["messages"]).endswith("ASSISTANT:\n"))

    def test_loopback_chat_protocol_actual_http(self):
        model = FakeModel()
        server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(model))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            origin = "http://127.0.0.1:" + str(server.server_port)
            with urllib.request.urlopen(origin + "/health", timeout=3) as response:
                self.assertEqual(json.load(response)["model"], "synthia-seed")
            body = json.dumps({"model": "synthia-seed", "stream": False,
                               "messages": [{"role": "user", "content": "Hello"}],
                               "max_tokens": 11}).encode()
            request = urllib.request.Request(origin + "/v1/chat/completions", data=body,
                                             headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=3) as response:
                self.assertEqual(json.load(response)["choices"][0]["message"]["content"],
                                 "fake protocol reply")
            self.assertEqual(model.received[0][-1]["content"], "Hello")
            self.assertEqual(model.received[1], 11)
            with self.assertRaises(urllib.error.HTTPError) as context:
                urllib.request.urlopen(urllib.request.Request(
                    origin + "/v1/chat/completions", data=b'{"model":"bad"}'))
            self.assertEqual(context.exception.code, 400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

if __name__ == "__main__":
    unittest.main()
