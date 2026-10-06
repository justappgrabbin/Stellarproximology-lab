import { calculateGeonatalChart, humanDesignResolution, normalizeLongitude } from './GeonatalEngine.mjs';

const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const CHANNEL_DATA = Object.freeze([["01-08", "Inspiration", [1, 8], "G", "Throat", "Knowing", "attention"], ["02-14", "Beat", [2, 14], "G", "Sacral", "Knowing", "radial"], ["03-60", "Mutation", [3, 60], "Sacral", "Root", "Knowing", "liquid-state"], ["04-63", "Logic", [4, 63], "Ajna", "Head", "Understanding", "feedforward"], ["05-15", "Rhythm", [5, 15], "Sacral", "G", "Understanding", "self-organizing"], ["06-59", "Intimacy", [6, 59], "Solar Plexus", "Sacral", "Defense", "boundary-crossing"], ["07-31", "Alpha", [7, 31], "G", "Throat", "Understanding", "hierarchical"], ["09-52", "Concentration", [9, 52], "Sacral", "Root", "Understanding", "fixed-random"], ["10-20", "Awakening", [10, 20], "G", "Throat", "Integration", "direct-policy"], ["10-34", "Exploration", [10, 34], "G", "Sacral", "Centering", "actor-critic"], ["10-57", "Perfected Form", [10, 57], "G", "Spleen", "Integration", "adaptive-control"], ["11-56", "Curiosity", [11, 56], "Ajna", "Throat", "Sensing", "generative-language"], ["12-22", "Openness", [12, 22], "Throat", "Solar Plexus", "Knowing", "variational-autoencoder"], ["13-33", "Prodigal", [13, 33], "G", "Throat", "Sensing", "episodic-memory"], ["16-48", "Wavelength", [16, 48], "Throat", "Spleen", "Understanding", "sparse-autoencoder"], ["17-62", "Acceptance", [17, 62], "Ajna", "Throat", "Understanding", "restricted-boltzmann"], ["18-58", "Judgement", [18, 58], "Spleen", "Root", "Understanding", "hopfield"], ["19-49", "Synthesis", [19, 49], "Root", "Solar Plexus", "Ego", "hidden-markov"], ["20-34", "Charisma", [20, 34], "Throat", "Sacral", "Integration", "motor-policy"], ["20-57", "Brainwave", [20, 57], "Throat", "Spleen", "Knowing", "echo-state"], ["21-45", "Money Line", [21, 45], "Heart", "Throat", "Ego", "resource-allocation"], ["23-43", "Structuring", [23, 43], "Throat", "Ajna", "Knowing", "deconvolutional"], ["24-61", "Awareness", [24, 61], "Ajna", "Head", "Knowing", "neural-turing"], ["25-51", "Initiation", [25, 51], "G", "Heart", "Centering", "spiking-threshold"], ["26-44", "Surrender", [26, 44], "Heart", "Spleen", "Ego", "memory-prediction"], ["27-50", "Preservation", [27, 50], "Sacral", "Spleen", "Defense", "regulator"], ["28-38", "Struggle", [28, 38], "Spleen", "Root", "Knowing", "adversarial"], ["29-46", "Discovery", [29, 46], "Sacral", "G", "Sensing", "reinforcement"], ["30-41", "Recognition", [30, 41], "Solar Plexus", "Root", "Sensing", "recurrent"], ["32-54", "Transformation", [32, 54], "Spleen", "Root", "Ego", "evolutionary"], ["34-57", "Power", [34, 57], "Sacral", "Spleen", "Integration", "sensorimotor"], ["35-36", "Transitoriness", [35, 36], "Throat", "Solar Plexus", "Sensing", "sequence-to-sequence"], ["37-40", "Community", [37, 40], "Solar Plexus", "Heart", "Ego", "game-theory"], ["39-55", "Emoting", [39, 55], "Root", "Solar Plexus", "Knowing", "gru"], ["42-53", "Maturation", [42, 53], "Sacral", "Root", "Sensing", "deep-belief"], ["47-64", "Abstraction", [47, 64], "Ajna", "Head", "Sensing", "encoder"]]);
const FIBONACCI = Object.freeze([1,1,2,3,5,8,13,21,34,55,89,144]);
export const DIMENSIONS = Object.freeze(['Movement','Evolution','Being','Design','Space']);
export const QUESTION_DIMENSIONS = Object.freeze({ who:'Space', what:'Evolution', where:'Movement', when:'Being', why:'Design' });
export const AXES = Object.freeze([
  ['planetary',1,13],['dimension',1,5],['gate',1,64],['line',1,6],['color',1,6],
  ['tone',1,6],['base',1,5],['degree',0,29],['minute',0,59],['second',0,59],
  ['arc',0,99],['zodiac',1,12],['house',1,12],
]);

function id(prefix='id') {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

export class Coordinate {
  constructor(values={}) {
    for (const [name, lo, hi] of AXES) {
      const value = Number(values[name]);
      if (!Number.isInteger(value) || value < lo || value > hi) throw new Error(`${name} must be ${lo}..${hi}`);
      this[name] = value;
    }
    Object.freeze(this);
  }
  toJSON() { return Object.fromEntries(AXES.map(([name]) => [name, this[name]])); }
}

export class BeingStateSpace {
  size() { return AXES.reduce((n,[,lo,hi]) => n * BigInt(hi-lo+1), 1n); }
  encode(coordinate) {
    const c = coordinate instanceof Coordinate ? coordinate : new Coordinate(coordinate);
    return AXES.reduce((index,[name,lo,hi]) => index * BigInt(hi-lo+1) + BigInt(c[name]-lo), 0n);
  }
  decode(input) {
    let index;
    try { index = BigInt(input); } catch { throw new Error('state index must be an integer'); }
    if (index < 0n || index >= this.size()) throw new Error('state index out of range');
    const values={};
    for (const [name,lo,hi] of [...AXES].reverse()) {
      const width=BigInt(hi-lo+1); values[name]=Number(index%width)+lo; index=index/width;
    }
    return new Coordinate(values);
  }
  traverse(coordinate, axis, steps=1) {
    const c = coordinate instanceof Coordinate ? coordinate : new Coordinate(coordinate);
    const spec = AXES.find(([name]) => name===axis);
    if (!spec) throw new Error(`unknown axis: ${axis}`);
    const [,lo,hi]=spec;
    const values=c.toJSON();
    values[axis]=lo+((((values[axis]-lo+Number(steps))%(hi-lo+1))+(hi-lo+1))%(hi-lo+1));
    return new Coordinate(values);
  }
}

export class ActivationEngine {
  evaluate(natal=[], transits=[], contacts=[], previousSpaceGeneration=0) {
    const natalSet=new Set([...natal].map(Number));
    if ([...natalSet].some(g=>!Number.isInteger(g)||g<1||g>64)) throw new Error('natal gates must be 1..64');
    const all=[...[...natalSet].map(g=>({gate:g,source:'natal'})),...transits,...contacts];
    const byGate=new Map();
    for (const raw of all) {
      const gate=Number(raw.gate), source=String(raw.source||'contact');
      if (!Number.isInteger(gate)||gate<1||gate>64) throw new Error('gate must be 1..64');
      if(!byGate.has(gate))byGate.set(gate,new Set()); byGate.get(gate).add(source);
    }
    const channels=[];
    for(const [code,name,gates,c1,c2,circuit,processingAnalogue] of CHANNEL_DATA){
      if(gates.every(g=>byGate.has(g))){
        const sources=[...new Set(gates.flatMap(g=>[...byGate.get(g)]))].sort();
        channels.push({code,name,gates:[...gates],centers:[c1,c2],circuit,processingAnalogue,sources,temporary:!gates.every(g=>natalSet.has(g))});
      }
    }
    const centers=[...new Set(channels.flatMap(ch=>ch.centers))].sort();
    const routed=[...channels].sort((a,b)=>b.sources.length-a.sources.length||Number(a.temporary)-Number(b.temporary)||b.code.localeCompare(a.code))[0]?.code||null;
    const emergence=channels.length?1:0;
    return {
      natalGates:[...natalSet].sort((a,b)=>a-b),
      activeGates:[...byGate.keys()].sort((a,b)=>a-b),
      activeCenters:centers,
      channels,
      spaceGeneration:Number(previousSpaceGeneration)+emergence,
      spaceContext:{contributors:channels.map(ch=>ch.code),recursive:true,emerged:Boolean(emergence)},
      recurrenceSchedule:FIBONACCI.slice(0,Math.min(channels.length+1,FIBONACCI.length)),
      routedChannel:routed,
    };
  }

  reactionFlux(state) {
    return {
      nodes:(state.activeCenters||[]).map(center=>({id:center,kind:'center'})),
      edges:(state.channels||[]).map(ch=>({id:ch.code,source:ch.centers[0],target:ch.centers[1],temporary:ch.temporary,processingAnalogue:ch.processingAnalogue,sources:[...ch.sources]})),
      space:clone(state.spaceContext||{}),
    };
  }
}

export class PerspectiveEngine {
  constructor({ontology=null}={}) { this.ontology=ontology; }
  locate(expressions={}, weights={}) {
    const contributions=[]; const totals=Object.fromEntries(Object.values(QUESTION_DIMENSIONS).map(d=>[d,0]));
    for(const [rawQuestion,rawExpression] of Object.entries(expressions)){
      const question=rawQuestion.trim().toLowerCase().replace(/\?$/,'');
      const dimension=QUESTION_DIMENSIONS[question];
      if(!dimension)throw new Error(`Unknown coordinate ${rawQuestion}`);
      const expression=String(rawExpression||'').trim();if(!expression)continue;
      const weight=Number(weights[question]??1);if(!(weight>0))throw new Error('Active contribution weights must be greater than zero');
      totals[dimension]+=weight;contributions.push({question,dimension,expression,weight});
    }
    const total=Object.values(totals).reduce((a,b)=>a+b,0);
    const proportions=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,total?v/total:0]));
    return {stateId:id('perspective'),status:'pre-clarity-probabilistic',generatedAtUtc:new Date().toISOString(),proportions,activeDimensions:Object.keys(proportions).filter(k=>proportions[k]>0),contributions,clarifiedDimension:null};
  }
  clarify(state,dimension) {
    const canonical=DIMENSIONS.find(item=>item.toLowerCase()===String(dimension).toLowerCase());
    if(!canonical)throw new Error(`Unknown dimension: ${dimension}`);
    if(!state.activeDimensions.includes(canonical))throw new Error(`${canonical} is not active in this perspective state`);
    return {...clone(state),status:'post-clarity-deterministic',generatedAtUtc:new Date().toISOString(),proportions:Object.fromEntries(DIMENSIONS.map(d=>[d,d===canonical?1:0])),activeDimensions:[canonical],clarifiedDimension:canonical};
  }
  emerge({presentIdentity,contributingPrimitives,parentStates=[],inheritedRelations=[],transformationPath=[],changedProportions={},contactEvent,emergenceTime=null,recognitionTime=null}={}) {
    if(!String(presentIdentity||'').trim())throw new Error('Present identity is required');
    if(!contributingPrimitives?.length)throw new Error('At least one contributing primitive is required');
    if(!String(contactEvent||'').trim())throw new Error('A contact event is required');
    if(Object.values(changedProportions).some(Number.isNaN)||Object.values(changedProportions).some(v=>v<0))throw new Error('Proportions must be affirmative values');
    const now=new Date().toISOString();
    return {emergenceId:id('emergence'),presentIdentity:String(presentIdentity).trim(),contributingPrimitives:[...contributingPrimitives],parentStates:[...parentStates],inheritedRelations:[...inheritedRelations],transformationPath:[...transformationPath],changedProportions:{...changedProportions},contactEvent:String(contactEvent).trim(),emergenceTime:emergenceTime||now,recognitionTime:recognitionTime||now};
  }
}

export class SemanticGraph {
  constructor(){this.nodes=new Map();this.edges=new Map();}
  upsertNode(node){const row={id:String(node.id||id('node')),kind:String(node.kind||'concept'),label:String(node.label||node.text||''),data:clone(node.data||{}),updatedAt:new Date().toISOString()};this.nodes.set(row.id,row);return clone(row);}
  getNode(nodeId){const row=this.nodes.get(String(nodeId));return row?clone(row):null;}
  observeEdge(from,to,relation='related',weight=1,evidence=null){
    const key=`${from}::${relation}::${to}`;const existing=this.edges.get(key)||{id:key,from:String(from),to:String(to),relation:String(relation),weight:0,observations:0,evidence:[]};
    existing.observations+=1;existing.weight+=Number(weight)||0;if(evidence!=null)existing.evidence.push(clone(evidence));this.edges.set(key,existing);return clone(existing);
  }
  neighbors(nodeId){const key=String(nodeId);return [...this.edges.values()].filter(e=>e.from===key||e.to===key).map(clone);}
  snapshot(){return {nodes:[...this.nodes.values()].map(clone),edges:[...this.edges.values()].map(clone)};}
}

export class Diseminer {
  constructor(graph=new SemanticGraph()){this.graph=graph;}
  learn(subject,relation,object,{weight=1,evidence=null}={}){
    const sid=`concept:${String(subject).toLowerCase().replace(/\W+/g,'-')}`;const oid=`concept:${String(object).toLowerCase().replace(/\W+/g,'-')}`;
    this.graph.upsertNode({id:sid,label:subject});this.graph.upsertNode({id:oid,label:object});
    return this.graph.observeEdge(sid,oid,relation,weight,evidence);
  }
  paths(start,{depth=3}={}){
    const results=[];const queue=[[String(start),[]]];const seen=new Set([String(start)]);
    while(queue.length){const [node,path]=queue.shift();if(path.length>=depth)continue;for(const edge of this.graph.neighbors(node)){const next=edge.from===node?edge.to:edge.from;const nextPath=[...path,edge];results.push(nextPath);if(!seen.has(next)){seen.add(next);queue.push([next,nextPath]);}}}
    return results;
  }
}

export class Autoling {
  suggest(text, graph=null) {
    const input=String(text||'');const lower=input.toLowerCase();const probes=[];
    const rules=[['who','Space',/\b(i|we|they|he|she|who)\b/i],['what','Evolution',/\b(what|make|become|change|remember|know)\b/i],['where','Movement',/\b(where|move|go|from|toward|create)\b/i],['when','Being',/\b(when|now|then|body|am|is)\b/i],['why','Design',/\b(why|because|intend|purpose|design)\b/i]];
    for(const [question,dimension,pattern] of rules)if(pattern.test(input))probes.push({question,dimension,prompt:`${question[0].toUpperCase()+question.slice(1)} does "${input.slice(0,120)}" locate?`,weight:1});
    if(!probes.length)probes.push({question:'what',dimension:'Evolution',prompt:`What is changing or being made explicit here?`,weight:.5});
    return probes;
  }
}

export class GrammarController {
  analyze(text) {
    const rules=[
      ['who-think','who','Space',/\bi\s+think\b/gi],['who-communicate','who','Space',/\bi\s+communicat(?:e|ed|ing)\b/gi],
      ['what-remember','what','Evolution',/\bi\s+(?:remember|know)\b/gi],['where-define','where','Movement',/\bi\s+(?:define|create)\b/gi],
      ['when-am','when','Being',/\bi\s+am\b|\bmy\s+body\b/gi],['why-design','why','Design',/\bi\s+(?:design|intend)\b/gi],
    ];const matches=[];
    for(const [ruleId,question,dimension,regex] of rules)for(const found of String(text).matchAll(regex))matches.push({ruleId,question,dimension,expression:found[0],weight:1,span:[found.index,found.index+found[0].length]});
    return {text:String(text),matches:matches.sort((a,b)=>a.span[0]-b.span[0]),structuralWords:String(text).match(/\b(?:and|the|a|an|but|or)\b|[.!?,;:]/gi)||[],uppercaseExpressions:(String(text).match(/\b[A-Z][A-Z0-9_-]{1,}\b/g)||[]).filter(x=>x!=='I')};
  }
  realize(probe, expression=null){return expression?`${probe.question[0].toUpperCase()+probe.question.slice(1)} is ${expression} situated in ${probe.dimension}?`:probe.prompt;}
}

export class ContactLoop {
  constructor({graph=new SemanticGraph(),grammar=new GrammarController(),perspective=new PerspectiveEngine()}={}){this.graph=graph;this.grammar=grammar;this.perspective=perspective;this.autoling=new Autoling();this.diseminer=new Diseminer(graph);this.sessions=new Map();}
  start(openingText,{sourceRef='contact'}={}){
    const analysis=this.grammar.analyze(openingText);const expressions={};for(const m of analysis.matches)expressions[m.question]=m.expression;
    const perspective=this.perspective.locate(expressions);const nextProbe=this.autoling.suggest(openingText,this.graph)[0]||null;const now=new Date().toISOString();
    const session={sessionId:id('contact'),status:'open',perspective,nextProbe,turns:[{turnId:id('turn'),role:'user',text:String(openingText),analysis,createdAtUtc:now}],createdAtUtc:now,updatedAtUtc:now,sourceRef};this.sessions.set(session.sessionId,session);return clone(session);
  }
  observe(sessionId,text){const session=this.sessions.get(String(sessionId));if(!session)throw new Error('Unknown contact session');const analysis=this.grammar.analyze(text);const expressions={};const weights={};for(const m of analysis.matches){expressions[m.question]=m.expression;weights[m.question]=(weights[m.question]||0)+m.weight;}if(Object.keys(expressions).length)session.perspective=this.perspective.locate(expressions,weights);session.nextProbe=this.autoling.suggest(text,this.graph)[0]||null;session.turns.push({turnId:id('turn'),role:'user',text:String(text),analysis,createdAtUtc:new Date().toISOString()});session.updatedAtUtc=new Date().toISOString();return clone(session);}
  clarify(sessionId,dimension){const session=this.sessions.get(String(sessionId));if(!session)throw new Error('Unknown contact session');session.perspective=this.perspective.clarify(session.perspective,dimension);session.status='clarified';session.nextProbe=null;session.updatedAtUtc=new Date().toISOString();return clone(session);}
  get(sessionId){const s=this.sessions.get(String(sessionId));return s?clone(s):null;}
}

const CENTER_GRAPH = CHANNEL_DATA.map(([code,name,gates,a,b,circuit,processingAnalogue])=>({code,name,gates,centers:[a,b],circuit,processingAnalogue}));
const MOTOR_CENTERS=new Set(['Sacral','Root','Solar Plexus','Heart']);

function connected(centers,channels,start,target){const q=[start],seen=new Set([start]);while(q.length){const c=q.shift();if(c===target)return true;for(const ch of channels){if(!ch.centers.includes(c))continue;const n=ch.centers[0]===c?ch.centers[1]:ch.centers[0];if(!seen.has(n)){seen.add(n);q.push(n);}}}return false;}
function definitionGroups(centers,channels){const left=new Set(centers),groups=[];while(left.size){const start=left.values().next().value,q=[start],group=[];left.delete(start);while(q.length){const c=q.shift();group.push(c);for(const ch of channels)if(ch.centers.includes(c)){const n=ch.centers[0]===c?ch.centers[1]:ch.centers[0];if(left.has(n)){left.delete(n);q.push(n);}}}groups.push(group.sort());}return groups;}

export function buildChartFromGates({personality=[],design=[],metadata={}}={}) {
  const p=[...new Set(personality.map(Number))],d=[...new Set(design.map(Number))],all=[...new Set([...p,...d])];
  const field=new ActivationEngine().evaluate(all);
  const centers=field.activeCenters,channels=field.channels;
  const sacral=centers.includes('Sacral');
  const motorToThroat=[...MOTOR_CENTERS].some(c=>centers.includes(c)&&connected(centers,channels,c,'Throat'));
  let type=sacral?(motorToThroat?'manifesting-generator':'generator'):(motorToThroat?'manifestor':centers.length?'projector':'reflector');
  let authority='lunar';
  if(centers.includes('Solar Plexus'))authority='emotional';
  else if(sacral)authority='sacral';
  else if(centers.includes('Spleen'))authority='splenic';
  else if(centers.includes('Heart'))authority='ego';
  else if(centers.includes('G')&&connected(centers,channels,'G','Throat'))authority='self-projected';
  else if(centers.some(c=>['Ajna','Head','Throat'].includes(c)))authority='environmental';
  const groups=definitionGroups(centers,channels);
  const definition=groups.length===0?'none':groups.length===1?'single':groups.length===2?'split':groups.length===3?'triple-split':'quadruple-split';
  const strategy={generator:'respond','manifesting-generator':'respond-then-inform',manifestor:'inform',projector:'wait-for-invitation',reflector:'wait-a-lunar-cycle'}[type];
  const signature={generator:'satisfaction','manifesting-generator':'satisfaction',manifestor:'peace',projector:'success',reflector:'surprise'}[type];
  const notSelf={generator:'frustration','manifesting-generator':'frustration',manifestor:'anger',projector:'bitterness',reflector:'disappointment'}[type];
  return {type,strategy,authority,definition,signature,notSelf,personalityGates:p.sort((a,b)=>a-b),designGates:d.sort((a,b)=>a-b),activeGates:all.sort((a,b)=>a-b),centers,channels,definitionGroups:groups,field,metadata:clone(metadata)};
}

export function calculateChart(timestamp,location={}) {
  const geonatal=calculateGeonatalChart(timestamp,location);
  const tropical=geonatal.placements.filter(p=>p.frame==='tropical');
  const personality=tropical.filter(p=>p.orientation==='personality').map(p=>p.gate);
  const design=tropical.filter(p=>p.orientation==='design').map(p=>p.gate);
  const chart=buildChartFromGates({personality,design,metadata:{timestamp:geonatal.timestamp,designTimestamp:geonatal.designTimestamp,location:geonatal.location}});
  const pSun=tropical.find(p=>p.orientation==='personality'&&p.planetary==='Sun');
  const dSun=tropical.find(p=>p.orientation==='design'&&p.planetary==='Sun');
  chart.profile=pSun&&dSun?`${pSun.line}/${dSun.line}`:null;
  chart.geonatal=geonatal;
  return chart;
}

export function compareRelationship(first,second){
  const a=first,b=second;const set=(x)=>new Set(x||[]);const delta=(x,y)=>({shared:[...x].filter(v=>y.has(v)),firstOnly:[...x].filter(v=>!y.has(v)),secondOnly:[...y].filter(v=>!x.has(v))});
  return {centers:delta(set(a.centers),set(b.centers)),channels:delta(set(a.channels?.map(c=>c.code)),set(b.channels?.map(c=>c.code))),gates:delta(set(a.activeGates),set(b.activeGates)),authority:{first:a.authority,second:b.authority,same:a.authority===b.authority},type:{first:a.type,second:b.type,same:a.type===b.type}};
}

export function analyzeTiming(natal,transit){
  const relationship=compareRelationship(natal,transit);
  return {...relationship,natal:natal.metadata||null,transit:transit.metadata||null,temporaryChannels:(transit.channels||[]).filter(ch=>!(natal.channels||[]).some(n=>n.code===ch.code)).map(ch=>ch.code)};
}

export class KnowledgeInterpreter {
  constructor({atoms=[],rules=[]}={}){this.atoms=atoms;this.rules=rules;}
  chartKeys(chart){return new Set([`type:${chart.type}`,`authority:${chart.authority}`,`profile:${chart.profile}`,`definition:${chart.definition}`,...(chart.centers||[]).map(c=>`center:${c.toLowerCase().replace(/\s+/g,'-')}:defined`),...(chart.activeGates||[]).map(g=>`gate:${g}`),...(chart.channels||[]).map(ch=>`channel:${ch.code}`)]);}
  interpret(chart,{mapType=null,limit=12}={}){const keys=this.chartKeys(chart);const matchedAtoms=this.atoms.filter(a=>(a.chart_keys||a.chartKeys||[]).some(k=>keys.has(k))).map(a=>({...a,score:(a.chart_keys||a.chartKeys||[]).filter(k=>keys.has(k)).length})).sort((a,b)=>b.score-a.score);const rules=this.rules.filter(r=>(!mapType||r.map_type===mapType||r.mapType===mapType)&&(r.applies_to||r.appliesTo||[]).some(k=>keys.has(k))).map(r=>({...r,score:(r.applies_to||r.appliesTo||[]).filter(k=>keys.has(k)).length})).sort((a,b)=>b.score-a.score);return {keys:[...keys],atoms:matchedAtoms.slice(0,limit),rules:rules.slice(0,limit)};}
}

export { calculateGeonatalChart, humanDesignResolution, normalizeLongitude, CHANNEL_DATA };
