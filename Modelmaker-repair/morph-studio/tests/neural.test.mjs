import {test} from 'node:test';import assert from 'node:assert/strict';
import {ImageField,INPUT_SIZE,DEFAULT_ADDRESS,encodeAddress,features,descriptor} from '../dist/neural.mjs';
import {exportONNX} from '../dist/onnx.mjs';
test('every address field changes the conditioning input and invalid values fail',()=>{
 const original=encodeAddress(DEFAULT_ADDRESS);for(const key of ['planetary','gate','line','color','tone','base','degree','minute','second','zodiac','house']){const a=structuredClone(DEFAULT_ADDRESS);a[key]++;assert.notDeepEqual(encodeAddress(a),original,key);}
 for(const a of [{...DEFAULT_ADDRESS,dimension:'Movement'},{...DEFAULT_ADDRESS,arc:{axis:'Diagonal',arcUnit:2}}])assert.notDeepEqual(encodeAddress(a),original);
 assert.throws(()=>encodeAddress({...DEFAULT_ADDRESS,gate:0}));assert.throws(()=>encodeAddress(DEFAULT_ADDRESS,[NaN,0,0,0,0,0]));
});
test('learned weights reduce error on a held-out color transformation',()=>{
 const m=new ImageField(16,42),samples=[];for(let k=0;k<32;k++){const x=new Float32Array(INPUT_SIZE);x[0]=k/32; samples.push({x,y:Float32Array.of(.2,.6,.8)});}
 const x=new Float32Array(INPUT_SIZE);x[0]=.45;const error=()=>m.forward(x).out.reduce((s,v,c)=>s+(v-[.2,.6,.8][c])**2,0);
 const before=error();for(let i=0;i<250;i++)m.batch(samples);assert.ok(error()<before*.01);const loaded=ImageField.load(m.save());assert.deepEqual(loaded.forward(x).out,m.forward(x).out);
 assert.ok(exportONNX(m).length>1000);assert.throws(()=>exportONNX(new ImageField(16)));
});
test('features are finite and bounded and renderer respects output shape',()=>{const size=8,image=Float32Array.from({length:size*size*3},(_,i)=>(i%17)/16),c=encodeAddress(DEFAULT_ADDRESS);const f=features(image,size,0,c,descriptor(image,size));assert.equal(f.length,INPUT_SIZE);assert.ok(f.every(Number.isFinite));const m=new ImageField();const result=m.render(image,size,c);assert.equal(result.length,image.length);assert.ok(result.every(x=>x>=0&&x<=1));});
test('malformed trained models are rejected',()=>{const m=new ImageField();m.steps=1;const o=m.save();o.w1[0]=NaN;assert.throws(()=>ImageField.load(o));});
