import {Automaton,AutomataMesh} from './automata/automaton.mjs';
export const FIELDS=Object.freeze(['Movement','Evolution','Being','Design','Space']);
const encoder=new TextEncoder();
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}

// Lossless reduction: retain a byte dictionary and pack dictionary indexes at
// the minimum fixed width. This is a storage primitive, not a semantic claim.
export function reduce(bytes){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>200000)throw Error('Provide 1–200,000 bytes.');
  const palette=[...new Set(bytes)].sort((a,b)=>a-b),width=Math.max(1,Math.ceil(Math.log2(palette.length)));
  const index=new Map(palette.map((v,i)=>[v,i])),packed=new Uint8Array(Math.ceil(bytes.length*width/8));
  let bit=0;
  for(const value of bytes){const code=index.get(value);for(let i=width-1;i>=0;i--,bit++)packed[bit>>3]|=((code>>i)&1)<<(7-(bit&7));}
  return {palette,width,length:bytes.length,packed:Array.from(packed)};
}
export function expand(p){
  if(!Number.isInteger(p.length)||p.length<1||p.length>200000||!Number.isInteger(p.width)||p.width<1||p.width>8||!Array.isArray(p.palette)||!p.palette.length||p.palette.length>256||new Set(p.palette).size!==p.palette.length||p.palette.some(v=>!Number.isInteger(v)||v<0||v>255)||p.width!==Math.max(1,Math.ceil(Math.log2(p.palette.length)))||!Array.isArray(p.packed)||p.packed.length!==Math.ceil(p.length*p.width/8)||p.packed.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('Invalid primitive representation.');
  const out=new Uint8Array(p.length);let bit=0;
  for(let n=0;n<p.length;n++){let code=0;for(let j=0;j<p.width;j++,bit++)code=(code<<1)|((p.packed[bit>>3]>>(7-(bit&7)))&1);if(code>=p.palette.length)throw Error('Primitive index outside dictionary.');out[n]=p.palette[code];}
  return out;
}
export function primitiveMath(p){
  const histogram=new Array(256).fill(0);let bit=0,sum=0;
  for(let n=0;n<p.length;n++){let code=0;for(let j=0;j<p.width;j++,bit++)code=(code<<1)|((p.packed[bit>>3]>>(7-(bit&7)))&1);const value=p.palette[code];if(value===undefined)throw Error('Invalid primitive index.');histogram[value]++;sum+=value;}
  return {byteSum:sum,byteCount:p.length,histogram,bitsPerIndex:p.width,dictionarySymbols:p.palette.length};
}
function scalars(value,path='',out=[],depth=0){
  if(depth>64||out.length>=20000)throw Error('JSON primitive limit reached (depth 64 / 20,000 scalars).');
  if(value===null||typeof value!=='object')out.push({path:path||'/',type:value===null?'null':typeof value,value});
  else for(const [key,v] of Object.entries(value))scalars(v,path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),out,depth+1);
  return out;
}
function numericStats(values){
  if(!values.length)return {count:0};
  if(values.some(x=>!Number.isFinite(x)||Math.abs(x)>1e100))throw Error('Numeric values exceed the supported finite range.');
  let sum=0,correction=0,min=Infinity,max=-Infinity;
  for(const x of values){const y=x-correction,t=sum+y;correction=(t-sum)-y;sum=t;min=Math.min(min,x);max=Math.max(max,x);}
  const mean=sum/values.length,variance=values.reduce((s,x)=>s+(x-mean)**2,0)/values.length;
  return {count:values.length,sum,mean,min,max,populationVariance:variance};
}
export async function runPipeline(input){
  if(!input||typeof input.text!=='string'||typeof input.name!=='string'||!input.name.trim()||input.name.length>120)throw Error('A filename and UTF-8 text are required.');
  const bytes=encoder.encode(input.text),primitive=reduce(bytes),sourceHash=await digest(bytes),primitiveAnalysis=primitiveMath(primitive),rebuilt=expand(primitive),reconstructionHash=await digest(rebuilt);
  if(sourceHash!==reconstructionHash)throw Error('Reconstruction failed; execution stopped.');
  const eventId='analysis-'+sourceHash,format=/\.json$/i.test(input.name)?'json':/\.(m?js|cjs)$/i.test(input.name)?'javascript':'text';
  let leaves=[];
  if(format==='json'){let value;try{value=JSON.parse(input.text);}catch{throw Error('JSON parse failed; fix the source before analysis.');}leaves=scalars(value);}
  const numeric=leaves.filter(x=>x.type==='number'),stats=numericStats(numeric.map(x=>x.value));
  const counts=new Array(256).fill(0);for(const b of rebuilt)counts[b]++;
  const entropy=counts.reduce((s,n)=>n?s-(n/bytes.length)*Math.log2(n/bytes.length):s,0);
  const previous=input.previous;
  if(previous&&(previous.name!==input.name||previous.schema!=='synthia.analysis.v1'))throw Error('Previous run must be the same named source and schema.');
  const find=(kind,message,evidence)=>({kind,message,evidence,eventId,sourceHash});
  const tools=Object.fromEntries(FIELDS.map((field,index)=>[field,()=>{
    const start=Math.floor(index*rebuilt.length/5),end=Math.floor((index+1)*rebuilt.length/5);
    const slice=rebuilt.slice(start,end),localCounts=new Array(256).fill(0);
    for(const b of slice)localCounts[b]++;
    const leafStart=Math.floor(index*leaves.length/5),leafEnd=Math.floor((index+1)*leaves.length/5);
    const assigned=leaves.slice(leafStart,leafEnd),numbers=assigned.filter(x=>x.type==='number');
    return {operation:'partition analysis',partition:index,byteRange:{start,end},scalarRange:{start:leafStart,end:leafEnd},
      sourceAddress:'sha256:'+sourceHash+'#bytes='+start+':'+end,
      byteCount:slice.length,byteSum:slice.reduce((sum,v)=>sum+v,0),byteHistogram:localCounts,
      statistics:numericStats(numbers.map(x=>x.value)),
      numericTransitions:numbers.slice(1,501).map((v,i)=>({from:numbers[i].path,to:v.path,delta:v.value-numbers[i].value})),
      transitionsOmitted:Math.max(0,numbers.length-501),
      scalarAddresses:assigned.slice(0,200).map(x=>({path:x.path,type:x.type})),addressesOmitted:Math.max(0,assigned.length-200),
      findings:[],reconstructionVerified:true};
  }]));
  const mesh=new AutomataMesh();
  // Gate 62 is the donor grammar tool's configured address, not a calculated
  // gate correspondence for arbitrary files. Source addresses remain SHA/path.
  const address={mode:'macro',gate:62,line:1,color:1,tone:1,base:1};
  const port={type:'analysis-context',schemaVersion:'1',guarantees:['source-trace']};
  mesh.add(new Automaton({id:'source',address,structure:'hexagram',activeLevels:[1,2,3,4,5],functionalLevel:'mind',ports:[{...port,id:'context',direction:'output'}],implementation:()=>({eventId,sourceHash,reconstructionHash})}));
  for(const field of FIELDS){mesh.add(new Automaton({id:field,address:{...address,dimension:field},structure:'hexagram',activeLevels:[1,2,3,4,5],functionalLevel:'mind',ports:[{...port,id:'context',direction:'input',requires:['source-trace']}],metadata:{field,adapter:'execution partition; names preserved as labels'},implementation:context=>({...context,field,...tools[field]()})}));const edge=mesh.connect('source',field);if(edge.status!=='connected')throw Error('Field contract failed.');}
  const execution=await mesh.run('source',{}, {maxHops:1,maxVisitsPerAutomaton:1});
  const fields=Object.fromEntries(FIELDS.map(field=>[field,execution.outputs[field]]));
  const findings=FIELDS.flatMap(field=>fields[field].findings);
  if(FIELDS.reduce((sum,field)=>sum+fields[field].byteSum,0)!==primitiveAnalysis.byteSum)throw Error('Primitive and expanded analyses disagree.');
  if(FIELDS.reduce((sum,field)=>sum+fields[field].byteCount,0)!==bytes.length)throw Error('Partition coverage failed.');
  if(format==='javascript')findings.push(find('review','Review executable source before any build action.',{name:input.name}));
  const route=input.route||'auto';if(!['auto','build','experiments','papers','library'].includes(route))throw Error('Unknown destination.');
  const destination=route==='auto'?(format==='javascript'?'build':stats.count?'experiments':'library'):route;
  const report={schema:'synthia.analysis.v1',eventId,name:input.name,sourceHash,reconstructionHash,bytes:bytes.length,format,statistics:stats,primitiveAnalysis,byteEntropyBits:entropy,versionComparison:{previousHash:previous?.sourceHash||null,changed:previous?previous.sourceHash!==sourceHash:null,byteLengthDelta:previous?bytes.length-previous.bytes:null},partitionContract:'Five contiguous, non-overlapping byte ranges cover the reconstructed file. JSON scalar work is also divided into five contiguous non-overlapping ordinal ranges. Field names label execution partitions.',fields,findings,route:destination,mesh:mesh.snapshot(),execution:execution.log.map(({sequence,automatonId,address,output})=>({sequence,automatonId,address,eventId:output.eventId,sourceHash:output.sourceHash})),followUps:findings.map(f=>({status:'awaiting-review',action:f.message,evidence:f.evidence})),limitations:['Fixed mathematical/structural executors; not autonomous LLM reasoning.','Field names label execution partitions; they do not assign meanings to arbitrary input.','No uploaded source code is evaluated. Build and publication need a separate reviewed action.']};
  report.reportHash=await digest(encoder.encode(JSON.stringify(report)));
  return {report,primitive,rebuilt};
}
