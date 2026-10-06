import assert from 'node:assert/strict';
import {reduce,expand,runPipeline,FIELDS} from '../human-design/dist/swarm-pipeline.mjs';
for(const bytes of [new Uint8Array([0]),new Uint8Array(127).fill(65),new Uint8Array(Array.from({length:256},(_,i)=>i)),new TextEncoder().encode('hello 世界 ✨')])assert.deepEqual(expand(reduce(bytes)),bytes);
assert.throws(()=>expand({length:1,width:2,palette:[4],packed:[0]}));
const first=await runPipeline({name:'experiment.json',text:'{"x":[1,2,3,4,5,6,7,8,9,10]}',route:'papers'});
assert.equal(first.report.statistics.sum,55);assert.equal(first.report.route,'papers');
assert.deepEqual(Object.keys(first.report.fields),FIELDS);
let byteEnd=0,scalarEnd=0,count=0,sum=0;
for(const f of FIELDS){const field=first.report.fields[f];assert.equal(field.eventId,first.report.eventId);assert.equal(field.sourceHash,first.report.sourceHash);assert.equal(field.byteRange.start,byteEnd);byteEnd=field.byteRange.end;assert.equal(field.scalarRange.start,scalarEnd);scalarEnd=field.scalarRange.end;count+=field.statistics.count;sum+=field.statistics.sum||0;}
assert.equal(byteEnd,first.report.bytes);assert.equal(scalarEnd,10);assert.equal(count,10);assert.equal(sum,55);assert.equal(first.report.execution.length,6);
const second=await runPipeline({name:'experiment.json',text:'{"x":[2,3]}',previous:first.report});assert.equal(second.report.versionComparison.changed,true);
await assert.rejects(runPipeline({name:'x.json',text:'{bad'}));
await assert.rejects(runPipeline({name:'x.txt',text:'abc',route:'shell'}));
await assert.rejects(runPipeline({name:'x.json',text:'{"n":1e200}'}));
const js=await runPipeline({name:'x.mjs',text:'throw Error("Do not execute input")'});assert.equal(js.report.route,'build');
console.log('Swarm: lossless reconstruction, five disjoint execution partitions, numeric aggregation, identity, version comparison, bounds and routing passed.');
