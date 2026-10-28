import json
import os
import tempfile
import unittest
from pathlib import Path

from trident_inference import load_model, parse_request


class TestTridentInference(unittest.TestCase):
    def test_rejects_mismatched_model_and_no_stream(self):
        example={'model':'synthia-trident-revision-abc','messages':[{'role':'user','content':'Hello'}]}
        self.assertEqual(parse_request(example,'synthia-trident-revision-abc')[1],64)
        with self.assertRaisesRegex(ValueError,'differs'):
            parse_request(example,'wrong')
        with self.assertRaisesRegex(ValueError,'non-streaming'):
            parse_request({**example,'stream':True},example['model'])
        with self.assertRaisesRegex(ValueError,'integer'):
            parse_request({**example,'max_tokens':False},example['model'])

    def test_load_real_training_reject_untrained(self):
        import training_core
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileNotFoundError):load_model(Path(temp)/'none')
            corpus=Path(temp)/'corpus.jsonl'
            corpus.write_text(json.dumps({'prompt':'Context?','response':'The relationship of a thing to its surroundings.'})+'\n')
            old=training_core.ROOT
            try:
                training_core.ROOT=Path(temp)/'workspace'
                receipt=training_core.train_uploaded(str(corpus),None,'Portable · 260-byte vocabulary',1,True)
                model,name=load_model(training_core.ROOT)
                self.assertEqual(model.steps,1)
                self.assertIn(receipt['revision'],name)
                self.assertGreater(model.model.param_count(),1000)
            finally:
                training_core.ROOT=old

if __name__=='__main__':unittest.main()