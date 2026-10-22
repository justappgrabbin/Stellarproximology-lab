import json
import os
from pathlib import Path
import gradio as gr
from .intake import read_document
from .research import research
from .patterns import observe,cycles
from .coding import CodingWorkspace,GitHubWriter

def add_assembly_ui(get_runtime,user,pasted_text,files):
    def runtime(request):return get_runtime(user(request))
    def study(text, uploads, request: gr.Request):
        r=runtime(request);receipts=[]
        if text.strip():receipts.append(r.study(text,title='Pasted source',source='user'))
        for f in uploads or []:
            p=Path(getattr(f,'name',None) or str(f));receipts.append(r.study(read_document(p),title=p.name,source='uploaded:'+p.name))
        return receipts
    def retrieve(query,request: gr.Request):return runtime(request).retrieve(query)
    def ask(message,request: gr.Request):
        result=runtime(request).respond(message)
        return result['answer'],result
    def load(path,request: gr.Request):return runtime(request).load_model(path)
    def feedback(message,tool,correction,rating,approved,request: gr.Request):
        return runtime(request).feedback(message,tool,correction,float(rating),approved)
    def do_research(query,providers,request: gr.Request):return research(runtime(request),query,providers)
    def tool_call(tool,inputs,request: gr.Request):return runtime(request).tool(tool,json.loads(inputs))
    def save_profile(value,request: gr.Request):
        data=json.loads(value)
        if not isinstance(data,dict):raise ValueError('Profile must be a JSON object')
        return runtime(request).setting('profile',data)
    def speech(text,time,request: gr.Request):return observe(runtime(request),text,time or None)
    def check_cycles(request: gr.Request):return cycles(runtime(request))
    def watcher(request: gr.Request):return runtime(request).watch()
    def code(action,name,content,request: gr.Request):
        r=runtime(request);workspace=CodingWorkspace(r.directory/'workspaces'/r.user)
        if action=='Read':return {'text':workspace.read(name)}
        if action=='Write':return workspace.write(name,content)
        if os.getenv('SPACE_ID') and os.getenv('MODELMAKER_ALLOW_CODE')!='1':raise ValueError('Code execution is disabled on hosted Spaces by default; use the local runtime')
        return workspace.run(name)
    def publish(repo,branch,names,title,request: gr.Request):
        r=runtime(request);workspace=CodingWorkspace(r.directory/'workspaces'/r.user)
        selected=[n.strip() for n in names.splitlines() if n.strip()]
        return GitHubWriter(repo).draft_pr(branch,{n:workspace.read(n) for n in selected},title)
    gr.Markdown('## Klein learning assembly\nStudy sources, inspect evidence, and test a local checkpoint. Tool proposals and model-generated wording remain reviewable.')
    with gr.Tab('Books and RAG'):
        study_button=gr.Button('Study the text and files above')
        study_result=gr.JSON(label='Source and tool receipts')
        study_button.click(study,[pasted_text,files],study_result,api_name='study_sources')
        query=gr.Textbox(label='Find supporting passages')
        find=gr.Button('Retrieve sources');matches=gr.JSON(label='Cited passages')
        find.click(retrieve,query,matches,api_name='retrieve_sources')
    with gr.Tab('Local model and feedback'):
        checkpoint=gr.Textbox(label='Existing local checkpoint directory')
        load_button=gr.Button('Load saved model');loaded=gr.JSON()
        load_button.click(load,checkpoint,loaded)
        message=gr.Textbox(label='Your request',lines=3)
        ask_button=gr.Button('Respond with model, retrieval and Klein analysis')
        answer=gr.Markdown();trace=gr.JSON(label='Evidence, routing and checks')
        ask_button.click(ask,message,[answer,trace],api_name='ask_assembly')
        gr.Markdown('Feedback informs tool selection immediately. Only reviewed, positive examples are included in the next weight-training run.')
        used_tool=gr.Textbox(label='Tool being evaluated',value='autoling')
        corrected=gr.Textbox(label='Reviewed answer or correction',lines=3)
        rating=gr.Slider(-1,1,value=0,step=.1,label='Did this meet your purpose?')
        approved=gr.Checkbox(label='I reviewed this example and approve it for later training',value=False)
        save=gr.Button('Record feedback');saved=gr.JSON()
        save.click(feedback,[message,used_tool,corrected,rating,approved],saved)
    with gr.Tab('Research'):
        question=gr.Textbox(label='Research question')
        providers=gr.CheckboxGroup(['local','arxiv','pubmed'],value=['local'],label='Sources to search')
        investigate=gr.Button('Investigate');research_result=gr.JSON(label='Sources and unresolved retrieval errors')
        investigate.click(do_research,[question,providers],research_result,api_name='research')
    with gr.Tab('Tool workbench'):
        selected=gr.Dropdown(['autoling-lite','diseminer-lite','klein-analogy','iching-grammar','language-contact','historical-monte-carlo','autonovel','messy','success','conversation','browser-form','research-browser','computational-grammar-coder','autoling','diseminer','morph-mir','outline-paraphraser','control-of-style','transformation-learner'],value='autoling',label='Existing Klein tool')
        inputs=gr.Code(value='{"operation":"stats"}',language='json',label='Tool arguments')
        run=gr.Button('Run selected tool');result=gr.JSON()
        run.click(tool_call,[selected,inputs],result,api_name='run_klein')
    with gr.Tab('Language patterns and watcher'):
        profile=gr.Code(value='{"design":{},"preferences":{},"goal":""}',language='json',label='User-provided design and preferences; treated as context, not proven predictions')
        store=gr.Button('Save personal context');profile_result=gr.JSON()
        store.click(save_profile,profile,profile_result)
        sample=gr.Textbox(label='Language sample you choose to record')
        when=gr.Textbox(label='Optional ISO timestamp with timezone')
        record=gr.Button('Record sample');sample_result=gr.JSON()
        record.click(speech,[sample,when],sample_result)
        analyze=gr.Button('Test recurring patterns');patterns=gr.JSON()
        analyze.click(check_cycles,None,patterns)
        check=gr.Button('Check local watcher');alerts=gr.JSON()
        check.click(watcher,None,alerts,api_name='watch')
    with gr.Tab('Coding and GitHub'):
        gr.Markdown('Work on explicitly selected files. Execution runs a local process with a timeout; it is not an OS security sandbox. Hosted execution is disabled by default.')
        action=gr.Radio(['Read','Write','Run'],value='Read',label='Action')
        filename=gr.Textbox(label='Workspace-relative filename',value='example.py')
        content=gr.Code(language='python',label='File contents')
        run=gr.Button('Perform selected coding action');result=gr.JSON()
        run.click(code,[action,filename,content],result,api_name=False)
        repo=gr.Textbox(label='GitHub owner/repository')
        branch=gr.Textbox(label='New branch',value='modelmaker/review')
        paths=gr.Textbox(label='Files to publish, one per line')
        title=gr.Textbox(label='Draft PR title')
        publish_button=gr.Button('Publish selected files to a new draft PR')
        published=gr.JSON()
        publish_button.click(publish,[repo,branch,paths,title],published,api_name=False)
