"""Offline tests for Modelmaker's adaptive personal model mechanisms."""
import tempfile
import unittest
from pathlib import Path

from adaptive_person import AdaptivePeople


class AdaptivePeopleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp.name) / "people.sqlite3"
        self.engine = AdaptivePeople(self.db_path)

    def tearDown(self):
        self.temp.cleanup()

    def test_observations_and_preference_corrections_are_append_only(self):
        self.engine.observe("person-a", "Likes short lessons", "person-stated")
        self.engine.remember_preference("person-a", "lesson_length", "short", "said in chat")
        self.engine.remember_preference("person-a", "lesson_length", "long", "corrected explicitly")
        profile = self.engine.profile("person-a")
        self.assertEqual(profile["event_count"], 3)
        self.assertEqual(profile["current_preferences"]["lesson_length"]["value"], "long")
        self.assertEqual(len(self.engine.history("person-a")), 3)
        self.assertEqual(self.engine.history("person-a")[1]["preference"], "short")
        self.assertEqual(self.engine.history("person-a")[2]["preference"], "long")

    def test_people_and_observer_perspectives_are_isolated(self):
        self.engine.observe("a", "private note for a")
        self.engine.observe("b", "note for b")
        self.engine.observe("a", "different perspective", observer_id="other")
        self.assertEqual(self.engine.profile("a")["event_count"], 1)
        self.assertEqual(self.engine.profile("b")["event_count"], 1)
        self.assertEqual(self.engine.profile("a", "other")["event_count"], 1)
        self.assertEqual(self.engine.profile("a", "other")["observations"][0]["statement"], "different perspective")

    def test_contextual_learning_and_correctable_feedback(self):
        self.engine.observe("a", "prefers quiet")
        suggestion = self.engine.recommend("a", ["read", "listen"], {"time": "morning"})
        request_id = suggestion["request_id"]
        self.assertFalse(suggestion["cold_start"])
        self.engine.feedback("a", request_id, 1.0, "helped")
        self.assertEqual(self.engine.profile("a")["evaluated_recommendations"], 1)
        before = len(self.engine.history("a"))
        self.engine.feedback("a", request_id, 0.0, "correction: did not help")
        events = self.engine.history("a")
        self.assertEqual(len(events), before + 1)
        self.assertEqual(events[-1]["supersedes_event_id"], events[-2]["id"])
        stats = self.engine._learned_rewards(events, {"time": "morning"})
        self.assertEqual(stats[suggestion["action"]]["alpha"], 1.0)
        self.assertEqual(stats[suggestion["action"]]["beta"], 2.0)
        self.assertEqual(stats[suggestion["action"]]["samples"], 1)

    def test_cold_start_is_explicit_and_clarification_is_offered(self):
        result = self.engine.recommend("new", ["lesson", "activity"])
        self.assertTrue(result["cold_start"])
        self.assertIn("Which of these", result["clarifying_question"])
        self.assertEqual(self.engine.profile("new")["pending_recommendations"], [result["request_id"]])

    def test_invalid_reward_and_cross_person_feedback_are_rejected(self):
        suggestion = self.engine.recommend("a", ["experiment"])
        with self.assertRaises(ValueError):
            self.engine.feedback("b", suggestion["request_id"], 1.0, "wrong person")
        with self.assertRaises(ValueError):
            self.engine.feedback("a", suggestion["request_id"], float("nan"), "")
        with self.assertRaises(ValueError):
            self.engine.recommend("a", ["experiment"], {"invalid": []})
        with self.assertRaises(ValueError):
            self.engine.remember_preference("a", "x", "y", "")

    def test_reopening_database_recovers_learning(self):
        suggestion = self.engine.recommend("a", ["draw", "write"])
        self.engine.feedback("a", suggestion["request_id"], 0.9, "useful")
        again = AdaptivePeople(self.db_path)
        self.assertEqual(again.profile("a")["evaluated_recommendations"], 1)
        self.assertEqual(again.profile("a")["event_count"], 2)


if __name__ == "__main__":
    unittest.main()
