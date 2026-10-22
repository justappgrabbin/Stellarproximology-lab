import tempfile
import unittest
from pathlib import Path
import torch
from transformers import GPT2Config,GPT2LMHeadModel
from assembly.training import causal_loss,fit_model

class TrainingTests(unittest.TestCase):
    def test_exactly_one_target_shift(self):
        torch.manual_seed(1)
        model=GPT2LMHeadModel(GPT2Config(vocab_size=20,n_positions=8,n_embd=16,n_layer=1,n_head=2)).eval()
        ids=torch.tensor([[1,2,3,4,5,6,7,8]])
        actual=causal_loss(model,ids)
        logits=model(ids).logits
        expected=torch.nn.functional.cross_entropy(logits[:,:-1].reshape(-1,20),ids[:,1:].reshape(-1))
        self.assertTrue(torch.allclose(actual,expected))
        wrong=model(input_ids=ids[:,:-1],labels=ids[:,1:]).loss
        self.assertFalse(torch.allclose(actual,wrong))
    def test_real_cpu_weight_updates_and_reload(self):
        with tempfile.TemporaryDirectory() as temp:
            result=fit_model(('memory learns structure. structure informs movement. '*100),temp,
                vocab_size=300,context_length=16,layers=1,heads=2,embedding_size=32,epochs=3,batch_size=8,learning_rate=.005)
            self.assertEqual(result['device'],'cpu')
            self.assertGreater(result['embedding_update_norm'],0)
            self.assertLess(result['final_loss'],result['initial_loss'])
            self.assertTrue(result['reload_verified'])
            self.assertIsNotNone(result['validation_loss'])
            self.assertTrue((Path(temp)/'model.safetensors').exists())
            again=fit_model(('memory learns another structure. '*60),Path(temp)/'continued',
                context_length=16,layers=1,heads=2,embedding_size=32,epochs=1,batch_size=8,
                learning_rate=.001,base_checkpoint=temp)
            self.assertEqual(again['base_checkpoint'],temp)
            self.assertTrue(again['reload_verified'])
    def test_invalid_shape_and_rate_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            for kwargs in [{'learning_rate':float('nan')},{'embedding_size':33,'heads':2},{'epochs':0}]:
                with self.assertRaises(ValueError):fit_model('meaning '*100,temp,**kwargs)
