import {INPUT_SIZE} from './neural.mjs';
// Minimal protobuf writer for an ONNX MLP: MatMul, Add, Tanh, MatMul, Add, Sigmoid.
const enc=new TextEncoder();
const join=(...xs)=>{const n=xs.reduce((s,x)=>s+x.length,0),a=new Uint8Array(n);let p=0;for(const x of xs){a.set(x,p);p+=x.length;}return a;};
function vari(n){const a=[];do{let b=n%128;n=Math.floor(n/128);a.push(b|(n?128:0));}while(n);return Uint8Array.from(a);}
const num=(k,n)=>join(vari(k*8),vari(n));
const blob=(k,b)=>join(vari(k*8+2),vari(b.length),b);
const str=(k,s)=>blob(k,enc.encode(s));
function tensor(name,dims,data){const bytes=new Uint8Array(data.length*4),dv=new DataView(bytes.buffer);data.forEach((x,i)=>dv.setFloat32(i*4,x,true));return join(...dims.map(x=>num(1,x)),num(2,1),str(8,name),blob(9,bytes));}
function info(name,width){const shape=join(blob(1,str(2,'pixels')),blob(1,num(1,width)));const typ=blob(1,join(num(1,1),blob(2,shape)));return join(str(1,name),blob(2,typ));}
function node(op,inputs,output){return join(...inputs.map(x=>str(1,x)),str(2,output),str(4,op));}
export function exportONNX(m){
  if(m.steps<1)throw Error('Train a model before exporting');
  const nodes=[node('MatMul',['features','w1'],'a'),node('Add',['a','b1'],'b'),node('Tanh',['b'],'h'),node('MatMul',['h','w2'],'c'),node('Add',['c','b2'],'d'),node('Sigmoid',['d'],'rgb')];
  const graph=join(...nodes.map(x=>blob(1,x)),str(2,'ModelmakerNeuralMorph'),blob(5,tensor('w1',[INPUT_SIZE,m.hidden],m.w1)),blob(5,tensor('b1',[m.hidden],m.b1)),blob(5,tensor('w2',[m.hidden,3],m.w2)),blob(5,tensor('b2',[3],m.b2)),blob(11,info('features',INPUT_SIZE)),blob(12,info('rgb',3)));
  return join(num(1,8),str(2,'Modelmaker'),str(3,'1.0'),blob(7,graph),blob(8,num(2,13)));
}
