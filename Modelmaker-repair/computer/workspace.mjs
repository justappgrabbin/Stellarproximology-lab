const $=id=>document.getElementById(id);
let history=[];
async function api(path,data){const response=await fetch('/api/computer/'+path,{credentials:'same-origin',...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});if(!response.ok)throw Error((await response.text()).slice(0,1500));return response.json();}
function showResult(id,result){$(id).textContent=typeof result==='string'?result:JSON.stringify(result,null,2);}
async function job(button,fn,error='status'){button.disabled=true;try{return await fn();}catch(e){showResult(error,e.message);}finally{button.disabled=false;}}
function renderAnswer(target,text){
 const fenced=/```([a-zA-Z0-9_+.-]*)\s*\n([\s\S]*?)```/g;let position=0;
 for(const match of String(text).matchAll(fenced)){
  if(match.index>position)target.append(document.createTextNode(text.slice(position,match.index)));
  const box=document.createElement('div'),header=document.createElement('div'),label=document.createElement('span'),copy=document.createElement('button'),pre=document.createElement('pre'),code=document.createElement('code');
  box.className='codebox';header.className='codebox-header';label.textContent=match[1]||'Code';copy.textContent='Copy';copy.type='button';code.textContent=match[2].replace(/\n$/,'');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(code.textContent);copy.textContent='Copied';}catch{copy.textContent='Select code to copy';}};
  pre.append(code);header.append(label,copy);box.append(header,pre);target.append(box);position=match.index+match[0].length;
 }
 if(position<text.length)target.append(document.createTextNode(text.slice(position)));
}
function message(role,text,trace){const article=document.createElement('article');article.className='message '+role;const who=document.createElement('div');who.className='who';who.textContent=role==='user'?'You':'Modelmaker';const content=document.createElement('div');if(role==='assistant')renderAnswer(content,text);else content.textContent=text;article.append(who,content);if(trace){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent=trace.origin==='local-model-candidate'?'Model response · inspect evidence':'Source excerpts · no model loaded';pre.textContent=JSON.stringify({origin:trace.origin,evidence:trace.evidence,routing:trace.routing,generation:trace.generation,evaluation:trace.evaluation},null,2);details.append(summary,pre);article.append(details);}const welcome=$('messages').querySelector('.welcome');if(welcome)welcome.remove();$('messages').append(article);$('messages').scrollTop=$('messages').scrollHeight;}
$('chat-form').onsubmit=e=>{e.preventDefault();const text=$('message').value.trim();if(!text)return;message('user',text);$('message').value='';job($('send'),async()=>{const result=await api('chat',{message:text,history});message('assistant',result.answer,result);history.push({role:'user',text},{role:'assistant',text:result.answer});history=history.slice(-12);});};
$('new-chat').onclick=()=>{history=[];$('messages').replaceChildren();$('message').focus();};
$('checkpoint-form').onsubmit=e=>{e.preventDefault();job(e.submitter,async()=>{await api('checkpoint',{path:$('checkpoint').value});showResult('status','Local CPU model loaded · Klein tools connected');});};
$('workspace-tab').onclick=()=>{$('workspace').hidden=false;$('toolbox').hidden=true;$('workspace-tab').classList.add('active');$('klein-tab').classList.remove('active');};
$('klein-tab').onclick=()=>{$('workspace').hidden=true;$('toolbox').hidden=false;$('klein-tab').classList.add('active');$('workspace-tab').classList.remove('active');};
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b===button);$('tab-'+b.dataset.tab).hidden=b!==button;});});
$('save-preview').onclick=()=>job($('save-preview'),async()=>{await api('file',{name:$('filename').value,text:$('source').value});$('preview').srcdoc=$('source').value;showResult('preview-status','Saved in your workspace and running in preview.');},'preview-status');
async function hand(tool,input={}){return api('hand',{tool,arguments:input});}
function browserResult(result){if(result.screenshot){$('browser-screen').src=result.screenshot;$('browser-screen').hidden=false;}showResult('browser-result',result.page??result);showResult('browser-status',result.status??(result.ok===false?'Action did not complete':'Ready'));return result;}
$('browser-form').onsubmit=e=>{e.preventDefault();job(e.submitter,async()=>browserResult(await hand('browser.open',{url:$('browser-url').value})),'browser-status');};
document.querySelectorAll('[data-hand]').forEach(b=>b.onclick=()=>job(b,async()=>browserResult(await hand(b.dataset.hand)),'browser-status'));
$('click-form').onsubmit=e=>{e.preventDefault();job(e.submitter,async()=>browserResult(await hand('browser.click',{text:$('click-text').value})),'browser-status');};
$('fill-form').onclick=()=>job($('fill-form'),async()=>browserResult(await hand('browser.fill',{values:JSON.parse($('browser-values').value)})),'browser-status');
$('submit-form').onclick=()=>job($('submit-form'),async()=>{if(confirm('Submit the prepared form to this website?'))browserResult(await hand('browser.submit',{confirmed:true}));},'browser-status');
$('terminal-form').onsubmit=e=>{e.preventDefault();job(e.submitter,async()=>{const result=await hand('terminal.exec',{command:$('command').value});showResult('terminal-result',`Exit ${result.code}\n${result.stdout}\n${result.stderr}`);},'terminal-result');};
$('emulate').onclick=()=>job($('emulate'),async()=>{const result=await hand('browser.preview',{html:$('source').value,width:Number($('device-size').value),height:800});if(result.screenshot){$('emulator-screen').src=result.screenshot;$('emulator-screen').hidden=false;}showResult('emulator-result',result.page??result);},'emulator-result');
$('check-android').onclick=()=>job($('check-android'),async()=>showResult('android-status',await hand('android.status')),'android-status');
$('android-form').onsubmit=e=>{e.preventDefault();job(e.submitter,async()=>showResult('android-status',await hand('android.command',{command:$('android-command').value})),'android-status');};
$('study').onclick=()=>job($('study'),async()=>showResult('tool-result',await api('study',{text:$('book-text').value,title:'Workspace source'})),'tool-result');
$('run-tool').onclick=()=>job($('run-tool'),async()=>showResult('tool-result',await api('tool',{tool:$('tool').value,arguments:JSON.parse($('arguments').value)})),'tool-result');
$('watch').onclick=()=>job($('watch'),async()=>showResult('tool-result',await api('watch')),'tool-result');
try{const status=await api('status');showResult('status',status.model_loaded?'Local CPU model loaded · Klein tools connected':'Klein tools connected · load a checkpoint for model inference');if(status.checkpoint)$('checkpoint').value=status.checkpoint;showResult('terminal-result',status.terminal_enabled?'Linux computer ready.':'Start the Linux container to use terminal commands.');for(const tool of await api('tools')){const option=document.createElement('option');option.value=tool.id;option.textContent=tool.id;$('tool').append(option);}globalThis.ModelmakerWorkspace={api,hand,status};}catch(e){showResult('status',e.message);}
// Private-chat books and reviewable self-editing.
function view(id){for(const name of ['workspace','toolbox','trident-team','self-editor'])$(name).hidden=name!==id;for(const[name,target]of [['workspace-tab','workspace'],['klein-tab','toolbox'],['trident-tab','trident-team'],['edit-tab','self-editor']])$(name).classList.toggle('active',id===target);}
$('workspace-tab').onclick=()=>view('workspace');$('klein-tab').onclick=()=>view('toolbox');$('edit-tab').onclick=()=>view('self-editor');$('trident-tab').onclick=()=>view('trident-team');
$('books-form').onsubmit=e=>{e.preventDefault();job($('upload-books'),async()=>{const form=new FormData();for(const file of $('books').files)form.append('files',file);showResult('books-result','Importing files and studying supported content…');const response=await fetch('/api/computer/books',{method:'POST',body:form,credentials:'same-origin'});if(!response.ok)throw Error(await response.text());const result=await response.json();$('books-result').replaceChildren();for(const book of result.books){const line=document.createElement('p');line.textContent=book.ok?book.file+' · '+(book.status==='project-imported'?'project imported · '+book.entries.length+' files':book.entries?.[0]?.status==='studied'?'text studied':book.status)+' · '+(book.analysis==='studied'?'ready for retrieval':book.analysis==='partial'?'some content retained without analysis':book.error??'original retained'):book.file+': '+book.error;$('books-result').append(line);}const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Study details';pre.textContent=JSON.stringify(result,null,2);details.append(summary,pre);$('books-result').append(details);},'books-result');};
let editHash=null,editName=null,proposalId=null;
function proposal(value){proposalId=value.id;showResult('edit-diff',value.diff);$('edit-apply').disabled=false;showResult('edit-result','Review the diff, then apply if it reflects your requested change.');}
$('edit-load').onclick=()=>job($('edit-load'),async()=>{const state=await api('edit/file?name='+encodeURIComponent($('edit-file').value));$('edit-source').value=state.text;editHash=state.sha256;editName=state.file;proposalId=null;$('edit-apply').disabled=true;showResult('edit-result','Source loaded.');},'edit-result');
$('edit-propose').onclick=()=>job($('edit-propose'),async()=>{if(!editHash||editName!==$('edit-file').value)throw Error('Load the selected file first');proposal(await api('edit/propose',{file:editName,replacement:$('edit-source').value,before_sha256:editHash}));},'edit-result');
$('edit-generate').onclick=()=>job($('edit-generate'),async()=>{if(!editHash||editName!==$('edit-file').value)throw Error('Load the selected file first');showResult('edit-result','Asking the loaded model for a source edit…');const value=await api('edit/generate',{file:editName,instruction:$('edit-instruction').value});$('edit-source').value=value.after;proposal(value);},'edit-result');
$('edit-source').oninput=()=>{proposalId=null;$('edit-apply').disabled=true;};
$('edit-apply').onclick=()=>job($('edit-apply'),async()=>{if(!proposalId)throw Error('Preview a diff first');showResult('edit-result','Applying reviewed edit and checking the project…');const result=await api('edit/apply',{id:proposalId});showResult('edit-result',result);proposalId=null;editHash=null;},'edit-result');
try{for(const name of await api('edit/files')){const option=document.createElement('option');option.value=name;option.textContent=name;$('edit-file').append(option);}}catch(e){showResult('edit-result',e.message);}
$('install-coder').onclick=()=>job($('install-coder'),async()=>{let state=await api('coding/install',{});showResult('status','Installing the coding model locally. Initial download is about 1 GB.');while(['downloading','loading'].includes(state.status)){await new Promise(resolve=>setTimeout(resolve,2000));state=await api('coding/status');showResult('status',state.status==='loading'?'Loading coding weights on CPU…':'Downloading coding model…');}if(state.status!=='ready')throw Error(state.error??'Checkpoint installation did not complete');$('checkpoint').value=state.path;showResult('status','Qwen coding model loaded on CPU · Klein tools connected');});
$('uploaded-files').onclick=()=>job($('uploaded-files'),async()=>{const files=await api('uploads');$('uploads-list').replaceChildren();for(const upload of files){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=upload.file+' · '+upload.status;details.append(summary);const download=document.createElement('a');download.href='/api/computer/uploads/'+upload.id+'/original';download.textContent='Download original';download.setAttribute('download','');details.append(download);for(const entry of upload.entries??[]){const row=document.createElement('div');row.className='upload-entry';const label=document.createElement('span');const labels={'studied':'Text studied','indexed-awaiting-study':'Text available · study pending','retained-binary':'File stored · no text analysis','retained-not-indexed':'File stored · not indexed','retained-not-expanded':'Archive stored','retained-analysis-unavailable':'File stored · analysis unavailable'};label.textContent=entry.path+' · '+(labels[entry.status]??entry.status);row.append(label);if(['studied','indexed-awaiting-study'].includes(entry.status)){const button=document.createElement('button');button.textContent='View text';button.onclick=()=>job(button,async()=>{const result=await api('uploads/'+upload.id+'/text?name='+encodeURIComponent(entry.path));$('uploaded-preview').hidden=false;showResult('uploaded-preview',result.text);},'books-result');row.append(button);}details.append(row);}$('uploads-list').append(details);}if(!files.length)showResult('uploads-list','No uploaded files in this browser profile yet.');},'books-result');

function jsonlRecords(value){
 const lines=value.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length)throw Error('Paste reviewed, owner-approved JSONL records and a separate held-out set.');
 return lines.map((line,index)=>{try{return JSON.parse(line);}catch(e){throw Error('Invalid JSONL at line '+(index+1)+': '+e.message);}});
}
function requiredBase(){
 const path=$('trident-base').value.trim();
 if(!path)throw Error('Choose a real trained native TRIDENT checkpoint directory; no dummy weights are supplied.');
 return path;
}
$('team-configure').onclick=()=>job($('team-configure'),async()=>{
 const manifest=JSON.parse($('team-config').value);
 showResult('team-source-status',await api('research-team/configure',manifest));
},'team-source-status');
$('team-klein').onclick=()=>job($('team-klein'),async()=>{
 showResult('team-source-status',await api('research-team/klein-all',{max_passages_per_position:5}));
},'team-source-status');
$('trident-status').onclick=()=>job($('trident-status'),async()=>{
 showResult('trident-base-status',await api('research-team/trident/status?base_checkpoint='+encodeURIComponent(requiredBase())));
},'trident-base-status');
$('trident-train-button').onclick=()=>job($('trident-train-button'),async()=>{
 const payload={base_checkpoint:requiredBase(),dimension:$('trident-position').value,
    examples:jsonlRecords($('trident-train').value),heldout:jsonlRecords($('trident-heldout').value),
    steps:Number($('trident-steps').value)};
 showResult('trident-train-result',await api('research-team/trident/train',payload));
},'trident-train-result');
$('trident-compare').onclick=()=>job($('trident-compare'),async()=>{
 const prompt=$('trident-prompt').value.trim();
 if(!prompt)throw Error('Enter a question to compare across the four positions.');
 showResult('trident-compare-result',await api('research-team/trident/compare',
     {base_checkpoint:requiredBase(),prompt,max_new_bytes:64}));
},'trident-compare-result');
