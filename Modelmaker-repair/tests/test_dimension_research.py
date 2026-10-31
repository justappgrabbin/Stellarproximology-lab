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
