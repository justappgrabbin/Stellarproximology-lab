import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "Modelmaker-repair"))
from seed import Primitive, build_seed, cycle


class SeedTests(unittest.TestCase):
    def test_all_64_states_preserve_the_same_six_lines(self):
        for value in range(64):
            bits = f"{value:06b}"
            views = Primitive(bits, "心 A").as_dict()
            self.assertEqual("".join(views["heart"]), bits)
            self.assertEqual("".join(views["mind"]), bits)
            self.assertEqual(views["body"], bits)
            self.assertIsNone(views["representations"]["ascii"])
            self.assertIsNone(views["representations"]["tcs"])

    def test_exactly_four_dimensions_share_context_without_mutation(self):
        received = []
        def adapter(prompt):
            received.append(prompt["context"])
            prompt["history"].append("must not leak")
            return {"bits": "010101", "text": "Context response"}
        history = []
        result = cycle("Build a greeting", [adapter] * 4, history)
        self.assertEqual(received, ["Build a greeting"] * 4)
        self.assertEqual(len(result[0]["primitives"]), 4)
        self.assertEqual(history, [])
        with self.assertRaises(ValueError):
            cycle("context", [adapter] * 5)

    def test_composition_and_html_escaping(self):
        first, _, _, _ = build_seed("000000", "Hello", [])
        state, _, html, path = build_seed("111111", '<script>alert(1)</script>', first)
        self.assertEqual(len(state), 2)
        self.assertEqual(len(first), 1)
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertIn("&lt;script&gt;", html)
        self.assertTrue(Path(path).is_file())
        with self.assertRaises(ValueError):
            Primitive("notbits", "context")
