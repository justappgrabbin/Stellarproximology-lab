"""Behavioral tests for real Modelmaker team accountability and notifications."""
from __future__ import annotations

import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from assembly.team_control import POSITIONS, TeamControl


class FakeAssembly:
    def __init__(self, db, directory, user):
        self.db = db
        self.directory = Path(directory)
        self.user = user
        self.lock = threading.RLock()


class TeamControlTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.owner = TeamControl(FakeAssembly(self.db, self.temp.name, "owner"))
        self.other = TeamControl(FakeAssembly(self.db, self.temp.name, "other"))
        self.project = self.owner.create_project(
            "Repair tools", "Make existing tools correctly detect missing words",
            "Run the real tools and independently confirm coverage", "Design")

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def task(self, title, owner):
        return self.owner.add_task(
            self.project["id"], title, "A checkable file or source-complete receipt",
            owner, priority=5)

    def artifact(self, name, content=b"verified existing output"):
        root = Path(self.temp.name)
        (root / name).write_bytes(content)
        return {"kind": "artifact", "relative_path": name}

    def test_exact_four_generalists_and_lead_accountability(self):
        self.assertEqual(set(POSITIONS), {"Movement", "Evolution", "Being", "Design"})
        with self.assertRaisesRegex(ValueError, "Position"):
            self.owner.create_project("X", "Repair", "Verified app", "FakeLeader")
        item = self.task("Fix parser", "Movement")
        with self.assertRaisesRegex(ValueError, "rotating lead"):
            self.owner.complete_project(self.project["id"], "Movement", self.artifact("final.txt"))
        self.assertEqual(self.owner.project(self.project["id"])["tasks"][0]["owner"], item["owner"])

    def test_delegation_never_transfers_ownership_or_completion(self):
        item = self.task("Repair AutoLing", "Being")
        delegated = self.owner.delegate(item["id"], "Being", "external-programmer")
        self.assertEqual(delegated["owner"], "Being")
        self.assertEqual(delegated["delegate"], "external-programmer")
        self.assertEqual(delegated["state"], "assigned")
        with self.assertRaisesRegex(ValueError, "assigned owner"):
            self.owner.update_task(item["id"], "Movement", "verified",
                                   self.artifact("proof.txt"))
        with self.assertRaisesRegex(ValueError, "assigned owner"):
            self.owner.delegate(item["id"], "Evolution", "outsider")
        self.assertEqual(self.owner.task(item["id"])["state"], "assigned")

    def test_actual_evidence_required_no_fake_completion(self):
        item = self.task("Fix state space", "Evolution")
        with self.assertRaisesRegex(ValueError, "structured"):
            self.owner.update_task(item["id"], "Evolution", "verified", None)
        with self.assertRaisesRegex(ValueError, "missing"):
            self.owner.update_task(item["id"], "Evolution", "verified",
                                   {"kind": "artifact", "relative_path": "not-real.apk"})
        with self.assertRaisesRegex(ValueError, "escapes"):
            self.owner.update_task(item["id"], "Evolution", "verified",
                                   {"kind": "artifact", "relative_path": "../outside.txt"})
        proof = self.artifact("real-result.bin")
        with self.assertRaisesRegex(ValueError, "mismatch"):
            self.owner.update_task(item["id"], "Evolution", "verified",
                                   {**proof, "sha256": "0" * 64})
        receipt = self.owner.update_task(item["id"], "Evolution", "verified", proof)
        self.assertEqual(receipt["state"], "verified")
        self.assertEqual(receipt["evidence"]["verified"], "file-presence-and-hash-only")
        with self.assertRaisesRegex(ValueError, "immutable"):
            self.owner.update_task(item["id"], "Evolution", "working")

    def test_finished_member_offers_help_but_does_not_claim_execution(self):
        outstanding = self.task("Repair integration", "Design")
        finished = self.task("Collect evidence", "Movement")
        self.owner.update_task(outstanding["id"], "Design", "help_needed")
        self.owner.update_task(finished["id"], "Movement", "verified",
                               self.artifact("research.txt"))
        updated = self.owner.task(outstanding["id"])
        self.assertIn("Movement", updated["helpers"])
        self.assertEqual(updated["owner"], "Design")
        self.assertEqual(updated["state"], "help_needed")
        events = self.owner.feed()["notifications"]
        offer = next(x for x in events if x["kind"] == "help-offered")
        self.assertIn("not proof", offer["detail"])

    def test_no_project_completion_until_all_verified_and_owner_accepts(self):
        first = self.task("Research", "Being")
        second = self.task("Build", "Design")
        self.owner.update_task(first["id"], "Being", "verified", self.artifact("a.txt"))
        with self.assertRaisesRegex(ValueError, "Every assigned task"):
            self.owner.complete_project(self.project["id"], "Design", self.artifact("final.txt"))
        self.owner.update_task(second["id"], "Design", "verified", self.artifact("b.txt"))
        evidence = self.owner.complete_project(
            self.project["id"], "Design", self.artifact("final.txt"))
        self.assertEqual(evidence["status"], "awaiting_acceptance")
        with self.assertRaisesRegex(ValueError, "explicitly true"):
            self.owner.accept_project(self.project["id"], False)
        completed = self.owner.accept_project(self.project["id"], True)
        self.assertEqual(completed["status"], "completed")
        self.assertTrue(completed["completed"])
        with self.assertRaisesRegex(ValueError, "immutable"):
            self.owner.add_task(self.project["id"], "Bad", "Do it", "Movement")

    def test_owner_private_records_and_notifications(self):
        item = self.task("Private project item", "Being")
        with self.assertRaisesRegex(ValueError, "not found"):
            self.other.project(self.project["id"])
        with self.assertRaisesRegex(ValueError, "not found"):
            self.other.task(item["id"])
        self.assertEqual(self.other.state()["projects"], [])
        self.assertEqual(self.other.feed()["notifications"], [])
        self.assertGreater(self.owner.state()["unread"], 0)
        latest = self.owner.feed()["latest"]
        self.owner.acknowledge(latest)
        self.assertEqual(self.owner.state()["unread"], 0)
        self.assertEqual(self.other.state()["unread"], 0)

    def test_research_and_training_notifications_require_receipts(self):
        before = self.owner.feed()["latest"]
        self.owner.record_research("Movement", {"attempts": []})
        self.owner.record_adapter_training({"status": "not-actually-trained"})
        self.assertEqual(self.owner.feed()["latest"], before)
        self.owner.record_research("Movement", {"attempts": [
            {"status": "anchored"}, {"status": "needs_review"}
        ]})
        self.owner.record_adapter_training({
            "trained_position": "Design",
            "status": "adapter-trained-not-validated-for-research-correctness",
            "revision": "revision-actual"
        })
        fresh = self.owner.feed(after=before)["notifications"]
        self.assertEqual(len(fresh), 2)
        self.assertEqual(fresh[0]["kind"], "research-progress")
        self.assertIn("failed or needing review", fresh[0]["detail"])
        self.assertEqual(fresh[1]["kind"], "adapter-revision")
        self.assertIn("not established", fresh[1]["detail"])

    def test_recent_inbox_and_cursor_are_monotonic(self):
        for i in range(110):
            self.task("Task " + str(i), "Movement")
        recent = self.owner.feed(limit=5)
        self.assertEqual(len(recent["notifications"]), 5)
        ids = [x["id"] for x in recent["notifications"]]
        self.assertEqual(ids, sorted(ids))
        self.assertEqual(ids[-1], self.owner.feed(limit=100)["latest"])
        self.assertEqual(self.owner.feed(after=ids[-1])["notifications"], [])


if __name__ == "__main__":
    unittest.main()
