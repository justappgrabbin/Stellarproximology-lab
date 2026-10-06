import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
import zipfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local-learning'))
from train_local import train_baseline, generate_baseline, windows, partition
from service import Workspace, training_spec, approved

CORPUS=('Research is an experiment. Notice the evidence. Compare the results. '
        'Code is tested before publishing. Reflect on a concrete decision. ')*10


class LocalLearningTests(unittest.TestCase):
    def test_utf8_and_nonoverlapping_split(self):
        chunks=windows('🌱观察 '+CORPUS);train,test=partition(chunks)
        self.assertEqual(len(train)+len(test),len(chunks))
        self.assertEqual(test,chunks[::5])
        self.assertTrue(all(0<=b<=255 for c in chunks for b in c))
    def test_real_baseline_training(self):
        with tempfile.TemporaryDirectory() as d:
            result=train_baseline(CORPUS,Path(d)/'model',Path(d)/'progress.json')
            self.assertTrue(result['counts']);self.assertGreater(result['evaluation_loss'],0)
            self.assertIsInstance(generate_baseline(result,'Research is',20),str)
            self.assertEqual(json.loads((Path(d)/'progress.json').read_text())['status'],'completed')
    def test_training_validation_and_approval(self):
        for payload in [{'text':'tiny'},{'text':CORPUS,'engine':'shell'},{'text':CORPUS,'epochs':999},{'text':CORPUS,'head':'hack'},{'text':CORPUS,'order':9}]:
            with self.assertRaises(ValueError):training_spec(payload)
        with self.assertRaises(PermissionError):approved({'approved':'true'})
    def test_worker_registry_and_version_bound_release(self):
        with tempfile.TemporaryDirectory() as d:
            w=Workspace(d)
            try:
                job=w.start({'text':CORPUS,'engine':'byte-ngram','name':'Test','approved':True})
                deadline=time.time()+10
                while time.time()<deadline:
                    w.refresh()
                    if w.get('jobs',job['id'])['status']!='running':break
                    time.sleep(.05)
                self.assertEqual(w.get('jobs',job['id'])['status'],'completed')
                self.assertEqual(len(w.state['models']),1)
                w.select(job['id']);self.assertEqual(w.state['selected'],job['id'])
                self.assertIsInstance(w.generate(job['id'],{'prompt':'Research is'})['text'],str)
                release=w.stage_release({'model':job['id'],'target':'download'})
                data=(w.path(release['id'])/'release.zip').read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),release['sha256'])
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    self.assertNotIn('corpus.txt',archive.namelist());self.assertNotIn('worker.log',archive.namelist())
                    self.assertIn('baseline.json',archive.namelist())
                with self.assertRaises(ValueError):w.publish(release['id'],{'approved':True,'sha256':'wrong'})
                result=w.publish(release['id'],{'approved':True,'sha256':release['sha256']})
                self.assertEqual(result['status'],'approved')
                with self.assertRaises(ValueError):w.publish(release['id'],{'approved':True,'sha256':release['sha256']})
            finally:w.close()
    def test_autolab_limits_pause_and_recovery(self):
        with tempfile.TemporaryDirectory() as d:
            w=Workspace(d)
            with self.assertRaises(ValueError):w.plan({'text':CORPUS,'runs':999,'approved':True})
            plan=w.plan({'text':CORPUS,'runs':2,'approved':True})
            self.assertEqual(plan['status'],'active')
            w.pause_plan(plan['id']);self.assertEqual(w.get('plans',plan['id'])['status'],'paused')
            w.state['plans'][0]['status']='active';w.save()
            reloaded=Workspace(d);self.assertEqual(reloaded.state['plans'][0]['status'],'paused')
    def test_path_and_catalog_are_not_installed_models(self):
        with tempfile.TemporaryDirectory() as d:
            w=Workspace(d)
            with self.assertRaises(ValueError):w.path('../../escape')
            catalog=w.list_models();self.assertEqual(len(catalog['catalog']),7);self.assertEqual(catalog['local'],[])
            self.assertTrue(all('not installed' in m['availability'] for m in catalog['catalog']))

    def test_swarm_pipeline_route_and_reviewed_paper(self):
        with tempfile.TemporaryDirectory() as d:
            w=Workspace(d)
            with self.assertRaises(PermissionError): w.analyze({'name':'x.json','text':'{"x":1}'})
            source='{"measurements":[1,2,3,4,5,6]}'
            record=w.analyze({'name':'x.json','text':source,'route':'papers','approved':True})
            self.assertEqual(record['report']['statistics']['sum'],21)
            self.assertEqual((w.path(record['id'])/'restored-source.txt').read_text(),source)
            self.assertTrue((Path(d)/record['task']['address']).exists())
            release=w.stage_release({'analysis':record['id'],'target':'download'})
            self.assertEqual(release['kind'],'paper')
            self.assertIn('paper-draft.md',release['included_files'])
            self.assertNotIn('restored-source.txt',release['included_files'])
            with self.assertRaises(ValueError): w.publish(release['id'],{'approved':True,'sha256':'changed'})
            w.publish(release['id'],{'approved':True,'sha256':release['sha256']})
            changed=w.analyze({'name':'x.json','text':'{"measurements":[2]}','approved':True})
            self.assertTrue(changed['report']['versionComparison']['changed'])
            code=w.analyze({'name':'broken.mjs','text':'const = ;','approved':True})
            self.assertFalse(code['report']['syntax']['passed'])
            self.assertEqual(code['route'],'build')
            self.assertTrue(any(f['kind']=='syntax-error' for f in code['report']['findings']))


if __name__=='__main__':unittest.main()
