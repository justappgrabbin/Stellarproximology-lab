import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from assembly.desktop_server import create_app
from assembly.training import fit_model

class DesktopTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.directory=Path(self.temp.name)
        self.app=create_app(directory=self.directory,mount_training=False)
        self.client=TestClient(self.app);self.client.__enter__();self.client.get('/')
    def tearDown(self):
        self.client.__exit__(None,None,None);self.temp.cleanup()
    def test_private_chat_and_unavailable_terminal(self):
        page=self.client.get('/')
        self.assertEqual(page.status_code,200);self.assertIn('/computer/workspace.mjs',page.text)
        self.assertNotIn('synthia/src/desktop-app',page.text)
        self.assertEqual(self.client.post('/api/computer/terminal',json={'command':'echo nope'}).status_code,403)
        self.assertFalse(self.client.get('/api/computer/status').json()['terminal_enabled'])
    def test_real_source_tools_and_model_are_connected(self):
        catalog=self.client.get('/api/computer/tools').json()
        self.assertEqual(len(catalog),19)
        receipt=self.client.post('/api/computer/study',json={'text':'River otters swim beside the quiet willow. River otters rest beside the willow.','title':'Observation'} )
        self.assertEqual(receipt.status_code,200,receipt.text)
        response=self.client.post('/api/computer/chat',json={'message':'What about river otters?'}).json()
        self.assertEqual(response['origin'],'retrieved-passages-not-llm-inference')
        self.assertTrue(response['evidence'])
        checkpoint=self.directory/'checkpoint'
        fit_model(('River otters swim. Willow trees grow. '*100),checkpoint,context_length=32,layers=1,heads=1,embedding_size=16,vocab_size=280,epochs=1,batch_size=8)
        loaded=self.client.post('/api/computer/checkpoint',json={'path':str(checkpoint)})
        self.assertEqual(loaded.status_code,200,loaded.text)
        response=self.client.post('/api/computer/chat',json={'message':'river otters'}).json()
        self.assertEqual(response['origin'],'local-model-candidate')
        self.assertEqual(response['routing']['mode'],'dual-equal-weight')
    def test_cross_origin_and_session_isolation(self):
        denied=self.client.post('/api/computer/study',json={'text':'Something'},headers={'origin':'https://unrelated.example'})
        self.assertEqual(denied.status_code,403)
        denied=self.client.get('/',headers={'host':'external.example'})
        self.assertEqual(denied.status_code,403)
        self.client.post('/api/computer/study',json={'text':'Pangolins collect quiet pebbles.'})
        with TestClient(self.app) as other:
            response=other.post('/api/computer/chat',json={'message':'pangolins pebbles'}).json()
            self.assertFalse(response['evidence'])
    def test_book_upload_is_studied_and_retrievable(self):
        response=self.client.post('/api/computer/books',files=[('files',('otters.txt',b'River otters shelter under willows.','text/plain'))])
        self.assertEqual(response.status_code,200,response.text)
        self.assertTrue(response.json()['books'][0]['ok'])
        result=self.client.post('/api/computer/chat',json={'message':'river otters shelter'}).json()
        self.assertTrue(any(row['source']=='uploaded:otters.txt' for row in result['evidence']))
        unsupported=self.client.post('/api/computer/books',files=[('files',('image.png',b'not text','image/png'))]).json()
        self.assertFalse(unsupported['books'][0]['ok'])
    def test_workspace_paths_are_restricted(self):
        self.assertEqual(self.client.post('/api/computer/file',json={'name':'../escape.txt','text':'no'}).status_code,400)
        self.assertEqual(self.client.post('/api/computer/file',json={'name':'example.html','text':'<h1>Preview</h1>'}).status_code,200)
if __name__=='__main__':unittest.main()
