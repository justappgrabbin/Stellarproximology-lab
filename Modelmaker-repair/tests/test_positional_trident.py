"""Tests train real native TRIDENT adapters; a passing file-read test is insufficient."""
import hashlib
import json
import math
import tempfile
import unittest
from pathlib import Path

import torch

from assembly.runtime import Assembly
from assembly.dimension_research import DimensionResearch
from assembly.positional_trident import SharedTridentPositions, KleinPositionAdapter, POSITIONS
from semantic_language_maker import NeuralMaker


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class OneBackboneFourPositions(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base_dir=self.root/'native-trident'
        self.owner=Assembly(self.root/'memory','test-owner')
        self.text='A river flows past the bridge. The observer records the river. '
        self.doc,_=self.owner.register(self.text,'One shared source','user-book')
        self.research=DimensionResearch(self.owner)
        self.research.configure_shared([{'dimension':p} for p in POSITIONS])
        observed=self.research.observe_all_klein(1)
        for position in POSITIONS:
            self.assertEqual(observed['results'][position]['attempts'][0]['state'],'processed')
            self.assertEqual(observed['results'][position]['coverage']['klein_passages_processed'],1)
        self.maker=NeuralMaker()
        trained=self.maker.fit([{'prompt':'What moves?','response':'The river flows.'}],steps=1,seed=13)
        self.assertEqual(trained['steps'],1)
        self.maker.save(self.base_dir)
        self.base_sha=digest(self.base_dir/'weights.pt')
        self.model=SharedTridentPositions(self.base_dir,workspace=self.root/'memory',assembly=self.owner)
        self.initial={p:{key:val.detach().clone() for key,val in self.model.adapters[p].state_dict().items()}
                      for p in POSITIONS}
        self.frozen={k:v.detach().clone() for k,v in self.model.base.state_dict().items()}

    def tearDown(self):
        self.owner.close()
        self.temp.cleanup()

    def row(self, position, prompt='Describe the observation', response='A river flows past the bridge.', **extra):
        return {'position':position,'approved':True,'source_id':self.doc,
                'source_quote':'A river flows past the bridge.',
                'prompt':prompt,'response':response,**extra}

    def test_training_one_position_does_not_train_other_three_or_base(self):
        held=[self.row('Movement',prompt='Which object moves?',response='The river.')]
        receipt=self.model.train('Movement',[self.row('Movement')],held,steps=2,seed=29)
        self.assertEqual(receipt['trained_position'],'Movement')
        self.assertEqual(receipt['optimizer_steps'],2)
        self.assertTrue(math.isfinite(receipt['heldout_after']))
        self.assertEqual(self.base_sha,digest(self.base_dir/'weights.pt'))
        self.assertEqual(self.model.base_steps,1)
        self.assertEqual(self.model.optimizer_steps['Movement'],2)
        self.assertTrue(any(not torch.equal(v,self.initial['Movement'][k])
                            for k,v in self.model.adapters['Movement'].state_dict().items()))
        for p in POSITIONS:
            if p=='Movement':continue
            self.assertEqual(self.model.optimizer_steps[p],0)
            self.assertIsNone(self.model.revisions[p])
            for key,v in self.model.adapters[p].state_dict().items():
                self.assertTrue(torch.equal(v,self.initial[p][key]),f'Other position changed: {p}/{key}')
        for k,v in self.model.base.state_dict().items():
            self.assertTrue(torch.equal(v,self.frozen[k]),f'Frozen backbone changed: {k}')
        reloaded=SharedTridentPositions(self.base_dir,workspace=self.root/'memory',assembly=self.owner)
        self.assertIs(self.model.base,reloaded.base,'Shared TRIDENT unexpectedly loaded duplicate backbone weights')
        self.assertEqual(reloaded.revisions['Movement'],receipt['revision'])
        for k,v in self.model.adapters['Movement'].state_dict().items():
            self.assertTrue(torch.equal(v,reloaded.adapters['Movement'].state_dict()[k]))
        self.assertTrue(reloaded.generate('Movement','What moves?',max_new_bytes=3)['trained_adapter'])
        with self.assertRaisesRegex(ValueError,'not trained'):
            reloaded.generate('Evolution','What moves?')

    def test_second_position_learns_without_changing_first(self):
        self.model.train('Movement',[self.row('Movement')],[self.row('Movement','What moves?','River.')],steps=1)
        snap={k:v.detach().clone() for k,v in self.model.adapters['Movement'].state_dict().items()}
        first=self.model.revisions['Movement']
        receipt=self.model.train('Evolution',[self.row('Evolution',response='The river changes.')],
                                 [self.row('Evolution','What changes?','The moving river.')],steps=1)
        self.assertEqual(receipt['trained_position'],'Evolution')
        self.assertEqual(self.model.revisions['Movement'],first)
        for k,v in self.model.adapters['Movement'].state_dict().items():
            self.assertTrue(torch.equal(v,snap[k]),f'Movement changed while Evolution trained: {k}')
        self.assertEqual(self.base_sha,digest(self.base_dir/'weights.pt'))
        self.assertNotEqual(self.model.revisions['Movement'],self.model.revisions['Evolution'])
        reloaded=SharedTridentPositions(self.base_dir,workspace=self.root/'memory',assembly=self.owner)
        self.assertEqual(reloaded.optimizer_steps['Movement'],1)
        self.assertEqual(reloaded.optimizer_steps['Evolution'],1)

    def test_all_four_positions_learn_separately_over_same_shared_source(self):
        training_targets={
            'Movement':'The river flows along the bridge.',
            'Evolution':'The river can change as the water rises.',
            'Being':'The observer and river are present together.',
            'Design':'The bridge structures the observation point.'
        }
        for position in POSITIONS:
            self.model.train(position,[self.row(position,'What does this source show?',training_targets[position])],
                             [self.row(position,'What was observed?', 'The river was observed.')],steps=1)
        for position in POSITIONS:
            self.assertEqual(self.model.optimizer_steps[position],1)
            self.assertIsNotNone(self.model.revisions[position])
            changed = any(not torch.equal(value,self.initial[position][key])
                          for key,value in self.model.adapters[position].state_dict().items())
            self.assertTrue(changed,f'No learned positional parameters: {position}')
        fingerprints={p:hashlib.sha256(
            self.model.adapters[p].bias.detach().cpu().numpy().tobytes()).hexdigest()
            for p in POSITIONS}
        self.assertGreater(len(set(fingerprints.values())),1,'Four positions never diverged')
        self.assertEqual(self.base_sha,digest(self.base_dir/'weights.pt'))
        loaded=SharedTridentPositions(self.base_dir,workspace=self.root/'memory',assembly=self.owner)
        self.assertTrue(all(loaded.revisions[p]==self.model.revisions[p] for p in POSITIONS))
        for p in POSITIONS:
            for k,t in self.model.adapters[p].state_dict().items():
                self.assertTrue(torch.equal(t,loaded.adapters[p].state_dict()[k]))

    def test_reject_unapproved_unanchored_or_overlap(self):
        row=self.row('Design')
        hold=self.row('Design','What happens?','The river moves.')
        bad=dict(row,approved=False)
        with self.assertRaisesRegex(ValueError,'owner-approved'):
            self.model.train('Design',[bad],[hold])
        bad=dict(row,source_quote='Invented claim')
        with self.assertRaisesRegex(ValueError,'quotation'):
            self.model.train('Design',[bad],[hold])
        with self.assertRaisesRegex(ValueError,'overlap'):
            self.model.train('Design',[row],[row])
        with self.assertRaisesRegex(ValueError,'position'):
            self.model.train('Being',[row],[hold])
        with self.assertRaisesRegex(ValueError,'Klein measurements'):
            self.model.train('Design',[dict(row,klein=[[0]])],[hold])
        self.assertTrue(all(self.model.revisions[p] is None for p in POSITIONS))
        self.assertEqual(self.base_sha,digest(self.base_dir/'weights.pt'))

    def test_missing_real_klein_receipt_blocks_training(self):
        self.owner.db.execute("""DELETE FROM dimension_klein_observations
            WHERE user=? AND dimension=? AND document_id=?""",
            (self.owner.user,'Design',self.doc))
        self.owner.db.commit()
        with self.assertRaisesRegex(ValueError,'accepted native Klein analysis'):
            self.model.train('Design',[self.row('Design')],
                             [self.row('Design','What changes?','The river.')],steps=1)
        self.assertIsNone(self.model.revisions['Design'])
        self.assertEqual(self.base_sha,digest(self.base_dir/'weights.pt'))

    def test_valid_features_and_native_dimensions(self):
        adaptor=KleinPositionAdapter()
        result=adaptor(torch.zeros(1,8,32))
        self.assertEqual(tuple(result.shape),(1,8,32))
        with self.assertRaisesRegex(ValueError,'Klein conditioning'):
            adaptor(torch.zeros(1,32))
        self.assertEqual(set(self.model.status()['positions']),set(POSITIONS))
        self.assertGreater(self.model.status()['base_parameters'],self.model.status()['positions']['Movement']['learned_parameters'])

    def test_fail_closed_on_nontrident_or_untrained_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            (path/'config.json').write_text('{"format":"not-trident","codec":"lossless-utf8-byte-v1","steps":1}')
            (path/'weights.pt').write_bytes(b'garbage')
            with self.assertRaisesRegex(ValueError,'native SYNTHIA/TRIDENT'):
                SharedTridentPositions(path,workspace=self.root/'memory',assembly=self.owner)


if __name__=='__main__':
    unittest.main()
