"""Optional dependency-installed test, run in a separate GitHub CI job."""
from pathlib import Path
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'local-learning'))
from train_local import train_trident,generate_trident
text=('Research observes evidence before making a claim. Code is tested before approval. ')*8
with tempfile.TemporaryDirectory() as d:
    output=Path(d)/'model'
    result=train_trident(text,output,Path(d)/'progress.json',epochs=1,head='research')
    assert result['training_loss']>0 and result['evaluation_loss']>0
    assert (output/'trident.pt').exists()
    result=generate_trident(output,'Research',max_new=8)
    assert isinstance(result,str)
print('SynthAI2 TRIDENT trained, evaluated, saved, reloaded, and generated locally on CPU.')
