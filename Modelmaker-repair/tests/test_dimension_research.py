import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from assembly.dimension_research import DIMENSIONS, DimensionResearch, spans


class FakeAssembly:
    def __init__(self):
        self.user = 'owner'
        self.lock = threading.RLock()
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('CREATE TABLE documents (id TEXT PRIMARY KEY,user TEXT,title TEXT,source TEXT,kind TEXT,text TEXT,created TEXT)')
    def close(self):
        self.db.close()
        self.tmp.cleanup()


class DimensionResearchTests(unittest.TestCase):
    def setUp(self):
        self.r = FakeAssembly()
        self.team = DimensionResearch(self.r)
        self.text = 'The stream flows downstream.\n' * 100
        for dimension in DIMENSIONS:
            self.r.db.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',
                              (dimension+'-doc','owner',dimension+' Source','book://'+dimension,'source',self.text,'now'))
        self.r.db.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?)',
                          ('other-doc','someone','Secret','secret','source','No access','now'))
        self.r.db.commit()
        self.assignments = [dict(dimension=d, checkpoint='/actual/'+d, document_ids=[d+'-doc'], instructions='Read all material carefully for '+d)
                            for d in sorted(DIMENSIONS)]
    def tearDown(self):
        self.r.close()
    def test_all_source_characters_covered(self):
        example = ('Head\n\n'+'p'*120+' \n'*20)*60
        parts = spans(example)
        self.assertEqual(''.join(p for _,_,p in parts),example)
        self.assertEqual(parts[0][0],0)
        self.assertEqual(parts[-1][1],len(example))
        for prev, nxt in zip(parts,parts[1:]):
            self.assertEqual(prev[1],nxt[0])
    def test_reject_incomplete_assignments_and_foreign_sources(self):
        with self.assertRaisesRegex(ValueError,'exactly four'):
            self.team.configure(self.assignments[:3])
        bad = [dict(a) for a in self.assignments]
        bad[0]['document_ids'] = ['other-doc']
        with self.assertRaisesRegex(ValueError,'belongs to another'):
            self.team.configure(bad)
        bad = [dict(a) for a in self.assignments]
        bad[0]['checkpoint'] = ''
        with self.assertRaisesRegex(ValueError,'checkpoint'):
            self.team.configure(bad)
        self.assertEqual(self.team.status()['dimensions']['Being']['passages_total'],0)
    def test_full_read_receipts_and_unchanged_coverage(self):
        self.team.configure(self.assignments)
        prompts=[]
        def researched(dim, checkpoint, prompt):
            prompts.append((dim,checkpoint,prompt))
            phrase='The stream flows downstream.'
            return json.dumps({'observations':[{'quote':phrase,'observation':'Describes the flow of the stream.',
                                                'dimension_connection':'No unsupported mapping asserted.'}]})
        result=self.team.run('Movement',max_passages=100,generate=researched)
        coverage=result['status']
        self.assertEqual(coverage['passages_total'],coverage['passages_verified'])
        self.assertTrue(coverage['traversal_complete'])
        self.assertTrue(all('Do not extract a fixed set of primitives' in p[-1] for p in prompts))
        exported=self.team.export('Movement')
        self.assertEqual(len(exported['passages']),coverage['passages_total'])
        self.assertTrue(all(p['observations'][0]['quote']== 'The stream flows downstream.' for p in exported['passages']))
        self.assertEqual(self.team.run('Movement',1,generate=researched)['attempts'],[])
        self.assertEqual(self.team.status()['dimensions']['Evolution']['passages_verified'],0)
    def test_invented_quotes_and_no_checkpoint_do_not_count_as_read(self):
        self.team.configure(self.assignments)
        result=self.team.run('Design',generate=lambda *_:json.dumps({'observations':[{'quote':'a made-up statement','observation':'invented'}]}))
        self.assertEqual(result['attempts'][0]['status'],'needs_review')
        self.assertEqual(result['status']['passages_verified'],0)
        good=self.team.run('Design',generate=lambda *_:json.dumps({'observations':[{'quote':'The stream flows downstream.','observation':'Flow observed.'}]}))
        self.assertEqual(good['attempts'][0]['status'],'anchored')
        self.assertEqual(good['status']['passages_verified'],1)
    def test_same_source_all_positions_with_independent_readings(self):
        self.team.configure_shared([{'dimension':d} for d in sorted(DIMENSIONS)])
        status=self.team.status()
        for dim in DIMENSIONS:
            self.assertEqual(status['dimensions'][dim]['passages_total'],8)
            self.assertEqual(status['dimensions'][dim]['passages_verified'],0)
            self.assertEqual({x['document_id'] for x in status['dimensions'][dim]['sources']},
                             {v+'-doc' for v in DIMENSIONS})
        # Every position sees identical shared passages, but records its own findings.
        for dim in sorted(DIMENSIONS):
            self.team.run(dim,max_passages=1,generate=lambda d,c,p:json.dumps(
                {'observations':[{'quote':'The stream flows downstream.',
                                  'observation':d+' independently observes the flowing stream.'}]}))
        combined=self.team.compare()
        common=[x for x in combined['passages'] if all(x['positions'][d]['status']=='anchored' for d in DIMENSIONS)]
        self.assertEqual(len(common),1)
        self.assertEqual(common[0]['quotes_shared_by_all'],['The stream flows downstream.'])
        self.assertEqual(len({common[0]['positions'][d]['observations'][0]['observation'] for d in DIMENSIONS}),4)

    def test_new_shared_source_is_seen_by_all_and_missing_weights_are_explicit(self):
        self.team.configure_shared([{'dimension':d} for d in sorted(DIMENSIONS)])
        with self.assertRaisesRegex(ValueError,'checkpoint'):
            self.team.run('Movement')
        self.r.db.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?)',
                          ('new-doc','owner','Shared New','owner-import','source','An entirely new source.','now'))
        self.r.db.commit()
        status=self.team.status()['dimensions']
        self.assertEqual([s['document_id'] for s in status['Being']['sources']].count('new-doc'),1)
        for dim in DIMENSIONS:
            self.assertIn('new-doc',{x['document_id'] for x in status[dim]['sources']})
        self.assertNotIn('other-doc',{x['document_id'] for x in status['Design']['sources']})

    def test_reject_per_position_source_selection_in_shared_mode(self):
        positions=[{'dimension':d} for d in sorted(DIMENSIONS)]
        positions[0]['document_ids']=['Movement-doc']
        with self.assertRaisesRegex(ValueError,'Shared mode'):
            self.team.configure_shared(positions)

    def test_source_scope_update_invalidates_old_results(self):
        self.team.configure(self.assignments)
        self.team.run('Being',generate=lambda *_:json.dumps({'observations':[{'quote':'The stream flows downstream.','observation':'Flow observed.'}]}))
        self.assertEqual(self.team.status()['dimensions']['Being']['passages_verified'],1)
        new=[dict(a) for a in self.assignments]
        for a in new:
            if a['dimension']=='Being':a['instructions']='New owner-assigned scope'
        self.team.configure(new)
        self.assertEqual(self.team.status()['dimensions']['Being']['passages_verified'],0)


if __name__=='__main__':
    unittest.main()
