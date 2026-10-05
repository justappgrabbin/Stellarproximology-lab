import {NAMES,runCycle,offlineCandidate,sandbox} from './engine.js';
const $=id=>document.getElementById(id);
const profiles=await (await fetch('profiles.json')).json();
const native=window.StellarNative;
const KEY='stellar-living-lab-v1';
let state;
try {state=JSON.parse(localStorage.getItem(KEY))} catch (_) {}
state=state||{units:[],capabilities:[],observations:[],journals:[],endpoint:'',queue:[]};
let busy=false,controller,sessionJobs=0,zoom=1,yaw=0;
const persist=()=>{if(!native)try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){$('notice').textContent='Local storage is full. Export your memory.'}};
function text(tag,value,className){const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node}
function render(){
  $('unit-count').textContent=state.units.length;$('capability-count').textContent=state.capabilities.length;$('memory-count').textContent=state.observations.length;
  $('worker-status').textContent=busy?'Working':state.running?'Local service active':'Ready';
  if(native)$('stop').hidden=!state.running;
  $('connection').textContent=native?'On-device':state.endpoint?'Connected':'Local';
  $('perspectives').replaceChildren();
  const latest=state.journals.at(-1),round=latest?.rounds?.at(-1);
  for(const name of NAMES){const card=text('div','','perspective');card.append(text('b',name),text('small',profiles.dimensions[name].human_view),text('small',round?.perspectives?.[name]?.status||'Own perspective'));$('perspectives').append(card)}
  $('journal').replaceChildren();
  for(const journal of state.journals.slice(-5).reverse()){
    const item=text('div','','event');item.append(text('b',journal.goal||journal.kind||'Observation'),text('p',`${journal.mode||'local'} · ${journal.status||'recorded'}`));
    if(journal.error)item.append(text('p',journal.error));
    for(const source of journal.sources||[]){if(source.url?.startsWith('https://')){const a=text('a',source.title||source.url);a.href=source.url;a.target='_blank';a.rel='noopener';item.append(a,document.createElement('br'))}}
    const r=journal.rounds?.at(-1);
    for(const name of NAMES){const slot=r?.perspectives?.[name];if(slot){item.append(text('p',`${name}: ${slot.status}`));if(slot.hypothesis)item.append(text('p',slot.hypothesis.hypothesis));if(slot.error)item.append(text('p',slot.error))}}
    $('journal').append(item);
  }
  if(!state.journals.length)$('journal').append(text('p','Research, hypotheses, tests and disagreements will appear here.','hint'));
}
async function refreshNative(){if(!native)return;try{const data=JSON.parse(native.snapshot());state={...state,...data};render()}catch(e){$('notice').textContent=e.message}}
async function run(goal,demo=false){
  if(busy)return;busy=true;controller=new AbortController();$('start').disabled=true;$('demo').disabled=true;$('stop').hidden=false;
  const index=state.journals.length;
  try{
    const result=await runCycle({goal,profiles,endpoint:state.endpoint,access:$('access').value,demo,signal:controller.signal,observations:state.observations.slice(-20),
      onProgress:journal=>{state.journals[index]=journal;persist();render()}});
    if(result.status==='verified'){state.units=result.units;state.capabilities.push(...result.capabilities);state.capabilities=state.capabilities.slice(-32);
      $('notice').textContent=demo?'Offline demo verified 256 units. No live LLM ran.':'Verified capabilities are now stored on this phone.';
      sessionJobs++;
      if(!demo&&$('autonomous').checked&&sessionJobs<3){const questions=NAMES.flatMap(n=>result.rounds.at(-1).perspectives[n].reflection?.next_research||[]).filter(q=>typeof q==='string'&&q.length<=300);state.queue.push(...questions.slice(0,1))}
    }
  }catch(error){state.journals[index]={goal,status:'blocked',mode:demo?'offline-demo':'live',error:error.message};$('notice').textContent=error.message}
  finally{busy=false;persist();render();$('start').disabled=false;$('demo').disabled=false;$('stop').hidden=true}
  if(state.queue.length&&$('autonomous').checked&&sessionJobs<3&&!controller.signal.aborted)setTimeout(()=>run(state.queue.shift()),1000);
}
$('goal-form').addEventListener('submit',event=>{event.preventDefault();if(native){native.submit($('goal').value);native.start();refreshNative();$('notice').textContent='Queued in the on-device service.'}else run($('goal').value)});
$('demo').addEventListener('click',()=>{if(native){native.demo();setTimeout(refreshNative,400)}else run($('goal').value,true)});
$('stop').addEventListener('click',()=>{controller?.abort();if(native)native.stop();refreshNative()});
$('save-connection').addEventListener('click',()=>{if(native){native.settings();return}const url=$('endpoint').value.trim();if(url&&!url.startsWith('https://')&&!url.startsWith('http://127.0.0.1')&&!url.startsWith('http://localhost')){$('notice').textContent='Use HTTPS for your model service.';return}state.endpoint=url;persist();render();$('notice').textContent='Connection saved.'});
if(native){$('endpoint').parentElement.querySelector('summary').textContent='On-device settings & external hands';$('endpoint').hidden=true;$('access').hidden=true;$('save-connection').textContent='Configure native hands';$('autonomous').parentElement.querySelector('small').textContent='One research task every 30 minutes while the local service runs';$('autonomous').addEventListener('change',()=>native.setAutonomy($('autonomous').checked));$('stop').hidden=false}
$('export').addEventListener('click',()=>{if(native){native.exportMemory();return}const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='stellar-memory.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('endpoint').value=state.endpoint||'';

const canvas=$('scene'),ctx=canvas.getContext('2d');let positions=[],pointers=new Map(),initialDistance=0;
function resize(){const rect=canvas.getBoundingClientRect();canvas.width=Math.round(rect.width*devicePixelRatio);canvas.height=Math.round(rect.height*devicePixelRatio);ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
function person(index){
  const group=index%4,part=Math.floor(index/4)%64,t=part/64*Math.PI*2;
  let x,y;
  if(part<14){x=Math.cos(t*64/14)*9;y=-52+Math.sin(t*64/14)*9}
  else if(part<30){const q=(part-14)/16;x=(q<.5?-1:1)*9;y=-38+q%0.5*68}
  else if(part<46){const q=(part-30)/16;x=(q<.5?-1:1)*(9+q%0.5*25);y=-28+q%0.5*50}
  else{const q=(part-46)/18;x=(q<.5?-1:1)*(4+q%0.5*20);y=-4+q%0.5*88}
  return {x:x+(group-1.5)*66,y,z:Math.sin(t)*12+(group%2)*24,group};
}
const colors=['#80e6c5','#a7b9ff','#f0cc85','#eea3b6'];
function draw(time){const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;ctx.clearRect(0,0,w,h);const count=state.units.length||256;positions=[];
  for(let i=0;i<count;i++){const p=person(i);p.z+=((state.units[i]?.relationship_strength??.5)-.5)*30;const x=p.x*Math.cos(yaw)-p.z*Math.sin(yaw),z=p.x*Math.sin(yaw)+p.z*Math.cos(yaw);const scale=240/(240+z);const px=w/2+x*scale*zoom,py=h/2+(p.y+Math.sin(time/1800+p.group)*2)*scale*zoom;positions.push({x:px,y:py});ctx.fillStyle=colors[Math.floor(i/64)%4];ctx.beginPath();ctx.arc(px,py,Math.max(1.1,1.35*scale*zoom),0,Math.PI*2);ctx.fill();if(zoom>2.4&&i%8===0){ctx.font='8px monospace';ctx.fillText(state.units[i]?.bits||i.toString(2).padStart(6,'0').slice(-6),px+4,py)}}
  if(zoom<=2.4){ctx.fillStyle='#9eafc5';ctx.font='10px system-ui';for(let g=0;g<4;g++)ctx.fillText(g===0?'You':['','Movement','Being','Design'][g],w/2+(g-1.5)*66-10,h/2+65)}
  requestAnimationFrame(draw);
}
canvas.addEventListener('pointerdown',event=>{canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2){const p=[...pointers.values()];initialDistance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}});
canvas.addEventListener('pointermove',event=>{const old=pointers.get(event.pointerId);if(!old)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===2){const p=[...pointers.values()];const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(initialDistance)zoom=Math.min(5,Math.max(.65,zoom*d/initialDistance));initialDistance=d}else yaw+=(event.clientX-old.x)*.01});
canvas.addEventListener('pointerup',event=>{pointers.delete(event.pointerId);const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const nearest=positions.map((p,i)=>({i,d:Math.hypot(p.x-x,p.y-y)})).sort((a,b)=>a.d-b.d)[0];const unit=state.units[nearest?.i];const observation={text:unit?'Interaction with '+unit.id:'Interaction with the shared space',time:Date.now(),unit:unit?.id};if(native)native.observe(JSON.stringify(observation));else{state.observations.push(observation);state.observations=state.observations.slice(-1000);persist()}render();refreshNative()});
canvas.addEventListener('pointercancel',event=>pointers.delete(event.pointerId));canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.min(5,Math.max(.65,zoom*Math.exp(-event.deltaY*.002)))},{passive:false});window.addEventListener('resize',resize);resize();requestAnimationFrame(draw);
render();refreshNative();if(native)setInterval(refreshNative,3000);
if('serviceWorker'in navigator&&!native)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
