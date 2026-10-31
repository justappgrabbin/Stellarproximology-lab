"""Durable, owner-scoped work and notification ledger for the EXISTING Modelmaker.

This is the shared execution board for four positional generalists, not another
model runtime. A delegate never inherits ownership. Actual worker connections
must claim/execute assignments separately; ledger entries cannot impersonate work.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

POSITIONS = ("Movement", "Evolution", "Being", "Design")
STATES = ("assigned", "working", "help_needed", "verified")


def now():
    return datetime.now(timezone.utc).isoformat()


class TeamControl:
    def __init__(self, assembly):
        self.r = assembly
        self.db = assembly.db
        with self.r.lock, self.db:
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS team_projects (
                    id TEXT PRIMARY KEY, user TEXT NOT NULL, title TEXT NOT NULL,
                    objective TEXT NOT NULL, acceptance TEXT NOT NULL,
                    lead TEXT NOT NULL, status TEXT NOT NULL, created TEXT NOT NULL,
                    completed TEXT, proof TEXT);
                CREATE TABLE IF NOT EXISTS team_tasks (
                    id TEXT PRIMARY KEY, user TEXT NOT NULL, project_id TEXT NOT NULL,
                    title TEXT NOT NULL, acceptance TEXT NOT NULL,
                    owner TEXT NOT NULL, priority INTEGER NOT NULL,
                    state TEXT NOT NULL, delegate TEXT, evidence TEXT,
                    created TEXT NOT NULL, updated TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS team_help (
                    task_id TEXT NOT NULL, helper TEXT NOT NULL, user TEXT NOT NULL,
                    created TEXT NOT NULL, PRIMARY KEY (task_id, helper, user));
                CREATE TABLE IF NOT EXISTS team_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL,
                    project_id TEXT, task_id TEXT, kind TEXT NOT NULL,
                    title TEXT NOT NULL, detail TEXT NOT NULL,
                    created TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
                CREATE INDEX IF NOT EXISTS team_project_user ON team_projects(user);
                CREATE INDEX IF NOT EXISTS team_tasks_project ON team_tasks(user,project_id);
                CREATE INDEX IF NOT EXISTS team_notice_user ON team_notifications(user,id);
            """)

    def _project(self, project_id):
        row = self.db.execute(
            "SELECT * FROM team_projects WHERE id=? AND user=?",
            (project_id, self.r.user)).fetchone()
        if not row:
            raise ValueError("Project not found for this owner")
        return row

    def _task(self, task_id):
        row = self.db.execute(
            "SELECT * FROM team_tasks WHERE id=? AND user=?",
            (task_id, self.r.user)).fetchone()
        if not row:
            raise ValueError("Task not found for this owner")
        return row

    def _notice(self, kind, title, detail, project_id=None, task_id=None):
        self.db.execute(
            "INSERT INTO team_notifications(user,project_id,task_id,kind,title,detail,created) "
            "VALUES(?,?,?,?,?,?,?)",
            (self.r.user, project_id, task_id, kind, title, detail, now()))

    @staticmethod
    def _text(value, name, limit=500):
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            raise ValueError(name + " must be nonempty text within " + str(limit) + " characters")
        return value.strip()

    @staticmethod
    def _position(value):
        if value not in POSITIONS:
            raise ValueError("Position must be Movement, Evolution, Being, or Design")
        return value

    def create_project(self, title, objective, acceptance, lead):
        title = self._text(title, "Title", 160)
        objective = self._text(objective, "Objective", 4000)
        acceptance = self._text(acceptance, "Completion requirements", 4000)
        lead = self._position(lead)
        project_id = secrets.token_hex(16)
        with self.r.lock, self.db:
            self.db.execute(
                "INSERT INTO team_projects VALUES(?,?,?,?,?,?,?,?,?,?)",
                (project_id, self.r.user, title, objective, acceptance,
                 lead, "active", now(), None, None))
            self._notice("project-created", "Project started: " + title,
                         lead + " is the accountable lead. No work has been claimed complete.",
                         project_id)
        return self.project(project_id)

    def add_task(self, project_id, title, acceptance, owner, priority=3):
        title = self._text(title, "Task title", 160)
        acceptance = self._text(acceptance, "Task completion requirements", 4000)
        owner = self._position(owner)
        if type(priority) is not int or not 1 <= priority <= 5:
            raise ValueError("Priority must be 1 to 5")
        task_id = secrets.token_hex(16)
        with self.r.lock, self.db:
            project = self._project(project_id)
            if project["status"] != "active":
                raise ValueError("Projects under delivery review are immutable")
            self.db.execute(
                "INSERT INTO team_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (task_id, self.r.user, project_id, title, acceptance,
                 owner, priority, "assigned", None, None, now(), now()))
            self._notice("assignment", "Assignment: " + title,
                         owner + " owns delivery even if someone else performs the work.",
                         project_id, task_id)
        return self.task(task_id)

    def task(self, task_id):
        row = dict(self._task(task_id))
        row["evidence"] = json.loads(row["evidence"]) if row["evidence"] else None
        row["helpers"] = [x["helper"] for x in self.db.execute(
            "SELECT helper FROM team_help WHERE task_id=? AND user=? ORDER BY created",
            (task_id, self.r.user)).fetchall()]
        return row

    def project(self, project_id):
        row = dict(self._project(project_id))
        row["proof"] = json.loads(row["proof"]) if row["proof"] else None
        row["tasks"] = [self.task(x["id"]) for x in self.db.execute(
            "SELECT id FROM team_tasks WHERE user=? AND project_id=? ORDER BY priority DESC,created,id",
            (self.r.user, project_id)).fetchall()]
        return row

    def state(self, project_id=None):
        if project_id:
            projects = [self.project(project_id)]
        else:
            projects = [self.project(x["id"]) for x in self.db.execute(
                "SELECT id FROM team_projects WHERE user=? ORDER BY created DESC, id DESC LIMIT 30",
                (self.r.user,)).fetchall()]
        return {
            "positions": list(POSITIONS), "projects": projects,
            "unread": self.db.execute(
                "SELECT count(*) FROM team_notifications WHERE user=? AND acknowledged=0",
                (self.r.user,)).fetchone()[0],
            "worker_execution": "not_connected",
            "disclosure": "This board records actual events and planned assignments. "
                          "It does not imply that four model workers or Android background push are running."
        }

    def delegate(self, task_id, owner, worker):
        self._position(owner)
        worker = self._text(worker, "Delegated worker", 160)
        with self.r.lock, self.db:
            task = self._task(task_id)
            if task["owner"] != owner:
                raise ValueError("Only the assigned owner can delegate their task")
            if task["state"] == "verified" or self._project(task["project_id"])["status"] != "active":
                raise ValueError("Verified work cannot be redelegated")
            self.db.execute(
                "UPDATE team_tasks SET delegate=?,updated=? WHERE id=? AND user=?",
                (worker, now(), task_id, self.r.user))
            self._notice("delegation", "Delegation recorded: " + task["title"],
                         owner + " still owns completion. Worker: " + worker +
                         ". A recorded delegation does not launch the worker.",
                         task["project_id"], task_id)
        return self.task(task_id)

    def _check_proof(self, proof, owner=None):
        if not isinstance(proof, dict):
            raise ValueError("Evidence must be a structured, independently checkable receipt")
        kind = proof.get("kind")
        if kind == "artifact":
            # A file existing does not prove it runs; the title is always precise.
            name = proof.get("relative_path")
            if not isinstance(name, str) or not name.strip() or len(name) > 500:
                raise ValueError("Artifact requires a workspace-relative path")
            root = self.r.directory.resolve()
            path = (root / name).resolve()
            if not path.is_relative_to(root) or not path.is_file():
                raise ValueError("Artifact is missing or escapes this profile's workspace")
            if path.stat().st_size == 0:
                raise ValueError("Empty artifact cannot be accepted")
            with path.open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            supplied = proof.get("sha256")
            if supplied and supplied != actual:
                raise ValueError("Artifact SHA-256 mismatch")
            return {"kind": "artifact", "relative_path": path.relative_to(root).as_posix(),
                    "sha256": actual, "size": path.stat().st_size,
                    "verified": "file-presence-and-hash-only"}
        if kind == "research":
            from .dimension_research import DimensionResearch
            dimension = self._position(proof.get("dimension"))
            if owner is not None and owner != dimension:
                raise ValueError("Research proof must reference the assigned position")
            coverage = DimensionResearch(self.r).status()["dimensions"][dimension]
            if not coverage["traversal_complete"] or coverage["passages_total"] < 1:
                raise ValueError("Full source-anchored passage coverage is not complete")
            return {"kind": "research", "dimension": dimension,
                    "passages_verified": coverage["passages_verified"],
                    "passages_total": coverage["passages_total"],
                    "verified": "source-anchored-coverage-only"}
        raise ValueError("Supported proof kinds: artifact, research. A text claim is not proof.")

    def update_task(self, task_id, actor, state, evidence=None):
        actor = self._position(actor)
        if state not in STATES:
            raise ValueError("Invalid task state; there is no 'done without proof' state")
        with self.r.lock, self.db:
            task = self._task(task_id)
            project = self._project(task["project_id"])
            if project["status"] != "active":
                raise ValueError("Project has already been delivered")
            if actor != task["owner"]:
                raise ValueError("Only the assigned owner may change the outcome of their task")
            if task["state"] == "verified":
                raise ValueError("Verified task is immutable")
            proof = self._check_proof(evidence, task["owner"]) if state == "verified" else None
            self.db.execute(
                "UPDATE team_tasks SET state=?,evidence=?,updated=? WHERE id=? AND user=?",
                (state, json.dumps(proof) if proof else None, now(), task_id, self.r.user))
            if state == "verified":
                self._notice("task-verified", "Verified: " + task["title"],
                             "Owner " + actor + " supplied " + proof["verified"] +
                             " evidence. This does not certify the entire project.",
                             task["project_id"], task_id)
                # Freed capacity is offered to another outstanding owner; the
                # original owner keeps responsibility. No fictional execution.
                remaining = self.db.execute(
                    "SELECT id,title,owner FROM team_tasks WHERE user=? AND project_id=? "
                    "AND state!='verified' AND owner!=? ORDER BY "
                    "CASE WHEN state='help_needed' THEN 0 ELSE 1 END,priority DESC,created LIMIT 1",
                    (self.r.user, task["project_id"], actor)).fetchone()
                if remaining:
                    self.db.execute(
                        "INSERT OR IGNORE INTO team_help VALUES(?,?,?,?)",
                        (remaining["id"], actor, self.r.user, now()))
                    self._notice("help-offered", actor + " is available to help",
                                 "Next assignment: " + remaining["title"] +
                                 " (owned by " + remaining["owner"] + "). "
                                 "This is a plan, not proof the helper has started.",
                                 task["project_id"], remaining["id"])
            elif state == "help_needed":
                self._notice("help-needed", "Help required: " + task["title"],
                             actor + " retains ownership; other positions should assist.",
                             task["project_id"], task_id)
        return self.task(task_id)

    def complete_project(self, project_id, actor, proof):
        actor = self._position(actor)
        with self.r.lock, self.db:
            project = self._project(project_id)
            if actor != project["lead"]:
                raise ValueError("Only this project's rotating lead can present the final delivery")
            if project["status"] != "active":
                raise ValueError("Project already completed")
            tasks = self.db.execute(
                "SELECT state FROM team_tasks WHERE user=? AND project_id=?",
                (self.r.user, project_id)).fetchall()
            if not tasks or any(t["state"] != "verified" for t in tasks):
                raise ValueError("Every assigned task must be independently verified first")
            accepted = self._check_proof(proof)
            self.db.execute(
                "UPDATE team_projects SET status='awaiting_acceptance',completed=?,proof=? "
                "WHERE id=? AND user=?",
                (now(), json.dumps(accepted), project_id, self.r.user))
            self._notice("delivery-review", "Delivery evidence ready: " + project["title"],
                         "All registered tasks have evidence; final " + accepted["verified"] +
                         " receipt recorded. The project is awaiting owner acceptance; "
                         "no runtime or installation success has been assumed.",
                         project_id)
        return self.project(project_id)


    def accept_project(self, project_id, approved):
        """Only an explicit owner-facing action marks a reviewed delivery complete."""
        if approved is not True:
            raise ValueError("Owner approval must be explicitly true")
        with self.r.lock, self.db:
            project = self._project(project_id)
            if project["status"] != "awaiting_acceptance" or not project["proof"]:
                raise ValueError("Project has no verified delivery evidence awaiting acceptance")
            tasks = self.db.execute(
                "SELECT state FROM team_tasks WHERE user=? AND project_id=?",
                (self.r.user, project_id)).fetchall()
            if not tasks or any(row["state"] != "verified" for row in tasks):
                raise ValueError("Not all task evidence was accepted")
            self.db.execute(
                "UPDATE team_projects SET status='completed',completed=? WHERE id=? AND user=?",
                (now(), project_id, self.r.user))
            self._notice("project-accepted", "Project accepted: " + project["title"],
                         "Owner accepted submitted evidence after review. "
                         "No unrelated build or installation has been claimed.",
                         project_id)
        return self.project(project_id)

    def record_adapter_training(self, receipt):
        """Record only real persisted TRIDENT adapter revisions."""
        if not isinstance(receipt, dict) or receipt.get("status") != "adapter-trained-not-validated-for-research-correctness":
            return
        position = self._position(receipt.get("trained_position"))
        revision = receipt.get("revision")
        if not isinstance(revision, str) or not revision.startswith("revision-"):
            return
        with self.r.lock, self.db:
            self._notice("adapter-revision", position + " adapter weights saved",
                         "Revision " + revision + " trained and reloaded with the "
                         "existing shared TRIDENT base. Research correctness and deployment "
                         "are not established by this training receipt.")

    def record_research(self, dimension, result, kind="research"):
        """Notification is sourced only from an actual tool receipt, not a prompt."""
        self._position(dimension)
        if not isinstance(result, dict):
            return
        attempts = result.get("attempts") or []
        succeeded = sum(1 for x in attempts if x.get("status") == "anchored" or x.get("state") == "processed")
        failed = len(attempts) - succeeded
        if not attempts:
            return
        with self.r.lock, self.db:
            self._notice("research-progress", dimension + " " + kind + " receipt",
                         str(succeeded) + " verified/processed passage(s); " +
                         str(failed) + " failed or needing review. "
                         "Passage coverage does not certify neural training or project delivery.")

    def feed(self, after=0, limit=100):
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError("Invalid notification cursor")
        # A fresh inbox shows the newest items, while an active poll reads forward.
        if after == 0:
            rows = list(reversed(self.db.execute(
                "SELECT * FROM team_notifications WHERE user=? ORDER BY id DESC LIMIT ?",
                (self.r.user, limit)).fetchall()))
        else:
            rows = self.db.execute(
                "SELECT * FROM team_notifications WHERE user=? AND id>? ORDER BY id LIMIT ?",
                (self.r.user, after, limit)).fetchall()
        return {"notifications": [dict(row) for row in rows],
                "latest": rows[-1]["id"] if rows else after}

    def acknowledge(self, through_id):
        if type(through_id) is not int or through_id < 0:
            raise ValueError("Invalid notification ID")
        with self.r.lock, self.db:
            self.db.execute("UPDATE team_notifications SET acknowledged=1 "
                            "WHERE user=? AND id<=?", (self.r.user, through_id))
        return {"unread": self.state()["unread"]}
