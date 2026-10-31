"""Regression tests for real source-validated dimensional graph inputs."""
import json
import tempfile
import unittest
from pathlib import Path
import torch

from source.dimensional_router import (
    DEFAULT_ROUTER, CHAINS, DIMENSIONS, FRAME_ORDERS, CrossLink,
    DimensionalRouter, DimensionalRuleError,
)
from source.semantic_language_maker import semantic_features


class StructuralRoutingTests(unittest.TestCase):
    def test_every_dimension_has_its_own_distinct_local_chain(self):
        self.assertEqual(len(CHAINS), 5)
        self.assertEqual(len(set(tuple(v) for v in CHAINS.values())), 5)
        for dimension, chain in CHAINS.items():
            self.assertEqual(chain[0], dimension)
            for a, b in zip(chain, chain[1:]):
                result = DEFAULT_ROUTER.route({"dimension": dimension, "from": a, "to": b})
                self.assertTrue(result["supported"], f"{dimension} {a}->{b}")
                self.assertEqual(result["status"], "source_defined")

    def test_non_edges_reversed_and_skipped_steps_are_rejected(self):
        for event in (
            {"dimension": "Movement", "from": "Seeing", "to": "Energy"},
            {"dimension": "Movement", "from": "Energy", "to": "Seeing"},
            {"dimension": "Evolution", "from": "Light", "to": "Love"},
        ):
            self.assertEqual(DEFAULT_ROUTER.route(event)["status"], "invalid_local_edge")
            with self.assertRaises(DimensionalRuleError):
                DEFAULT_ROUTER.encode([event])

    def test_seeing_to_illusion_does_not_automatically_cross_dimensions(self):
        event = {"dimension": "Movement", "from": "Seeing",
                 "to_dimension": "Space", "to": "Illusion"}
        self.assertEqual(DEFAULT_ROUTER.route(event)["status"], "unresolved_cross_link")
        with self.assertRaisesRegex(DimensionalRuleError, "unresolved_cross_link"):
            DEFAULT_ROUTER.encode([event])

    def test_proposed_cross_link_is_not_a_verified_link(self):
        l = CrossLink("Movement", "Seeing", "Space", "Illusion",
                      provenance="hypothesis", evidence="unverified proposal",
                      source_explicit=False)
        with self.assertRaisesRegex(DimensionalRuleError, "proposed_cross_link"):
            DimensionalRouter((l,)).encode([
                {"dimension": "Movement", "from": "Seeing",
                 "to_dimension": "Space", "to": "Illusion"}
            ])

    def test_source_explicit_cross_link_requires_source_and_can_be_traced(self):
        with self.assertRaises(DimensionalRuleError):
            DimensionalRouter((CrossLink(
                "Movement", "Seeing", "Space", "Illusion", "", "claimed", True),))
        evidence = CrossLink("Movement", "Seeing", "Space", "Illusion",
                             "test-only fictitious source", "fixture edge", True)
        router = DimensionalRouter((evidence,))
        trace = router.route({"dimension": "Movement", "from": "Seeing",
                              "to_dimension": "Space", "to": "Illusion"})
        self.assertEqual(trace["edge_provenance"], "test-only fictitious source")
        self.assertEqual(router.encode([{"dimension": "Movement", "from": "Seeing",
                                        "to_dimension": "Space", "to": "Illusion"}])[0][22], 1)

    def test_being_led_traversal_only_one_known(self):
        self.assertEqual(set(FRAME_ORDERS), {"Being"})
        trace = DEFAULT_ROUTER.route({"dimension": "Movement", "from": "Energy",
                                      "to": "Creation", "frame_dimension": "Being"})
        self.assertEqual(trace["frame_status"], "source_defined")
        self.assertEqual(trace["frame_order"],
                         ["Being", "Movement", "Space", "Design", "Evolution"])
        for dimension in ("Movement", "Evolution", "Design", "Space"):
            trace = DEFAULT_ROUTER.route({"dimension": "Movement", "from": "Energy",
                                          "to": "Creation", "frame_dimension": dimension})
            self.assertIsNone(trace["frame_order"])
            self.assertEqual(trace["frame_status"], "unresolved_order")

    def test_membership_does_not_fabricate_overlap(self):
        membership = DEFAULT_ROUTER.membership()
        self.assertEqual(set(membership), set(DIMENSIONS))
        self.assertTrue(membership["Movement"]["Seeing"])
        self.assertFalse(membership["Space"]["Seeing"])
        overlaps = DEFAULT_ROUTER.overlap()
        for dim in DIMENSIONS:
            for other in DIMENSIONS:
                if dim != other:
                    self.assertEqual(overlaps[dim][other], [])

    def test_valid_path_and_rejects_invalid_path(self):
        out = DEFAULT_ROUTER.walk("Movement", ["Energy", "Creation", "Seeing"],
                                  frame_dimension="Being")
        self.assertEqual(len(out), 2)
        with self.assertRaises(DimensionalRuleError):
            DEFAULT_ROUTER.walk("Movement", ["Energy", "Seeing"])

    def test_input_validation_is_strict(self):
        for event in (
            {"dimension": "Movement", "from": "Energy", "to": "Creation", "extra": 1},
            {"dimension": "Movement", "from": "Energy", "to": "Unknown"},
            {"dimension": "Missing", "from": "Energy", "to": "Creation"},
            [],
        ):
            with self.assertRaises(DimensionalRuleError):
                DEFAULT_ROUTER.encode([event])
        with self.assertRaises(DimensionalRuleError):
            DEFAULT_ROUTER.encode([{"dimension": "Movement", "from": "Energy",
                                    "to": "Creation"}] * 33)

    def test_feature_path_conditions_real_trident_8x32_tensor(self):
        base = semantic_features("energy and creation")
        event = {"dimension": "Movement", "from": "Energy", "to": "Creation"}
        influenced = semantic_features("energy and creation", dimension_events=[event])
        self.assertEqual(tuple(influenced.shape), (8, 32))
        self.assertTrue(torch.isfinite(influenced).all())
        self.assertFalse(torch.equal(base, influenced))
        self.assertTrue(torch.equal(base[:5], influenced[:5]))
        self.assertTrue(torch.equal(base[6:], influenced[6:]))
        self.assertGreater(influenced[5, 0], base[5, 0])

    def test_invalid_graph_does_not_enter_training_features(self):
        event = {"dimension": "Movement", "from": "Seeing",
                 "to_dimension": "Space", "to": "Illusion"}
        with self.assertRaises(DimensionalRuleError):
            semantic_features("anything", dimension_events=[event])

    def test_real_gradient_step_accepts_structurally_annotated_training(self):
        from source.semantic_language_maker import NeuralMaker
        maker = NeuralMaker()
        record = {"prompt": "How do you create?",
                  "response": "Through a documented transformation.",
                  "head": "research",
                  "dimension_events": [
                      {"dimension": "Movement", "from": "Energy", "to": "Creation"}
                  ]}
        before = maker.model.klein_encoder[0].weight.detach().clone()
        result = maker.fit([record], steps=1)
        self.assertTrue(result["trained"])
        self.assertFalse(torch.equal(before, maker.model.klein_encoder[0].weight.detach()))
        sampled = maker.generate("creation?", seed=9, max_new_bytes=2,
            features={"dimension_events": record["dimension_events"]})
        self.assertTrue(sampled["ready"])

    def test_jsonl_rejects_wrong_edge_and_preserves_valid_row(self):
        from training_core import _jsonl
        with self.assertRaises(DimensionalRuleError):
            _jsonl(json.dumps({"prompt": "a", "response": "b",
                "dimension_events": [{"dimension": "Being", "from": "Matter",
                                      "to": "Survival"}]}), from_file=False)
        good = _jsonl(json.dumps({"prompt": "a", "response": "b",
                  "dimension_events": [{"dimension": "Being", "from": "Matter",
                                        "to": "Touch"}]}), from_file=False)
        self.assertEqual(good[0]["dimension_events"][0]["to"], "Touch")

    def test_export_includes_router_source_for_reloading(self):
        import training_core
        with tempfile.TemporaryDirectory() as tmp:
            from pathlib import Path
            old = training_core.ROOT
            try:
                training_core.ROOT = Path(tmp) / "weights"
                corpus = Path(tmp) / "training.jsonl"
                corpus.write_text(json.dumps({
                    "prompt": "Where?", "response": "Matter and touch.",
                    "dimension_events": [{"dimension": "Being", "from": "Matter",
                                          "to": "Touch"}]}) + "\n")
                result = training_core.train_uploaded(str(corpus), None,
                    "Portable · 260-byte vocabulary", 1, True)
                self.assertTrue(result["trained"])
                import zipfile
                with zipfile.ZipFile(training_core.checkpoint_bundle()) as zipfile_:
                    self.assertIn("source/dimensional_router.py", zipfile_.namelist())
            finally:
                training_core.ROOT = old


if __name__ == "__main__":
    unittest.main()
