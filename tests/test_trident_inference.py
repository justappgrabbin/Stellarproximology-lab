import json
import os
import tempfile
import unittest
from pathlib import Path

from trident_inference import load_model, parse_request, handler_for
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.request import Request, urlopen
from urllib.error import HTTPError


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
                server=ThreadingHTTPServer(('127.0.0.1',0),handler_for(model,name))
                server.daemon_threads=True
                worker=Thread(target=server.serve_forever,daemon=True)
                worker.start()
                url=f'http://127.0.0.1:{server.server_port}'
                try:
                    with urlopen(url+'/health',timeout=5) as response:
                        health=json.loads(response.read())
                        self.assertTrue(health['checkpoint_loaded'])
                        self.assertFalse(health['production_ready'])
                    payload={'model':name,'messages':[{'role':'user','content':'Context?'}],
                             'max_tokens':4,'head':'research','seed':7}
                    request=Request(url+'/v1/chat/completions',data=json.dumps(payload).encode(),
                                    headers={'Content-Type':'application/json'},method='POST')
                    with urlopen(request,timeout=20) as response:
                        result=json.loads(response.read())
                        self.assertEqual(result['model'],name)
                        self.assertEqual(result['metadata']['architecture'],'synthia-relational-trident')
                        self.assertEqual(result['metadata']['optimizer_steps'],1)
                    bad={**payload,'model':'wrong'}
                    request=Request(url+'/v1/chat/completions',data=json.dumps(bad).encode(),
                                    headers={'Content-Type':'application/json'},method='POST')
                    with self.assertRaises(HTTPError) as error:urlopen(request,timeout=5)
                    self.assertEqual(error.exception.code,400)
                finally:
                    server.shutdown()
                    server.server_close()
                    worker.join(timeout=2)
            finally:
                training_core.ROOT=old

if __name__=='__main__':unittest.main()