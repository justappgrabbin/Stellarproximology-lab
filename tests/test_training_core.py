import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path

class TestWeightTrainer(unittest.TestCase):
    def test_train_checkpoint_revision_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ['MODELMAKER_WORKSPACE']=tmp
            import training_core
            importlib.reload(training_core)
            corpus=Path(tmp)/'train.jsonl'
            corpus.write_text('\n'.join(json.dumps(x) for x in [
                {'prompt':'What is context?','response':'Context is the situation around an event.'},
                {'prompt':'What is a word?','response':'A word is a linguistic unit.'}
            ]))
            a=training_core.train_uploaded(str(corpus),None,'Portable · 260-byte vocabulary',2,True)
            self.assertTrue(a['trained']);self.assertEqual(a['steps'],2)
            self.assertEqual(training_core.model_status()['optimizer_steps'],2)
            b=training_core.train_uploaded(str(corpus),None,'Portable · 260-byte vocabulary',1,True)
            self.assertEqual(b['steps'],3);self.assertNotEqual(a['revision'],b['revision'])
            self.assertTrue((Path(tmp)/a['revision']/'weights.pt').exists())
            self.assertTrue((Path(tmp)/b['revision']/'weights.pt').exists())
            result=training_core.sample('What is a word?','research',4,4)
            self.assertEqual(result['neuralSteps'],3)
            artifact=Path(training_core.checkpoint_bundle())
            self.assertTrue(artifact.is_file());self.assertGreater(artifact.stat().st_size,1000)
            import zipfile
            with zipfile.ZipFile(artifact) as backup:
                self.assertIn('source/model.py', backup.namelist())
                self.assertIn('source/semantic_language_maker.py', backup.namelist())
                self.assertIn('trident/weights.pt', backup.namelist())

    def test_reject_unapproved_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.environ['MODELMAKER_WORKSPACE']=tmp
            import training_core
            importlib.reload(training_core)
            f=Path(tmp)/'train.jsonl'
            f.write_text('{"prompt":"x","response":"y"}\n')
            with self.assertRaisesRegex(ValueError,'approval'):
                training_core.train_uploaded(str(f),None,'Portable · 260-byte vocabulary',1,False)
            self.assertFalse((Path(tmp)/'current.json').exists())

if __name__ == '__main__':unittest.main()