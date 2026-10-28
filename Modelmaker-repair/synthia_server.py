"""Loopback-only inference for model weights exported by Modelmaker.

This is NOT a model trainer, tool server or generic model downloader.
A trusted operator supplies a local directory produced by Modelmaker.
It implements the small OpenAI-compatible chat-completions shape already
consumed by SynthiaLanguageModel in the existing SynthAi Computer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY_BYTES = 64 * 1024
MAX_PROMPT_CHARACTERS = 32000


def checkpoint_manifest(directory: str | Path) -> dict:
    """Validate trusted local Modelmaker export before loading its weights."""
    root = Path(directory).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Modelmaker checkpoint must be a local directory")
    for required in ("config.json", "model.safetensors", "tokenizer_config.json"):
        path = root / required
        if not path.is_file() or path.is_symlink():
            raise ValueError("Modelmaker checkpoint missing regular file: " + required)
    try:
        config = json.loads((root / "config.json").read_text(encoding="utf8"))
    except (OSError, ValueError) as error:
        raise ValueError("Invalid Modelmaker config.json") from error
    if config.get("model_type") != "gpt2":
        raise ValueError("Only GPT-2-style Modelmaker exports are supported")
    weights = root / "model.safetensors"
    if weights.stat().st_size < 1024:
        raise ValueError("Modelmaker checkpoint weights appear truncated")
    sha256 = hashlib.sha256()
    with weights.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            sha256.update(block)
    metadata_path = root / "modelmaker_build.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf8")) if metadata_path.is_file() else {}
    if metadata and metadata.get("name") != root.name:
        raise ValueError("Checkpoint folder and Modelmaker build name disagree")
    return {"name": root.name, "directory": str(root),
            "sha256": sha256.hexdigest(),
            "parameters": metadata.get("parameters"),
            "context_length": config.get("n_positions")}


def validated_request(payload: object, model_id: str) -> tuple[list[dict], int]:
    if not isinstance(payload, dict) or payload.get("stream") not in (None, False):
        raise ValueError("Only non-streaming chat completions are supported")
    if payload.get("model") != model_id:
        raise ValueError("Requested model must match the installed Modelmaker checkpoint")
    messages = payload.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= 20:
        raise ValueError("Expected one to twenty messages")
    safe = []
    length = 0
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in {"system", "assistant", "user"}:
            raise ValueError("Unsupported message role")
        content = message.get("content")
        if not isinstance(content, str):
            raise ValueError("Each message must contain plain text")
        length += len(content)
        safe.append({"role": message["role"], "content": content})
    if length > MAX_PROMPT_CHARACTERS or not safe[-1]["content"].strip() or safe[-1]["role"] != "user":
        raise ValueError("Invalid, excessive or missing final user message")
    count = payload.get("max_tokens", 64)
    if type(count) is not int or not 1 <= count <= 512:
        raise ValueError("max_tokens must be an integer from 1 to 512")
    return safe, count


def plain_chat_prompt(messages: list[dict]) -> str:
    """GPT-2 does not have a chat template. Preserve message role boundaries."""
    return "".join(f"{item['role'].upper()}:\n{item['content']}\n" for item in messages) + "ASSISTANT:\n"


class ModelmakerCheckpoint:
    def __init__(self, directory: str | Path):
        self.manifest = checkpoint_manifest(directory)
        self.model_id = self.manifest["name"]
        # These libraries are only required for real inference, not protocol tests.
        from transformers import AutoModelForCausalLM, AutoTokenizer
        import torch
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.manifest["directory"], local_files_only=True, trust_remote_code=False)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.manifest["directory"], local_files_only=True,
            trust_remote_code=False, use_safetensors=True)
        self.model.eval()
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.max_positions = int(self.model.config.n_positions)
        if self.max_positions < 32:
            raise ValueError("Modelmaker context must contain at least 32 positions")

    def complete(self, messages: list[dict], max_tokens: int) -> dict:
        import time
        # Reserve model context for input. Synthia's full Klein context will
        # not fit into a very small seed model, so truncate oldest tokens.
        budget = min(max_tokens, 64, max(1, self.max_positions // 4))
        ids = self.tokenizer.encode(plain_chat_prompt(messages), add_special_tokens=False)
        if not ids:
            raise ValueError("Tokenizer returned no prompt tokens")
        ids = ids[-(self.max_positions - budget):]
        tensor = self.torch.tensor([ids], dtype=self.torch.long)
        with self.torch.inference_mode():
            generated = self.model.generate(
                input_ids=tensor,
                attention_mask=self.torch.ones_like(tensor),
                max_new_tokens=budget,
                do_sample=False,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id)
        new_ids = generated[0, tensor.shape[1]:]
        result = self.tokenizer.decode(new_ids, skip_special_tokens=True).strip()
        return {
            "id": "modelmaker-" + str(time.time_ns()),
            "object": "chat.completion",
            "model": self.model_id,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": result},
                         "finish_reason": "length"}],
            "usage": {"prompt_tokens": len(ids), "completion_tokens": len(new_ids),
                      "total_tokens": len(ids) + len(new_ids)},
        }


def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            # Do not log the user's chat text.
            return

        def write_json(self, status, payload):
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                return self.write_json(200, {"ready": True, "model": engine.model_id,
                                             "checkpoint_sha256": engine.manifest["sha256"]})
            if self.path == "/v1/models":
                return self.write_json(200, {"object": "list", "data": [
                    {"id": engine.model_id, "object": "model", "owned_by": "local-modelmaker"}]})
            return self.write_json(404, {"error": {"message": "Unknown route"}})

        def do_POST(self):
            if self.path != "/v1/chat/completions":
                return self.write_json(404, {"error": {"message": "Unknown route"}})
            try:
                raw_length = self.headers.get("Content-Length", "")
                if not raw_length.isascii() or not raw_length.isdecimal():
                    raise ValueError("Content-Length required")
                length = int(raw_length)
                if length < 2 or length > MAX_BODY_BYTES:
                    return self.write_json(413, {"error": {"message": "Request too large"}})
                request = json.loads(self.rfile.read(length))
                messages, tokens = validated_request(request, engine.model_id)
                result = engine.complete(messages, tokens)
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
                return self.write_json(400, {"error": {"message": str(error)[:150]}})
            except Exception:
                # Never expose local filesystem paths or stack traces to clients.
                return self.write_json(503, {"error": {"message": "Local checkpoint inference failed"}})
            return self.write_json(200, result)

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Serve trained Modelmaker weights to Synthia locally")
    parser.add_argument("--model-dir", required=True, help="Unpacked Modelmaker save_pretrained folder")
    parser.add_argument("--port", type=int, default=11734)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")
    engine = ModelmakerCheckpoint(args.model_dir)
    # By design this is not reachable from external machines.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(engine))
    server.daemon_threads = True
    print("Modelmaker checkpoint ready on 127.0.0.1:" + str(args.port) +
          " | model: " + engine.model_id + " | sha256: " + engine.manifest["sha256"], flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
