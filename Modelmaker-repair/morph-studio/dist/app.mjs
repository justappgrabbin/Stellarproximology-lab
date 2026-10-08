import {DEFAULT_STATE,DEFAULT_RULES,compileScene,drawScene,learnStateBindings,applyLearnedBindings} from './procedural.mjs';
import {DEFAULT_ADDRESS,encodeAddress,ImageField} from './neural.mjs';
import {exportONNX} from './onnx.mjs';
const $=id=>document.getElementById(id);$('address').value=JSON.stringify(DEFAULT_ADDRESS,null,2);
let sourceFile,targetFile,testFile,model=null,worker=null,report=null,pairs=[],modelSize=64;
const status=s=>$('status').textContent=s;
function context(){const address=JSON.parse($('address').value);address.dimension=$('dimension').value;const emotions=Array(6).fill(0),index=Number($('emotion').value);if(index>=0)emotions[index]=Number($('intensity').value);const phase=Number($('phase').value);return {address,emotions,phase,condition:encodeAddress(address,emotions,phase)};}
async function pixels(file,size){if(!file)throw Error('Choose a photo first');if(file.size>20*1024*1024)throw Error('Use images under 20 MB');const bmp=await createImageBitmap(file);if(bmp.width*bmp.height>32e6){bmp.close();throw Error('Image exceeds 32 megapixels');}const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.drawImage(bmp,0,0,size,size);bmp.close();const rgba=ctx.getImageData(0,0,size,size).data;return Float32Array.from({length:size*size*3},(_,i)=>rgba[Math.floor(i/3)*4+i%3]/255);}
function draw(canvas,rgb,size){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),im=ctx.createImageData(size,size);for(let p=0;p<size*size;p++){for(let j=0;j<3;j++)im.data[p*4+j]=Math.max(0,Math.min(255,Math.round(rgb[p*3+j]*255)));im.data[p*4+3]=255;}ctx.putImageData(im,0,0);const dest=canvas.getContext('2d');dest.clearRect(0,0,canvas.width,canvas.height);dest.drawImage(c,0,0,canvas.width,canvas.height);}
function busy(active){for(const id of ['train','add','import','size','hidden','epochs','seed'])$(id).disabled=active;$('stop').disabled=!active;}
function downloads(enabled){for(const id of ['render','onnx','bundle','png'])$(id).disabled=!enabled;}
async function guarded(fn){try{await fn();}catch(e){status(e.message);}}
for(const [id,assign,canvas] of [['source',f=>sourceFile=f,'sourceCanvas'],['target',f=>targetFile=f,'targetCanvas']])$(id).onchange=()=>guarded(async()=>{const f=$(id).files[0];assign(f);if(f)draw($(canvas),await pixels(f,128),128);});
$('testPhoto').onchange=()=>testFile=$('testPhoto').files[0];
$('phase').oninput=()=>{$('phaseValue').value=Number($('phase').value).toFixed(2);};
function showPairs(){const box=$('pairs');box.replaceChildren();pairs.forEach((p,i)=>{const row=document.createElement('div');row.className='pairrow';const title=document.createElement('span');title.textContent=`${i+1}. ${p.name}`;const dim=document.createElement('small');dim.textContent=p.context.address.dimension+(i===pairs.length-1?' · held out':'');const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label',`Remove pair ${i+1}`);del.disabled=!!worker;del.onclick=()=>{pairs.splice(i,1);showPairs();};row.append(title,dim,del);box.append(row);});if(!pairs.length)box.textContent='Your examples will appear here.';}
$('add').onclick=()=>guarded(async()=>{if(!sourceFile||!targetFile)throw Error('Choose both a source photo and a target image');if(pairs.length>=24)throw Error('This local pass supports up to 24 pairs');const ctx=context();pairs.push({sourceFile,targetFile,name:targetFile.name,context:ctx});showPairs();status(`${pairs.length} pairs ready. Add varied independent examples for useful held-out results.`);});
function chart(history){const c=$('chart'),g=c.getContext('2d');g.clearRect(0,0,c.width,c.height);const max=Math.max(.001,...history.flatMap(p=>[p.train,p.validation]));for(const [key,col] of [['train','#b7a1ff'],['validation','#7bd1b2']]){g.strokeStyle=col;g.lineWidth=2;g.beginPath();history.forEach((p,i)=>{const x=10+i/Math.max(1,history.length-1)*(c.width-20),y=c.height-10-p[key]/max*(c.height-20);i?g.lineTo(x,y):g.moveTo(x,y);});g.stroke();}}
$('train').onclick=()=>guarded(async()=>{
  if(pairs.length<2)throw Error('Add at least two independent image pairs');const size=Number($('size').value),epochs=Number($('epochs').value),seed=Number($('seed').value);
  if(!Number.isInteger(epochs)||epochs<1||epochs>200||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Use 1–200 epochs and an integer seed');
  busy(true);downloads(false);status('Preparing local images…');
  try{const data=[];for(const p of pairs)data.push({source:await pixels(p.sourceFile,size),target:await pixels(p.targetFile,size),condition:p.context.condition,name:p.name});
    worker=new Worker('train-worker.mjs',{type:'module'});showPairs();const history=[];
    const fail=message=>{worker?.terminate();worker=null;busy(false);downloads(!!model);showPairs();status(message);};
    worker.onerror=e=>fail(`Training failed: ${e.message}`);
    worker.onmessage=async({data:d})=>{if(d.type==='error'){fail(d.message);return;}if(d.type==='progress'){history.push(d);$('progress').value=d.epoch/d.epochs;$('loss').textContent=d.train.toFixed(5);$('val').textContent=d.validation.toFixed(5);$('steps').textContent=String(d.epoch*16);chart(history);status(`Epoch ${d.epoch}/${d.epochs} · violet: training · green: held out`);}if(d.type==='done'){
      model=ImageField.load(d.model);modelSize=size;report={...d,model:undefined,created:new Date().toISOString(),pairs:pairs.map(p=>({name:p.name,address:p.context.address,emotions:p.context.emotions,phase:p.context.phase})),notes:$('notes').value,materials:Array.from($('materials').files).map(f=>f.name)};
      worker.terminate();worker=null;busy(false);downloads(true);showPairs();const val=d.history.at(-1).validation;status(`Trained locally. Held-out MSE ${d.baseline.toFixed(5)} → ${val.toFixed(5)}. ${val<d.baseline?'Held-out error decreased.':'Held-out error did not improve; revise your examples.'}`);await guarded(render);
    }};
    worker.postMessage({pairs:data,size,hidden:Number($('hidden').value),epochs,seed});
  }catch(e){busy(false);downloads(!!model);throw e;}
});
$('stop').onclick=()=>{worker?.terminate();worker=null;busy(false);downloads(!!model);showPairs();status('Training stopped. The previous completed model is retained.');};
async function render(){if(!model)throw Error('Train or import a model first');const image=await pixels(testFile||sourceFile||pairs[0]?.sourceFile,modelSize);draw($('result'),model.render(image,modelSize,context().condition),modelSize);$('previewEmpty').hidden=true;}
$('render').onclick=()=>guarded(render);
function download(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('onnx').onclick=()=>guarded(()=>{download('modelmaker-morph.onnx',new Blob([exportONNX(model)],{type:'application/octet-stream'}));status('ONNX exported. Download the model manifest too: it defines the required feature preprocessing.');});
$('bundle').onclick=()=>guarded(()=>download('modelmaker-morph.json',new Blob([JSON.stringify({model:model.save(),report,resolution:modelSize,preprocessing:'modelmaker-image-field-v1: see neural.mjs features()'},null,2)],{type:'application/json'})));
$('png').onclick=()=>guarded(()=>$('result').toBlob(b=>download('modelmaker-output.png',b),'image/png'));
$('import').onchange=()=>guarded(async()=>{const file=$('import').files[0];if(!file)return;if(file.size>2e6)throw Error('Model JSON exceeds 2 MB');const bundle=JSON.parse(await file.text());if(![32,64,128].includes(bundle.resolution))throw Error('Unsupported image resolution');const next=ImageField.load(bundle.model);model=next;modelSize=bundle.resolution;report=bundle.report;downloads(true);$('steps').textContent=String(model.steps);status('Trained weights loaded. Choose a photo and render with your context.');});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

$('sceneState').value=JSON.stringify(DEFAULT_STATE,null,2);$('sceneRules').value=JSON.stringify(DEFAULT_RULES,null,2);
let adapter=null,scene=compileScene(DEFAULT_STATE),face=null,playing=false,frame=null,t0=0;
function sceneTick(t){if(!playing)return;if(!t0)t0=t;const time=(t-t0)/1000;scene.state.phase=(time*.08)%1;drawScene($('sceneCanvas'),scene,face,time);frame=requestAnimationFrame(sceneTick);}
$('generateScene').onclick=()=>guarded(()=>{let state=JSON.parse($('sceneState').value);if(adapter)state=applyLearnedBindings(state,adapter);const rules=JSON.parse($('sceneRules').value).filter(r=>!adapter?.targets.includes(r.target));scene=compileScene(state,rules);drawScene($('sceneCanvas'),scene,face);status('Procedural scene generated from explicit state and bindings.');});
$('playScene').onclick=()=>{playing=!playing;t0=0;if(playing)frame=requestAnimationFrame(sceneTick);else cancelAnimationFrame(frame);};
$('face').onchange=()=>guarded(async()=>{const f=$('face').files[0];if(!f)return;if(f.size>20e6)throw Error('Use a face crop under 20 MB');const next=await createImageBitmap(f);face?.close();face=next;drawScene($('sceneCanvas'),scene,face);});
$('exportScene').onclick=()=>guarded(()=>download('modelmaker-scene.json',new Blob([JSON.stringify(scene,null,2)],{type:'application/json'})));
drawScene($('sceneCanvas'),scene);

$('learnAdapter').onclick=()=>guarded(()=>{adapter=learnStateBindings(JSON.parse($('adapterExamples').value));$('saveAdapter').disabled=false;status(`Procedural adapter trained. Held-out MSE ${adapter.baseline.toFixed(5)} → ${adapter.heldOutMSE.toFixed(5)}. Generate a scene to apply it.`);});
$('saveAdapter').onclick=()=>guarded(()=>download('modelmaker-state-adapter.json',new Blob([JSON.stringify(adapter,null,2)],{type:'application/json'})));
$('loadAdapter').onchange=()=>guarded(async()=>{const f=$('loadAdapter').files[0];if(!f)return;if(f.size>2e6)throw Error('Adapter exceeds 2 MB');const next=JSON.parse(await f.text());applyLearnedBindings(JSON.parse($('sceneState').value),next);adapter=next;$('saveAdapter').disabled=false;status('State adapter loaded. Generate the scene to apply it.');});
