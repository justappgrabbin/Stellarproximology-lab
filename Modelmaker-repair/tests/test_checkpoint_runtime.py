import tempfile
import unittest
from pathlib import Path
from assembly.runtime import Assembly
from assembly.training import fit_model
class CheckpointRuntimeTests(unittest.TestCase):
    def test_profiles_share_readonly_weights_but_keep_separate_memory(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);checkpoint=root/'checkpoint'
            fit_model('Otters swim beside willow trees. '*100,checkpoint,context_length=32,layers=1,heads=1,embedding_size=16,vocab_size=280,epochs=1,batch_size=8)
            first=Assembly(root/'state',user='alice');second=Assembly(root/'state',user='bob')
            try:
                first.load_model(checkpoint);second.load_model(checkpoint)
                self.assertIs(first.model,second.model)
                self.assertIs(first.model_lock,second.model_lock)
                first.setting('profile',{'goal':'private alice preference'})
                self.assertIsNone(second.setting('profile'))
                first.close()
                result=second.generate_text([{'role':'user','content':'Otters'}],max_new_tokens=4)
                self.assertGreater(result['generated_tokens'],0)
            finally:
                second.close()
if __name__=='__main__':unittest.main()
