import json
from pathlib import Path
import tempfile
import unittest

from autonomy.demo import make_replay
from autonomy.engine import Builder, DIMENSIONS, validate_units
from autonomy.models import ReplayModels


class InProcessTestSandbox:
    """Test-only sandbox double. Never used by the production CLI."""
    def check(self):
        pass

    def execute(self, directory, dimension):
        namespace = {}
        exec((directory / "capability.py").read_text(), namespace)
        return {"ok": True, "units": namespace["build_units"](dimension)}


class AutonomyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.responses = self.root / "responses"
        self.task_dir = Path(__file__).resolve().parents[1] / "autonomy" / "tasks"
        self.task = json.loads((self.task_dir / "hexagram-catalog.json").read_text())

    def tearDown(self):
        self.temp.cleanup()

    def builder(self):
        return Builder(ReplayModels(self.responses), self.root / "workspace", InProcessTestSandbox())

    def test_failed_round_recovers_with_256_units(self):
        make_replay(self.responses, first_round_broken=True)
        result = self.builder().run(self.task, self.task_dir)
        self.assertEqual(result["status"], "promoted")
        self.assertEqual(len(result["rounds"]), 2)
        self.assertFalse(result["rounds"][0]["perspectives"]["Movement"]["verification"]["ok"])
        active = json.loads((self.root / "workspace" / "active.json").read_text())
        catalog = json.loads((self.root / "workspace" / active["catalog"]).read_text())
        self.assertEqual(len(catalog["units"]), 256)
        self.assertEqual(len({u["id"] for u in catalog["units"]}), 256)

    def test_unretrieved_citation_blocks_without_replacing_active(self):
        make_replay(self.responses)
        first = self.builder().run(self.task, self.task_dir)
        active_before = (self.root / "workspace" / "active.json").read_text()
        for name in DIMENSIONS:
            (self.responses / f"{name}.research.json").write_text(json.dumps({"findings":[{"claim":"Invented","source_ids":["not-retrieved"]}]}))
        second = self.builder().run(self.task, self.task_dir, max_rounds=1)
        self.assertEqual(second["status"], "blocked")
        self.assertEqual((self.root / "workspace" / "active.json").read_text(), active_before)
        self.assertEqual(first["mode"], "replay")

    def test_profile_and_identity_cannot_be_changed(self):
        make_replay(self.responses)
        code = json.loads((self.responses / "Movement.build.json").read_text())["code"]
        namespace = {}
        exec(code, namespace)
        units = namespace["build_units"]("Movement")
        units[0]["perspective"] = {}
        with self.assertRaises(ValueError):
            validate_units(units, "Movement")
