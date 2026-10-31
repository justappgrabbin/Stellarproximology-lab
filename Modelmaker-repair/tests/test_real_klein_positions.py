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
                    self.assertEqual(p[d]['klein_status'],'processed',
                                     f'{d}: Klein pipeline failed: {p[d]["klein_error"]}')
                    receipt=p[d]['klein_receipt']
                    self.assertIsInstance(receipt,dict)
                    self.assertGreaterEqual(len(receipt['outputs']),5)
                    self.assertTrue(all(tool['accepted'] is True for tool in receipt['outputs']))
                    self.assertTrue({'autoling','diseminer'}.issubset(
                        {tool['toolId'] for tool in receipt['outputs']}))
                    projection=receipt.get('position_projection')
                    self.assertIsInstance(projection,dict)
                    self.assertEqual(projection['position'],d)
                    self.assertEqual(projection['projection']['dimension'],d)
                    self.assertTrue(projection['behavioralChain'])
                    self.assertTrue(projection['sourceCrystalChain'])
                    self.assertNotEqual(projection['behavioralChain'],
                                        projection['sourceCrystalChain'])
                    self.assertTrue(projection['noAutomaticCanonPromotion'])
                # The same source was presented to four positions, without
                # fabrication of neural training outcomes.
                self.assertTrue(all(team.status()['dimensions'][d]['passages_verified']==0
                                    for d in DIMENSIONS))
            finally:
                assembly.close()


if __name__=='__main__':
    unittest.main()
