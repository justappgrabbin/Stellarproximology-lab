import {writeFileSync} from 'node:fs';
import {ImageField,INPUT_SIZE} from '../dist/neural.mjs';
import {exportONNX} from '../dist/onnx.mjs';
const m=new ImageField(16,42),x=Float32Array.from({length:INPUT_SIZE},(_,i)=>Math.sin(i)*.3);
for(let i=0;i<50;i++)m.batch([{x,y:Float32Array.of(.2,.6,.8)}]);
writeFileSync('/tmp/modelmaker-test.onnx',exportONNX(m));
writeFileSync('/tmp/modelmaker-test.json',JSON.stringify({x:Array.from(x),rgb:Array.from(m.forward(x).out)}));
