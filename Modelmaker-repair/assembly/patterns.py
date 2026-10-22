"""Prospective within-person cycle tests; no chart-to-language assumptions."""
import json
import math
from datetime import datetime,timezone
from uuid import uuid4
import numpy as np
from .runtime import terms

def observe(runtime,utterance,timestamp=None):
    profile=runtime.setting('profile') or {}
    when=datetime.fromisoformat(timestamp) if timestamp else datetime.now(timezone.utc)
    if when.tzinfo is None:raise ValueError('Observation time requires a timezone')
    words=terms(utterance)
    features={'word_count':len(words),'mean_word_length':sum(map(len,words))/max(1,len(words)),
        'type_token_ratio':len(set(words))/max(1,len(words)),'questions':utterance.count('?')}
    with runtime.db:runtime.db.execute('INSERT INTO speech VALUES(?,?,?,?,?,?)',
        (uuid4().hex,runtime.user,utterance,when.isoformat(),json.dumps(profile.get('design')),json.dumps(features)))
    return {'features':features,'time':when.isoformat(),'design_source':'user-provided','status':'observation-not-a-design-prediction'}

def cycles(runtime):
    rows=runtime.db.execute('SELECT created,features FROM speech WHERE user=? ORDER BY created',(runtime.user,)).fetchall()
    data=sorted([(datetime.fromisoformat(r[0]).timestamp()/3600,json.loads(r[1])) for r in rows],key=lambda x:x[0])
    if len(data)<20:return {'status':'insufficient-data','observations':len(data),'design_association':'not-established','candidates':[]}
    x=np.array([r[0] for r in data]);split=int(len(x)*.8)
    candidates=[]
    for period in [24,168]:
        if x[-1]-x[0]<2*period:continue
        phase=(x-x[0])*2*math.pi/period
        basis=np.column_stack([np.ones(len(x)),np.sin(phase),np.cos(phase)])
        for feature in data[0][1]:
            y=np.array([r[1][feature] for r in data]);coef=np.linalg.lstsq(basis[:split],y[:split],rcond=None)[0]
            predicted=basis[split:]@coef
            baseline=np.mean((y[split:]-y[:split].mean())**2)
            error=np.mean((y[split:]-predicted)**2)
            improvement=1-error/baseline if baseline>0 else 0
            candidates.append({'feature':feature,'period_hours':period,'heldout_improvement':float(improvement),
                'amplitude':float(np.linalg.norm(coef[1:])),'status':'candidate-for-future-replication' if improvement>.1 else 'not-supported-on-holdout'})
    return {'status':'evaluated','observations':len(data),'training_samples':split,'heldout_samples':len(data)-split,
        'candidates':candidates,'design_association':'not-established',
        'policy':'within-person exploratory association with chronological holdout; not causal, diagnostic or cross-design validation'}
