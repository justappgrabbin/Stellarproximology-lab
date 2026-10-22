import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { SynthiaAutomata } from '../vendor/klein/engine/synthia.js';
import { SOURCE_TOOL_CLASSES } from './klein_source_tools.mjs';

const root=path.resolve(process.argv[2]??'.modelmaker/klein');fs.mkdirSync(root,{recursive:true});
const engines=new Map();
const encode=v=>v instanceof Map?{__map:[...v].map(([k,x])=>[k,encode(x)])}:v instanceof Set?{__set:[...v]}:Array.isArray(v)?v.map(encode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)])):v;
const decode=v=>v?.__map?new Map(v.__map.map(([k,x])=>[k,decode(x)])):v?.__set?new Set(v.__set):Array.isArray(v)?v.map(decode):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)])):v;
// Compatibility repairs to valid per-operation resting states. The preserved
// donor files remain byte-identical; output/domain rejection still applies.
const finals={autoling:['listen','grammar'],diseminer:['receive','space','claims','simulate','influence'],
 success:['attempt','score','reinforce'],'browser-form':['see','fill','submit','confirm'],
 'research-browser':['query','fetch','extract','cite'],'morph-mir':['ingest','analyze','remember','regenerate']};
function engine(user){
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(user))throw new TypeError('invalid user key');
 if(engines.has(user))return engines.get(user);
 const e=new SynthiaAutomata();
 for(const Tool of SOURCE_TOOL_CLASSES){const t=new Tool();e.mesh.register(t);e.tools.push(t);e.toolsById.set(t.id,t);}
 for(const [id,states] of Object.entries(finals))e.toolsById.get(id).finals=states;
 const file=path.join(root,user+'.json');
 if(fs.existsSync(file)){
  const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const [id,state] of Object.entries(snapshot.tools))if(e.toolsById.has(id)){
    const t=e.toolsById.get(id),restored=decode(state);
    if(t.ownedState&&restored&&typeof restored==='object')Object.assign(t.ownedState,restored);else t.hydrate(restored);
   }
 }
 e.klein.syncOperators();engines.set(user,e);return e;
}
function save(user,e){
 const file=path.join(root,user+'.json'),tmp=file+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify({schema:1,tools:Object.fromEntries(e.tools.map(t=>[t.id,encode(t.exportState())]))}));fs.renameSync(tmp,file);
}
function invoke(e,id,input){
 if(id==='messy'&&input.rules?.some(r=>typeof r.when!=='function'))input={...input,rules:input.rules.map(r=>{
  if(!r.when||!Object.hasOwn(r.when,'feature')||!r.set)throw new TypeError('MESSY JSON rules require when.feature, when.equals and set');
  return {when:a=>a.features[r.when.feature]===r.when.equals,apply:a=>({...a,features:{...a.features,...r.set}})};
 })};
 const d=e.invoke(id,input,{source:'modelmaker',stateSpace:e.mesh.snapshot?.()??null});
 return {toolId:id,input,output:d.output,accepted:d.evaluation.accepted,
   derivationId:d.id,kleinEvaluationId:d.kleinEvaluation?.evaluationId};
}
async function handle(packet){
 const user=packet.user??'local',e=engine(user);
 if(packet.operation==='catalog')return e.tools.map(t=>({id:t.id,capabilities:t.capabilities,dimension:t.dimension,kleinWrapped:!!e.klein.operator(t.id)}));
 if(packet.operation==='invoke'){
  const result=invoke(e,packet.tool,packet.input??{});save(user,e);return result;
 }
 if(packet.operation==='study'){
  const text=String(packet.text??'');if(!text.trim()||text.length>12000)throw new TypeError('study accepts 1..12000 characters per passage');
  const outputs=[invoke(e,'autoling',{operation:'pipeline',text}),invoke(e,'computational-grammar-coder',{text}),
   invoke(e,'diseminer',{operation:'observe',text}),invoke(e,'diseminer',{operation:'extract',text,source:packet.source??'book'}),
   invoke(e,'diseminer-lite',{operation:'ingest',text,context:{source:packet.source??'book'}})];
  const sentences=text.split(/[.!?]+/).filter(s=>s.trim());
  const variants={short:0,medium:0,long:0};for(const s of sentences){const n=s.trim().split(/\s+/).length;variants[n<8?'short':n<20?'medium':'long']++;}
  outputs.push(invoke(e,'historical-monte-carlo',{variants,seed:42,generations:8,mutationScale:.05}));
  save(user,e);return {outputs,styleFeatures:{sentenceCount:sentences.length,observedLengthCounts:variants},
   policy:'actual tool analyses and sampled style hypotheses; not verified source facts or automatic training targets'};
 }
 throw new TypeError('unknown Klein operation');
}
const io=readline.createInterface({input:process.stdin});
for await(const line of io){try{const p=JSON.parse(line);const result=await handle(p);process.stdout.write(JSON.stringify({ok:true,result})+'\n');}catch(error){process.stdout.write(JSON.stringify({ok:false,error:String(error.message??error)})+'\n');}}
