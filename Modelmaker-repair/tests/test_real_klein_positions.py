"""Integration tests for actual preserved Klein tools, not fake adapters."""
import tempfile
import unittest
from pathlib import Path

from assembly.dimension_research import DIMENSIONS, DimensionResearch
from assembly.runtime import Assembly


class RealKleinPositionsTests(unittest.TestCase):
    def test_four_actual_tool_instances_on_one_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            assembly = Assembly(Path(tmp), 'verification')
            try:
                source = (
                    'A person observes a moving river from a bridge. '
                    'The river changes after heavy rain. '
                    'The observer records what changed, where and when.'
                )
                document_id, _ = assembly.register(source, 'One shared observation', 'local-test')
                team = DimensionResearch(assembly)
                team.configure_shared([{'dimension':d} for d in sorted(DIMENSIONS)])
                keys = []
                for dimension in sorted(DIMENSIONS):
                    result = team.observe_klein(dimension, 1)
                    self.assertEqual(len(result['attempts']), 1)
                    self.assertEqual(result['attempts'][0]['source_id'], document_id)
                    keys.append(result['klein_position_key'])
                self.assertEqual(len(set(keys)), 4)
                comparison = team.compare(document_id=document_id)
                self.assertEqual(len(comparison['passages']), 1)
                p = comparison['passages'][0]['positions']
                self.assertEqual(set(p), DIMENSIONS)
                for d in DIMENSIONS:
                    self.assertIn(p[d]['klein_status'], ('processed','failed'))
                    # Every invocation must have an actual retained receipt or a
                    # reported error; never silently count the passage as read.
                    self.assertTrue(p[d]['klein_receipt'] or p[d]['klein_error'])
                # The same source was presented to four positions, without
                # fabrication of neural training outcomes.
                self.assertTrue(all(team.status()['dimensions'][d]['passages_verified']==0
                                    for d in DIMENSIONS))
            finally:
                assembly.close()


if __name__=='__main__':
    unittest.main()
