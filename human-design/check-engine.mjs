import assert from 'node:assert/strict';
import {calculateChart} from './dist/deep-engine.mjs';
import {ActivationEngine,buildChartFromGates} from './dist/BiverseCore.mjs';
const channels=new ActivationEngine().evaluate(Array.from({length:64},(_,i)=>i+1)).channels;
assert.equal(channels.length,36);
for(const channel of channels){const c=buildChartFromGates({personality:channel.gates});assert.ok(c.channels.some(x=>x.code===channel.code));assert.ok(channel.centers.every(x=>c.centers.includes(x)));}
assert.equal(buildChartFromGates({personality:[]}).type,'reflector');
const timestamp=new Date('1990-06-15T12:00:00Z');
const chart=calculateChart(timestamp,{latitude:51.5074,longitude:-.1278});
assert.equal(chart.geonatal.placements.length,78);
assert.ok(chart.activeGates.every(g=>g>=1&&g<=64));
const tropical=chart.geonatal.placements.filter(x=>x.frame==='tropical');
const suns=tropical.filter(x=>x.planetary==='Sun');
const arc=((suns.find(x=>x.orientation==='personality').longitude-suns.find(x=>x.orientation==='design').longitude)%360+360)%360;
assert.ok(Math.abs(arc-88)<.001);
assert.ok(new Date(chart.metadata.designTimestamp)<timestamp);
assert.deepEqual(calculateChart(timestamp,{latitude:51.5074,longitude:-.1278}),chart);
console.log('Chart mechanics: all 36 channels, 78 placements, deterministic chart, and 88-degree design arc passed.');
