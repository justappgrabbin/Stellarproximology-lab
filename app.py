"""Trident Modelmaker. Gradio UI for real PyTorch training with revisioned weights."""
import json
import os
import gradio as gr
from training_core import (model_status,train_uploaded,evaluate_uploaded,sample,checkpoint_bundle)


def _owner(profile: gr.OAuthProfile | None):
    # On Hugging Face enforce authenticated owner for ALL operations.
    # Gradio's LoginButton alone DOES NOT restrict access.
    if os.environ.get('SPACE_ID') and (profile is None or profile.username != 'stellarproximology'):
        raise PermissionError('Sign in as the owner of this Space to inspect, train, export or sample its models.')


def _safe(fn,*args,profile: gr.OAuthProfile | None=None):
    try:
        _owner(profile)
        return json.dumps(fn(*args),ensure_ascii=False,indent=2)
    except Exception as e:return json.dumps({'error':str(e)},ensure_ascii=False,indent=2)

with gr.Blocks(title='Trident Modelmaker') as app:
    if os.environ.get('SPACE_ID'):
        gr.LoginButton('Sign in with Hugging Face (owner only)')
    gr.Markdown('''# Trident Modelmaker
**Train actual PyTorch TRIDENT weights.** This builds on the original Synthia-Neural source and saves a new checkpoint revision after every successful run. **No fluent pretrained model is supplied.** Training on five examples demonstrates mechanics, not language competence.

Your hosted Hugging Face Modelmaker Space starts with no app. This package supplies the runnable application. **Uploaded data is processed on the Space host**; don't upload personal or proprietary conversations unless that is appropriate for your deployment. On free Spaces, files can be lost after a restart. Export your checkpoint after each useful run.''')
    with gr.Tab('Train weights'):
        corpus=gr.File(label='Approved prompt/response JSONL corpus',file_types=['.jsonl'],type='filepath')
        heldout=gr.File(label='Separate held-out JSONL corpus (optional; must not overlap training)',file_types=['.jsonl'],type='filepath')
        with gr.Row():
            variant=gr.Dropdown(list({'Portable · 260-byte vocabulary':1,'Original-size · 4096-token vocabulary':1}),value='Portable · 260-byte vocabulary',label='Architecture')
            steps=gr.Slider(minimum=1,maximum=500,value=10,step=1,label='Optimizer steps')
        approve=gr.Checkbox(label='I have reviewed and approved these examples for training; I understand the privacy implications.',value=False)
        train_button=gr.Button('Train and preserve new weight revision',variant='primary')
        train_result=gr.Code(label='Training receipt',language='json')
        def guarded_train(a,b,c,d,e, profile: gr.OAuthProfile | None):
            return _safe(train_uploaded,a,b,c,d,e,profile=profile)
        train_button.click(guarded_train,inputs=[corpus,heldout,variant,steps,approve],outputs=train_result,concurrency_limit=1)
    with gr.Tab('Inspect and evaluate'):
        refresh=gr.Button('Inspect saved checkpoint')
        status=gr.Code(label='Model status',language='json',value='{}')
        def guarded_status(profile: gr.OAuthProfile | None):
            return _safe(model_status,profile=profile)
        refresh.click(guarded_status,outputs=status)
        eval_file=gr.File(label='Held-out JSONL',file_types=['.jsonl'],type='filepath')
        eval_btn=gr.Button('Measure answer-token loss on held-out examples')
        eval_result=gr.Code(label='Evaluation receipt',language='json')
        def guarded_eval(p,profile: gr.OAuthProfile | None):
            return _safe(evaluate_uploaded,p,profile=profile)
        eval_btn.click(guarded_eval,inputs=eval_file,outputs=eval_result)
    with gr.Tab('Sample model'):
        prompt=gr.Textbox(label='Prompt',lines=3)
        head=gr.Dropdown(['research','math','code'],value='research',label='Specialist head')
        with gr.Row():
            length=gr.Slider(1,256,value=72,step=1,label='Maximum output bytes')
            seed=gr.Number(label='Reproducible seed',value=11,precision=0)
        btn=gr.Button('Generate from current trained weights')
        output=gr.Code(language='json',label='Unverified neural continuation')
        def guarded_sample(a,b,c,d,profile: gr.OAuthProfile | None):
            return _safe(sample,a,b,c,d,profile=profile)
        btn.click(guarded_sample,inputs=[prompt,head,length,seed],outputs=output)
    with gr.Tab('Export weights'):
        gr.Markdown('Each training session creates a new immutable revision, and the previous revision remains available on disk. Download weights before Space restarts if you have no persistent storage. The original Hugging Face 3-head model and the locally extended Klein TRIDENT differ; **do not overwrite one with a checkpoint from the other**.')
        export=gr.Button('Create downloadable checkpoint ZIP')
        file=gr.File(label='Checkpoint and training evidence')
        def guarded_export(profile: gr.OAuthProfile | None):
            _owner(profile)
            return checkpoint_bundle()
        export.click(guarded_export,outputs=file)

if __name__=='__main__':
    app.launch()