from __future__ import annotations

import argparse
import json
from pathlib import Path
import time

from .engine import Builder, write_json
from .models import HuggingFaceModels, ReplayModels
from .sandbox import DockerSandbox


def main():
    parser = argparse.ArgumentParser(description="Four-perspective research → hypothesis → code → verify → reflect")
    parser.add_argument("--config", type=Path, default=Path("autonomy/config.example.json"))
    parser.add_argument("--task", type=Path, default=Path("autonomy/tasks/hexagram-catalog.json"))
    parser.add_argument("--workspace", type=Path, default=Path("autonomy-workspace"))
    parser.add_argument("--replay", type=Path, help="Explicit offline recorded-response mode; no live model calls")
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--serve", action="store_true", help="Keep processing queue/*.json jobs until stopped")
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text())
        models = ReplayModels(args.replay.resolve()) if args.replay else HuggingFaceModels(config)
        builder = Builder(models, args.workspace, DockerSandbox(image=config.get("sandbox_image", "python:3.12-slim")))
        if not args.serve:
            task = json.loads(args.task.read_text())
            journal = builder.run(task, args.task.resolve().parent, args.rounds)
            print(json.dumps({k: journal[k] for k in ("run_id", "mode", "status", "promotion")}, indent=2))
            return 0 if journal["status"] == "promoted" else 2
        queue = args.workspace.resolve() / "queue"
        queue.mkdir(parents=True, exist_ok=True)
        for name in ("done", "blocked"):
            (queue / name).mkdir(exist_ok=True)
        print("Worker running. Submit queue/*.json with {\"task\":\"hexagram-catalog\"}. Ctrl-C stops it.", flush=True)
        while True:
            jobs = sorted(queue.glob("*.json"))
            for job in jobs:
                try:
                    request = json.loads(job.read_text())
                    if request.get("task") != "hexagram-catalog":
                        raise ValueError("Unknown task; this worker supports hexagram-catalog.")
                    task = json.loads(args.task.read_text())
                    journal = builder.run(task, args.task.resolve().parent, args.rounds)
                    success = journal["status"] == "promoted"
                    result = {"run_id": journal["run_id"], "status": journal["status"]}
                except Exception as exc:
                    success = False
                    result = {"status": "blocked", "error": f"{type(exc).__name__}: {exc}"}
                destination = queue / ("done" if success else "blocked") / job.name
                write_json(destination.with_suffix(".result.json"), result)
                job.replace(destination)
                print(json.dumps(result), flush=True)
            time.sleep(2)
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(json.dumps({"status": "blocked", "error": f"{type(exc).__name__}: {exc}"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
