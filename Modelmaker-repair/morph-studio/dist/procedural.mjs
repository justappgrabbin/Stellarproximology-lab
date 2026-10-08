// Explicit state -> scene bindings. Traits may be supplied by a nonverbal adapter.
// No claim that a gate intrinsically implies drawing skill or a bodily feature.
import {rng,ImageField,INPUT_SIZE} from './neural.mjs';
export const DEFAULT_STATE={seed:42,phase:0,capabilities:{visualExpression:.5},actor:{height:.6,breadth:.45,energy:.5,hue:.76},world:{density:.45,elevation:.3,hue:.63}};
export const DEFAULT_RULES=[{source:'capabilities.visualExpression',target:'actor.ornament',scale:1,offset:0}];
const read=(o,path)=>path.split('.').reduce((v,k)=>v?.[k],o);
const bounded=x=>Math.max(0,Math.min(1,x));
const TARGETS=new Set(['actor.height','actor.breadth','actor.energy','actor.hue','actor.ornament','world.density','world.elevation','world.hue']);
function stateFeatures(state,paths){const x=new Float32Array(INPUT_SIZE);if(!Array.isArray(paths)||!paths.length||paths.length>48)throw Error('Supply 1–48 numeric source paths');paths.forEach((p,i)=>{const v=read(state,p);if(!Number.isFinite(v)||v<0||v>1)throw Error(`Source ${p} must be 0–1`);x[i]=v*2-1;});return x;}
export function learnStateBindings(config){
 const {sources,targets,examples}=config;
 if(!Array.isArray(targets)||targets.length!==3||new Set(targets).size!==3||targets.some(p=>!TARGETS.has(p)))throw Error('Choose three distinct supported procedural targets');
 if(!Array.isArray(examples)||examples.length<3||examples.length>1000)throw Error('Supply 3–1000 observed state/target examples');
 const samples=examples.map(e=>{const y=targets.map(p=>e.targets?.[p]);if(y.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Every example needs three target values in 0–1');return {x:stateFeatures(e.state,sources),y:Float32Array.from(y)};});
 const train=samples.slice(0,-1),held=samples.at(-1),model=new ImageField(16,42);
 const error=()=>model.forward(held.x).out.reduce((sum,v,i)=>sum+(v-held.y[i])**2/3,0),baseline=error();
 for(let i=0;i<300;i++)model.batch(train);
 return {format:'modelmaker-state-adapter-v1',sources,targets,model:model.save(),baseline,heldOutMSE:error(),trainingExamples:train.length};
}
export function applyLearnedBindings(state,adapter){
 if(adapter.format!=='modelmaker-state-adapter-v1'||!Array.isArray(adapter.targets)||adapter.targets.length!==3||adapter.targets.some(p=>!TARGETS.has(p)))throw Error('Invalid state adapter');
 const out=ImageField.load(adapter.model).forward(stateFeatures(state,adapter.sources)).out,s=structuredClone(state);
 adapter.targets.forEach((path,i)=>{const [area,key]=path.split('.');s[area][key]=out[i];});return s;
}
export function compileScene(state,rules=DEFAULT_RULES){
 const s=structuredClone(state);
 if(!Number.isInteger(s.seed)||s.seed<0||s.seed>4294967295)throw Error('Procedural seed must be an unsigned integer');
 for(const path of ['phase','actor.height','actor.breadth','actor.energy','actor.hue','world.density','world.elevation','world.hue']){const x=read(s,path);if(!Number.isFinite(x)||x<0||x>1)throw Error(`${path} must be 0–1`);}
 const allowed=TARGETS;
 if(!Array.isArray(rules)||rules.length>32)throw Error('Use at most 32 explicit bindings');
 for(const rule of rules){if(!allowed.has(rule.target))throw Error('Unknown binding target');const x=read(s,rule.source);if(!Number.isFinite(x)||!Number.isFinite(rule.scale)||!Number.isFinite(rule.offset))throw Error('Bindings must resolve finite numeric values');const [area,key]=rule.target.split('.');s[area][key]=bounded(x*rule.scale+rule.offset);}
 const random=rng(s.seed),n=Math.round(8+s.world.density*32),objects=[];
 for(let i=0;i<n;i++)objects.push({x:random()*2-1,z:random(),width:8+random()*20,height:12+random()*90*(.2+s.world.elevation)});
 return {format:'modelmaker-procedural-scene-v1',state:s,rules:structuredClone(rules),objects};
}
export function drawScene(canvas,scene,face=null,time=0){
 const g=canvas.getContext('2d'),w=canvas.width,h=canvas.height,s=scene.state;
 g.clearRect(0,0,w,h);g.fillStyle=`hsl(${s.world.hue*360} 28% 10%)`;g.fillRect(0,0,w,h);
 const horizon=h*.48;g.fillStyle=`hsl(${s.world.hue*360} 18% 18%)`;g.fillRect(0,horizon,w,h-horizon);
 g.strokeStyle=`hsl(${s.world.hue*360} 40% 32%)`;g.lineWidth=1;
 for(let i=0;i<12;i++){const y=horizon+(h-horizon)*(i/12)**2;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
 for(let i=-8;i<=8;i++){g.beginPath();g.moveTo(w*.5,horizon);g.lineTo(w*.5+i*w*.16,h);g.stroke();}
 for(const o of [...scene.objects].sort((a,b)=>a.z-b.z)){const depth=.3+.7*o.z,x=w*.5+o.x*w*.48*depth,y=horizon+o.z*(h-horizon)*.7;g.fillStyle=`hsl(${s.world.hue*360} 30% ${16+o.z*15}%)`;g.fillRect(x,y-o.height*depth,o.width*depth,o.height*depth);g.fillStyle=`hsl(${s.actor.hue*360} 65% 65%)`;g.fillRect(x+o.width*depth*.3,y-o.height*depth*.7,2,3);}
 const phase=s.phase,cx=w*(.25+.5*phase),bottom=h*.88,scale=.65+s.actor.height*.55,bodyH=h*.35*scale,breadth=20+s.actor.breadth*35,headR=18*scale;
 const walk=Math.sin(time*(2+s.actor.energy*5))*(4+s.actor.energy*5),top=bottom-bodyH;
 g.strokeStyle=`hsl(${s.actor.hue*360} 45% 48%)`;g.lineWidth=12*scale;g.lineCap='round';
 for(const sign of [-1,1]){g.beginPath();g.moveTo(cx+sign*breadth*.3,bottom-bodyH*.43);g.lineTo(cx+sign*breadth*.28+sign*walk,bottom);g.stroke();g.beginPath();g.moveTo(cx+sign*breadth*.52,top+headR*2);g.lineTo(cx+sign*(breadth*.7+walk),top+bodyH*.57);g.stroke();}
 g.fillStyle=`hsl(${s.actor.hue*360} 45% 28%)`;g.beginPath();g.ellipse(cx,top+bodyH*.38,breadth*.55,bodyH*.28,0,0,Math.PI*2);g.fill();
 const faceY=top+headR;g.save();g.beginPath();g.ellipse(cx,faceY,headR*.8,headR,0,0,Math.PI*2);g.clip();g.fillStyle='#b69383';g.fillRect(cx-headR,faceY-headR,headR*2,headR*2);
 if(face)g.drawImage(face,cx-headR*.8,faceY-headR,headR*1.6,headR*2);g.restore();
 const ornament=s.actor.ornament||0;g.strokeStyle=`hsl(${s.actor.hue*360} 85% 72%)`;g.lineWidth=1.5;for(let i=0;i<Math.round(ornament*12);i++){const y=top+bodyH*(.22+i*.026);g.beginPath();g.moveTo(cx-breadth*.4,y);g.lineTo(cx+breadth*.4,y+8);g.stroke();}
 return {actorPosition:[cx,bottom],scenePhase:phase};
}
