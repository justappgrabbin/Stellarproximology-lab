import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile,ZipInfo
from fastapi.testclient import TestClient
from assembly.runtime import Assembly
from assembly.uploads import store_upload
from assembly.desktop_server import create_app

def archive(entries):
    buffer=io.BytesIO()
    with ZipFile(buffer,'w') as z:
        for name,content in entries:z.writestr(name,content)
    return buffer.getvalue()

class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.root=Path(self.temporary.name);self.runtime=Assembly(self.root/'memory')
    def tearDown(self):self.runtime.close();self.temporary.cleanup()
    def save(self,name,data):
        p=self.root/'incoming';p.write_bytes(data);return store_upload(self.runtime,name,p)
    def test_zip_source_reaches_retrieval_without_executing(self):
        receipt=self.save('project.zip',archive([('src/main.py','def count_otters(items):\n    return len(items)\n'),('README.md','River otter observation project.'),('danger.py','raise RuntimeError("must never execute")'),('icon.bin',b'\x00\xff\x02'),('.env','SECRET_SHOULD_NOT_BE_INDEXED=value')]))
        self.assertEqual(receipt['status'],'project-imported')
        self.assertEqual(len(receipt['entries']),5)
        self.assertTrue((Path(receipt['project_path'])/'src/main.py').is_file())
        self.assertTrue(any(r['source']=='uploaded:project.zip!/src/main.py' for r in self.runtime.retrieve('count_otters')))
        self.assertFalse(self.runtime.retrieve('SECRET_SHOULD_NOT_BE_INDEXED'))
        self.assertEqual(next(e for e in receipt['entries'] if e['path']=='icon.bin')['status'],'retained-binary')
    def test_slip_links_and_oversized_entries_are_not_extracted(self):
        for name in ('../../escape.py','/tmp/escape.py','C:/escape.py','folder\\escape.py'):
            result=self.save('bad.zip',archive([(name,'bad')]))
            self.assertEqual(result['status'],'stored-archive-not-expanded')
            self.assertIsNone(result['project_path'])
        info=ZipInfo('linked');info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16
        result=self.save('link.zip',archive([(info,'/tmp/target')]))
        self.assertEqual(result['status'],'stored-archive-not-expanded')
        with patch('assembly.uploads.MAX_ENTRY',8):
            result=self.save('large.zip',archive([('big.txt','a'*9)]))
        self.assertEqual(result['status'],'stored-archive-not-expanded')
    def test_duplicate_paths_are_retained_without_partial_extraction(self):
        result=self.save('duplicates.zip',archive([('same.txt','a'),('same.txt','b')]))
        self.assertEqual(result['status'],'stored-archive-not-expanded')
    def test_binary_receipt_filename_and_cross_user_download(self):
        app=create_app(directory=self.root/'app-data',mount_training=False)
        with TestClient(app) as client:
            raw=b'\x00\x01\xff\x02'
            result=client.post('/api/computer/books',files={'files':('receipt.json',raw,'application/octet-stream')}).json()['books'][0]
            self.assertTrue(result['ok']);self.assertEqual(result['entries'][0]['status'],'retained-binary')
            route='/api/computer/uploads/'+result['id']+'/original'
            self.assertEqual(client.get(route).content,raw)
            with TestClient(app) as other:self.assertEqual(other.get(route).status_code,404)
    def test_project_text_view_cannot_escape(self):
        app=create_app(directory=self.root/'app-data',mount_training=False)
        with TestClient(app) as client:
            raw=archive([('app/main.py','def greet(): return "hello"\n')])
            result=client.post('/api/computer/books',files={'files':('demo.zip',raw,'application/zip')}).json()['books'][0]
            route='/api/computer/uploads/'+result['id']+'/text'
            response=client.get(route,params={'name':'app/main.py'})
            self.assertEqual(response.status_code,200);self.assertIn('def greet',response.json()['text'])
            self.assertEqual(client.get(route,params={'name':'../../escape.py'}).status_code,400)
if __name__=='__main__':unittest.main()
