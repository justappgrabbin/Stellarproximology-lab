from __future__ import annotations

import ast
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.request
import uuid

from .models import NAMES
from .sandbox import DockerSandbox

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Modelmaker-repair"))
from seed import DIMENSIONS, SOURCE_ORDERS, SPACE


def write_json(path: Path, value):
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


@contextmanager
def workspace_lock(root: Path):
    # An interrupted process releases the OS lock automatically.
    import fcntl
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another builder is using this workspace.")
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def gather_sources(task: dict, task_dir: Path) -> list[dict]:
    records = []
    for item in task.get("sources", []):
        if not isinstance(item.get("id"), str) or not item["id"]:
            raise ValueError("Every research source needs an ID.")
        if any(s["id"] == item["id"] for s in records):
            raise ValueError("Research source IDs must be unique.")
        record = {"id": item["id"]}
        try:
            if "path" in item:
                path = (task_dir / item["path"]).resolve()
                project = Path(__file__).resolve().parents[1]
                if not path.is_relative_to(project) or any(p.startswith(".") for p in path.relative_to(project).parts):
                    raise ValueError("Research paths must be non-hidden files inside this project.")
                data = path.read_bytes()
                record["location"] = str(path.relative_to(project))
            else:
                url = item["url"]
                if not url.startswith("https://"):
                    raise ValueError("Research URLs must use HTTPS.")
                # Only task-configured URLs are fetched; models cannot choose destinations.
                request = urllib.request.Request(url, headers={"User-Agent": "StellarResearch/0.1"})
                with urllib.request.urlopen(request, timeout=15) as response:
                    data = response.read(65537)
                    record["location"] = response.url
            if len(data) > 65536:
                raise ValueError("Source exceeds the 64 KiB research limit.")
            record.update(status="retrieved", sha256=hashlib.sha256(data).hexdigest(),
                          text=data.decode("utf-8", errors="replace"))
        except Exception as exc:
            record.update(status="unavailable", error=f"{type(exc).__name__}: {exc}")
        records.append(record)
    return records


def validate_units(units, dimension: str) -> None:
    """Trusted host validator. Generated code cannot edit these acceptance rules."""
    if not isinstance(units, list) or len(units) != 64:
        raise ValueError("Each dimension must return exactly 64 units.")
    expected = {f"{i:06b}" for i in range(64)}
    seen = set()
    for unit in units:
        if not isinstance(unit, dict):
            raise ValueError("A unit must be a JSON object.")
        bits = unit.get("bits")
        if bits not in expected or bits in seen:
            raise ValueError("Each six-bit pattern must appear exactly once.")
        seen.add(bits)
        if unit.get("dimension") != dimension or unit.get("id") != f"{dimension}:{bits}":
            raise ValueError("A unit must retain its dimension-specific identity.")
        if unit.get("heart") != [bits[0:2], bits[2:4], bits[4:6]]:
            raise ValueError("Heart must contain the three bigrams of the same six lines.")
        if unit.get("mind") != [bits[0:3], bits[3:6]] or unit.get("body") != bits:
            raise ValueError("Mind and body must preserve the same six lines.")
        if unit.get("tcs") is not None:
            raise ValueError("TCS remains undefined; do not invent a mapping.")
        if unit.get("perspective") != DIMENSIONS[dimension]:
            raise ValueError("Preserve this dimension's profile, including differing source keynotes.")


CONTRACT = {
    "file": "capability.py", "function": "build_units(dimension: str) -> list[dict]",
    "requirements": ["Return all 64 unique six-bit patterns for the requested dimension.",
                     "Each record must have id=dimension+':'+bits, dimension, bits, "
                     "heart=[bits[:2],bits[2:4],bits[4:]], mind=[bits[:3],bits[3:]], body=bits.",
                     "Each record's perspective must equal the supplied dimension profile.",
                     "Use tcs=null; its mapping is unresolved. Do not claim King Wen numbering.",
                     "Use only the Python standard library. No downloads, file writes, or debug printing."],
}


class Builder:
    def __init__(self, models, root: Path, sandbox=None):
        self.models, self.root = models, root.resolve()
        self.sandbox = sandbox or DockerSandbox()

    def run(self, task: dict, task_dir: Path, max_rounds=2) -> dict:
        if task.get("contract") != "hexagram-catalog-v1":
            raise ValueError("This first builder supports the hexagram-catalog-v1 capability contract.")
        if not 1 <= max_rounds <= 3:
            raise ValueError("A job is bounded to one through three rounds.")
        with workspace_lock(self.root):
            return self._run(task, task_dir, max_rounds)

    def _run(self, task, task_dir, max_rounds):
        self.sandbox.check()
        run_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
        run_dir = self.root / "runs" / run_id
        run_dir.mkdir(parents=True)
        evidence = gather_sources(task, task_dir)
        journal = {"run_id": run_id, "status": "running", "mode": "replay" if self.models.replay else "live",
                   "goal": task["goal"], "sources": evidence, "rounds": [], "promotion": None}
        write_json(run_dir / "journal.json", journal)
        available = {s["id"] for s in evidence if s["status"] == "retrieved"}
        feedback = []
        for attempt in range(1, max_rounds + 1):
            current = {"attempt": attempt, "perspectives": {}}
            journal["rounds"].append(current)
            for name in NAMES:
                slot = {"status": "researching"}
                current["perspectives"][name] = slot
                prompt = {"goal": task["goal"], "dimension": {"name": name, **DIMENSIONS[name]},
                          "source_orders": SOURCE_ORDERS, "space": SPACE, "sources": evidence,
                          "previous_results": feedback, "capability_contract": CONTRACT}
                try:
                    prompt["stage"] = "research"
                    prompt["return_schema"] = {"findings": [{"claim": "text", "source_ids": ["retrieved source ID"]}],
                                               "unknowns": ["unresolved issues"]}
                    research = self.models.call(name, "research", prompt, attempt)
                    if not isinstance(research.get("findings"), list) or not research["findings"]:
                        raise ValueError("Research must include at least one cited finding.")
                    for finding in research["findings"]:
                        ids = finding.get("source_ids", [])
                        if not ids or not set(ids).issubset(available):
                            raise ValueError("Research cites a source that was not retrieved.")
                    slot["research"] = research
                    slot["status"] = "hypothesizing"
                    prompt.update(stage="hypothesis", research=research,
                                  return_schema={"hypothesis": "testable proposal", "prediction": "expected outcome",
                                                 "uncertainties": ["unproven claims"]})
                    hypothesis = self.models.call(name, "hypothesis", prompt, attempt)
                    if not all(isinstance(hypothesis.get(k), str) and hypothesis[k].strip()
                               for k in ("hypothesis", "prediction")):
                        raise ValueError("A hypothesis and observable prediction are required.")
                    slot["hypothesis"] = {**hypothesis, "status": "unverified"}
                    slot["status"] = "building"
                    prompt.update(stage="build", hypothesis=hypothesis,
                                  return_schema={"code": "complete Python capability.py source"})
                    candidate = self.models.call(name, "build", prompt, attempt)
                    code = candidate.get("code")
                    if not isinstance(code, str) or not 1 <= len(code.encode()) <= 60000:
                        raise ValueError("Candidate code must be a nonempty source of at most 60 KiB.")
                    ast.parse(code)
                    candidate_dir = run_dir / f"round-{attempt}" / name
                    candidate_dir.mkdir(parents=True)
                    (candidate_dir / "capability.py").write_text(code, encoding="utf-8")
                    slot["code_sha256"] = hashlib.sha256(code.encode()).hexdigest()
                    slot["candidate"] = str(candidate_dir.relative_to(self.root))
                    slot["status"] = "verifying"
                    result = self.sandbox.execute(candidate_dir, name)
                    if result["ok"]:
                        try:
                            validate_units(result["units"], name)
                        except ValueError as exc:
                            result = {"ok": False, "error": str(exc)}
                    slot["verification"] = result
                    slot["status"] = "verified" if result["ok"] else "failed"
                    # Contract verification supports a bounded prediction, not all semantic claims.
                    slot["hypothesis"]["contract_test_passed"] = result["ok"]
                    prompt.update(stage="reflect", measured_result={k: v for k, v in result.items() if k != "units"},
                                  return_schema={"interpretation": "what results support", "next_research": ["questions"],
                                                 "remaining_uncertainty": ["unresolved claims"]})
                    try:
                        slot["reflection"] = self.models.call(name, "reflect", prompt, attempt)
                    except Exception as exc:
                        slot["reflection_error"] = f"{type(exc).__name__}: {exc}"
                except Exception as exc:
                    slot.update(status="failed", error=f"{type(exc).__name__}: {exc}")
                write_json(run_dir / "journal.json", journal)
            feedback = [{"dimension": n, "status": s["status"], "research": s.get("research"),
                         "hypothesis": s.get("hypothesis"), "verification":
                         {k: v for k, v in s.get("verification", {}).items() if k != "units"},
                         "reflection": s.get("reflection"), "error": s.get("error")}
                        for n, s in current["perspectives"].items()]
            if all(s["status"] == "verified" for s in current["perspectives"].values()):
                catalog = [unit for name in NAMES for unit in current["perspectives"][name]["verification"]["units"]]
                write_json(run_dir / "catalog.json", {"units": catalog, "space": SPACE,
                                                      "source_orders": SOURCE_ORDERS})
                # Only complete, verified generations replace the active pointer.
                journal.update(status="promoted", promotion={"run_id": run_id, "catalog": "catalog.json"})
                write_json(run_dir / "journal.json", journal)
                write_json(self.root / "active.json", {"run_id": run_id, "catalog": f"runs/{run_id}/catalog.json",
                                                       "mode": journal["mode"]})
                return journal
        journal["status"] = "blocked"
        write_json(run_dir / "journal.json", journal)
        return journal
