from __future__ import annotations

import json
import os
from pathlib import Path
import selectors
import subprocess
import time
import uuid


class SandboxUnavailable(RuntimeError):
    pass


def docker_command() -> list[str]:
    return ["docker", "--host=unix:///var/run/docker.sock"]


def docker_env() -> dict:
    # Bind explicitly to the managed local daemon, retaining registry config.
    return {k: v for k, v in os.environ.items() if k not in {
        "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"
    }}


RUNNER = '''import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("capability", "/candidate/capability.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.build_units(sys.argv[1]), ensure_ascii=False))
'''


class DockerSandbox:
    def __init__(self, image="python:3.12-slim", timeout=20):
        self.image, self.timeout = image, timeout

    def check(self):
        try:
            result = subprocess.run(docker_command() + ["image", "inspect", self.image],
                                    env=docker_env(), capture_output=True, timeout=10)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise SandboxUnavailable("Docker is unavailable; generated code will not run on the host.") from exc
        if result.returncode:
            raise SandboxUnavailable(f"Docker or image {self.image} is unavailable; provision it first.")

    def execute(self, directory: Path, dimension: str) -> dict:
        self.check()
        runner = directory / "runner.py"
        runner.write_text(RUNNER, encoding="utf-8")
        directory.chmod(0o755)
        for file in directory.iterdir():
            if file.is_file():
                file.chmod(0o644)
        name = "stellar-candidate-" + uuid.uuid4().hex
        command = docker_command() + [
            "run", "--rm", "--name", name, "--network", "none", "--read-only",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65534:65534",
            "--memory", "256m", "--memory-swap", "256m", "--cpus", "1", "--pids-limit", "32",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
            "--mount", f"type=bind,src={directory.resolve()},dst=/candidate,readonly",
            "-e", "HTTP_PROXY=", "-e", "HTTPS_PROXY=", "-e", "ALL_PROXY=",
            "-e", "http_proxy=", "-e", "https_proxy=", "-e", "all_proxy=",
            self.image, "python", "-I", "-B", "/candidate/runner.py", dimension,
        ]
        started = time.monotonic()
        process = subprocess.Popen(command, env=docker_env(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output = bytearray()
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        problem = None
        try:
            while True:
                if time.monotonic() - started > self.timeout:
                    problem = "Candidate exceeded its execution time limit."
                    break
                events = selector.select(timeout=0.1)
                if events:
                    chunk = os.read(process.stdout.fileno(), 65536)
                    if not chunk:
                        break
                    output.extend(chunk)
                    if len(output) > 1024 * 1024:
                        problem = "Candidate exceeded its output limit."
                        break
            if problem:
                return {"ok": False, "error": problem}
            process.wait(timeout=3)
            if process.returncode:
                return {"ok": False, "error": bytes(output).decode(errors="replace")[-4000:]}
            try:
                units = json.loads(output)
            except (ValueError, UnicodeDecodeError):
                return {"ok": False, "error": "Candidate did not return a single valid JSON value."}
            return {"ok": True, "units": units, "elapsed_seconds": round(time.monotonic() - started, 3)}
        finally:
            selector.close()
            subprocess.run(docker_command() + ["rm", "-f", name], env=docker_env(),
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
            if process.poll() is None:
                process.kill()
            process.wait()
            process.stdout.close()
