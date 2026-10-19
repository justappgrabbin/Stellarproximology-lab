"""Local, append-only adaptive personal models for the existing Modelmaker.

No LLM, cloud call, or additional third-party dependency is required. A person
is understood through explicitly sourced observations/preferences; outcomes
update a contextual Thompson-sampling recommender. This is not Honcho code.
"""
from __future__ import annotations

import json
import math
import random
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path


class AdaptivePeople:
    """Event-sourced personal profiles with independent observer perspectives."""

    def __init__(self, db_path: str | Path):
        self.path = Path(db_path).expanduser()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS person_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    person_id TEXT NOT NULL,
                    observer_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    event_json TEXT NOT NULL,
                    occurred_at TEXT NOT NULL
                )
            """)
            db.execute("""
                CREATE INDEX IF NOT EXISTS person_event_lookup
                ON person_events(person_id, observer_id, id)
            """)

    def _connect(self):
        db = sqlite3.connect(str(self.path), timeout=15)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _identity(value, label):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} is required")
        if len(value.strip()) > 160:
            raise ValueError(f"{label} is too long")
        return value.strip()

    @staticmethod
    def _string(value, label):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{label} is required")
        return value.strip()

    @staticmethod
    def _context(value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise ValueError("Context must be a JSON object")
        clean = {}
        for key, val in value.items():
            if not isinstance(key, str) or not key.strip():
                raise ValueError("Context keys must be nonempty text")
            if isinstance(val, (str, bool, int, float)) and not (
                isinstance(val, float) and not math.isfinite(val)
            ):
                clean[key] = val
            else:
                raise ValueError("Context values must be strings, booleans, or finite numbers")
        return clean

    def _write(self, person_id, observer_id, kind, payload):
        person_id = self._identity(person_id, "Person ID")
        observer_id = self._identity(observer_id, "Observer ID")
        stamp = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            cur = db.execute(
                "INSERT INTO person_events(person_id, observer_id, event_type, event_json, occurred_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (person_id, observer_id, kind,
                 json.dumps(payload, sort_keys=True, ensure_ascii=False), stamp),
            )
            return int(cur.lastrowid)

    def history(self, person_id, observer_id="self"):
        """All records, including superseded preferences and corrected feedback."""
        person_id = self._identity(person_id, "Person ID")
        observer_id = self._identity(observer_id, "Observer ID")
        with self._connect() as db:
            rows = db.execute(
                "SELECT id, event_type, event_json, occurred_at FROM person_events "
                "WHERE person_id=? AND observer_id=? ORDER BY id",
                (person_id, observer_id),
            ).fetchall()
        return [
            {"id": row["id"], "kind": row["event_type"],
             "at": row["occurred_at"], **json.loads(row["event_json"])}
            for row in rows
        ]

    def observe(self, person_id, statement, source="person-stated", observer_id="self"):
        """Record an observation as evidence, not as an established psychological fact."""
        return self._write(
            person_id, observer_id, "observation",
            {"statement": self._string(statement, "Observation"),
             "source": self._string(source, "Source")},
        )

    def remember_preference(self, person_id, topic, preference, evidence,
                            observer_id="self"):
        """Append a preference assertion; newer assertions supersede in the view only."""
        return self._write(
            person_id, observer_id, "preference",
            {"topic": self._string(topic, "Preference topic"),
             "preference": self._string(preference, "Preference"),
             "evidence": self._string(evidence, "Preference evidence")},
        )

    @staticmethod
    def _context_weight(earlier, current):
        if not earlier and not current:
            return 1.0
        keys = set(earlier) | set(current)
        agreements = sum(1 for key in keys
                         if key in earlier and key in current
                         and earlier[key] == current[key])
        # Generalize weakly across contexts; weight identical contexts most.
        return 0.25 + 0.75 * (agreements / len(keys))

    def _learned_rewards(self, events, context):
        proposals = {e["request_id"]: e for e in events if e["kind"] == "recommendation"}
        # Last correction to a previous result supersedes it for learning, but not history.
        feedback = {e["request_id"]: e for e in events if e["kind"] == "feedback"}
        totals = {}
        for request_id, result in feedback.items():
            proposed = proposals.get(request_id)
            if proposed is None:
                continue
            action = proposed["action"]
            weight = self._context_weight(proposed["context"], context)
            total = totals.setdefault(action, {"alpha": 1.0, "beta": 1.0, "samples": 0})
            total["alpha"] += weight * result["reward"]
            total["beta"] += weight * (1.0 - result["reward"])
            total["samples"] += 1
        return totals

    def recommend(self, person_id, options, context=None, observer_id="self"):
        """Select from caller-supplied options; learn from later real-world feedback."""
        context = self._context(context)
        if not isinstance(options, (list, tuple)):
            raise ValueError("Options must be a list")
        options = [self._string(opt, "Option") for opt in options]
        if not options or len(options) > 50 or len(set(options)) != len(options):
            raise ValueError("Supply between 1 and 50 different actions")
        events = self.history(person_id, observer_id)
        totals = self._learned_rewards(events, context)
        candidates = {}
        for option in options:
            stats = totals.get(option, {"alpha": 1.0, "beta": 1.0, "samples": 0})
            candidates[option] = {
                "estimated_reward": stats["alpha"] / (stats["alpha"] + stats["beta"]),
                "observed_outcomes": stats["samples"],
                "sample": random.betavariate(stats["alpha"], stats["beta"]),
            }
        choice = max(options, key=lambda option: candidates[option]["sample"])
        request_id = str(uuid.uuid4())
        self._write(
            person_id, observer_id, "recommendation",
            {"request_id": request_id, "action": choice, "options": options,
             "context": context},
        )
        has_evidence = any(e["kind"] in {"observation", "preference", "feedback"} for e in events)
        return {
            "request_id": request_id,
            "action": choice,
            "estimated_reward": candidates[choice]["estimated_reward"],
            "observed_outcomes": candidates[choice]["observed_outcomes"],
            "cold_start": not has_evidence,
            "clarifying_question": (
                "Which of these options appeals to you, and what matters most right now? "
                + ", ".join(options)
                if not has_evidence else None
            ),
        }

    def feedback(self, person_id, request_id, reward, explanation,
                 observer_id="self"):
        """Append the outcome or its later correction, never erase prior feedback."""
        if isinstance(reward, bool) or not isinstance(reward, (float, int)):
            raise ValueError("Reward must be a number between 0 and 1")
        if not math.isfinite(float(reward)) or not 0 <= reward <= 1:
            raise ValueError("Reward must be between 0 and 1")
        request_id = self._string(request_id, "Recommendation ID")
        events = self.history(person_id, observer_id)
        matching = next(
            (e for e in events
             if e["kind"] == "recommendation" and e["request_id"] == request_id),
            None,
        )
        if matching is None:
            raise ValueError("Recommendation not found for this person/perspective")
        previous = [e["id"] for e in events
                    if e["kind"] == "feedback" and e["request_id"] == request_id]
        return self._write(
            person_id, observer_id, "feedback",
            {"request_id": request_id, "reward": float(reward),
             "explanation": explanation.strip() if isinstance(explanation, str) else "",
             "supersedes_event_id": previous[-1] if previous else None},
        )

    def profile(self, person_id, observer_id="self"):
        events = self.history(person_id, observer_id)
        preferences = {}
        proposals = {}
        outcomes = {}
        for event in events:
            if event["kind"] == "preference":
                preferences[event["topic"]] = {
                    "value": event["preference"], "evidence": event["evidence"],
                    "event_id": event["id"],
                }
            if event["kind"] == "recommendation":
                proposals[event["request_id"]] = event
            if event["kind"] == "feedback":
                outcomes[event["request_id"]] = event
        return {
            "person_id": self._identity(person_id, "Person ID"),
            "observer_id": self._identity(observer_id, "Observer ID"),
            "observations": [
                {"statement": e["statement"], "source": e["source"], "event_id": e["id"]}
                for e in events if e["kind"] == "observation"
            ],
            "current_preferences": preferences,
            "recommendation_count": len(proposals),
            "evaluated_recommendations": len(outcomes),
            "pending_recommendations": [
                rid for rid in proposals if rid not in outcomes
            ],
            "event_count": len(events),
        }
