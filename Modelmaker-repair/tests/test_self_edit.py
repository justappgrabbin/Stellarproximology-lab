import tempfile
import unittest
from pathlib import Path
from assembly.runtime import Assembly
from assembly.self_edit import propose,apply,file_state
class EditTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);(self.root/'app.py').write_text('value = 1\n');self.runtime=Assembly(self.root/'memory')
    def tearDown(self):self.runtime.close();self.temp.cleanup()
    def test_reviewed_edit_and_stale_protection(self):
        item=propose(self.runtime,'app.py','value = 2\n',self.root)
        self.assertEqual((self.root/'app.py').read_text(),'value = 1\n')
        self.assertIn('+value = 2',item['diff'])
        result=apply(self.runtime,item['id'],self.root,run_tests=False)
        self.assertEqual(result['status'],'applied');self.assertEqual((self.root/'app.py').read_text(),'value = 2\n')
        next_item=propose(self.runtime,'app.py','value = 3\n',self.root)
        (self.root/'app.py').write_text('value = 99\n')
        with self.assertRaises(ValueError):apply(self.runtime,next_item['id'],self.root,run_tests=False)
        self.assertEqual((self.root/'app.py').read_text(),'value = 99\n')
    def test_failed_checks_restore_original(self):
        (self.root/'tests').mkdir();(self.root/'tests/test_failure.py').write_text('import unittest\nclass Test(unittest.TestCase):\n def test_fail(self): self.fail("deliberate check failure")\n')
        item=propose(self.runtime,'app.py','value = 2\n',self.root)
        result=apply(self.runtime,item['id'],self.root)
        self.assertEqual(result['status'],'rolled-back');self.assertEqual((self.root/'app.py').read_text(),'value = 1\n')
    def test_invalid_syntax_and_outside_paths_leave_files_unchanged(self):
        item=propose(self.runtime,'app.py','def broken(\n',self.root)
        with self.assertRaises(SyntaxError):apply(self.runtime,item['id'],self.root,run_tests=False)
        self.assertEqual((self.root/'app.py').read_text(),'value = 1\n')
        with self.assertRaises(ValueError):file_state('../escape.py',self.root)
        (self.root/'vendor').mkdir();(self.root/'vendor/tool.py').write_text('untouched=True')
        with self.assertRaises(ValueError):file_state('assembly/../vendor/tool.py',self.root)
if __name__=='__main__':unittest.main()
