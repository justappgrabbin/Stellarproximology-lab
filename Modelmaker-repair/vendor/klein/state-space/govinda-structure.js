// Executable rules recovered directly from Lama Anagarika Govinda,
// The Inner Structure of the I Ching (1981). Printed page references are
// preserved with every table. No project-dimension equivalences are inferred.

import { gateBits, gateFromBits } from './addressing.js';

export const GOVINDA_SOURCE = Object.freeze({
  author:'Lama Anagarika Govinda', title:'The Inner Structure of the I Ching', edition:1981,
  evidence:'user-supplied PDF; verified against printed pages 26, 30-36, 45-47, 69-78, 100-101, 112-117, 136-138, 165'
});

export const GOVINDA_TRIGRAMS = Object.freeze({
  KIAN:Object.freeze({bits:[1,1,1], image:'Heaven', direction:'up', movement:'+A', class:'universal', psychological:'time-experience / duration'}),
  KUN:Object.freeze({bits:[0,0,0], image:'Earth', direction:'down', movement:'-A', class:'universal', psychological:'space-experience / extension'}),
  JEN:Object.freeze({bits:[1,0,0], image:'Thunder', direction:'up', movement:'+B', class:'organic', psychological:'volition / impulse'}),
  SUN:Object.freeze({bits:[0,1,1], image:'Wind/Wood', direction:'down', movement:'-B', class:'organic', psychological:'intuition / assimilation'}),
  LI:Object.freeze({bits:[1,0,1], image:'Fire', direction:'up', movement:'+C', class:'elemental', psychological:'discrimination / logos'}),
  KAN:Object.freeze({bits:[0,1,0], image:'Water', direction:'down', movement:'-C', class:'elemental', psychological:'emotion / eros'}),
  DUI:Object.freeze({bits:[1,1,0], image:'Lake/Mist', direction:'up', movement:'+D', class:'inorganic', psychological:'observation / intuitive vision'}),
  GEN:Object.freeze({bits:[0,0,1], image:'Mountain', direction:'down', movement:'-D', class:'inorganic', psychological:'equanimity / concentration'})
});

const trigramEntries = Object.entries(GOVINDA_TRIGRAMS);
const sameBits = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);

export function govindaTrigram(bits) {
  if (!Array.isArray(bits) || bits.length!==3) throw new TypeError('govindaTrigram expects 3 bottom-first yin/yang bits');
  const found=trigramEntries.find(([,v])=>sameBits(bits,v.bits));
  if (!found) return null;
  return Object.freeze({id:found[0],...found[1],bits:[...found[1].bits],source:{pages:'45-47'}});
}

// Govinda p.26/p.71: the foundational/bottom line decides direction.
export function trigramDirection(bits) {
  if (!Array.isArray(bits) || bits.length!==3 || bits.some((x)=>x!==0&&x!==1)) throw new TypeError('trigramDirection expects 3 bottom-first bits');
  return Object.freeze({direction:bits[0]===1?'up':'down',basis:'bottom-line',bottomLine:bits[0],source:{pages:'26, 71'}});
}

// Govinda p.70: A=1,2,3; B=4,5,6; C=2,3,4; D=3,4,5.
export function innerTrigramStructure(gateOrBits) {
  const bits=Number.isInteger(gateOrBits)?gateBits(gateOrBits):gateOrBits;
  if (!Array.isArray(bits)||bits.length!==6) throw new TypeError('innerTrigramStructure expects gate 1-64 or six bottom-first bits');
  const A=bits.slice(0,3), B=bits.slice(3,6), C=bits.slice(1,4), D=bits.slice(2,5);
  return Object.freeze({
    outer:Object.freeze({lower:govindaTrigram(A),upper:govindaTrigram(B)}),
    inner:Object.freeze({lower:govindaTrigram(C),upper:govindaTrigram(D),nuclearGate:gateFromBits([...C,...D])}),
    membership:Object.freeze({1:['A'],2:['A','C'],3:['A','C','D'],4:['B','C','D'],5:['B','D'],6:['B']}),
    source:Object.freeze({pages:'69-70',meaning:'inner signs show secondary, often compensatory tendencies'})
  });
}

// Govinda lists five results but the prose alone does not supply a complete
// opposition-vs-penetration discriminator for every convergent pair.
export function directionalInteraction(gateOrBits) {
  const s=innerTrigramStructure(gateOrBits);
  const lower=s.outer.lower.direction, upper=s.outer.upper.direction;
  let outcome, status='source-explicit';
  if (lower==='up'&&upper==='up') outcome='parallelism-up';
  else if (lower==='down'&&upper==='down') outcome='parallelism-down';
  else if (lower==='down'&&upper==='up') outcome='divergence';
  else { outcome=['opposition','penetration']; status='unresolved-discriminator'; }
  return Object.freeze({lower,upper,outcome,status,source:{pages:'71, 78, 136-137'}});
}

export const GOVINDA_SYSTEM_GEOMETRY = Object.freeze({
  fuXi:Object.freeze({mode:'axial',quality:'polar/timeless',traversal:'complementary pairs through center',pages:'26, 165'}),
  kingWen:Object.freeze({mode:'peripheral',quality:'temporal',traversal:'clockwise succession',pages:'26-27, 32-35, 165'})
});

export const GOVINDA_KING_WEN_TEMPORAL_SEQUENCE = Object.freeze(['JEN','SUN','LI','KUN','DUI','KIAN','KAN','GEN']);

// Both formulations are retained because the source presents both.
export const GOVINDA_ABSTRACT_TEMPORAL_MAPS = Object.freeze({
  cycleForm:Object.freeze({KIAN:'LI',LI:'JEN',JEN:'GEN',GEN:'KIAN',KUN:'KAN',KAN:'DUI',DUI:'SUN',SUN:'KUN',pages:'67'}),
  axialForm:Object.freeze({KIAN:'GEN',GEN:'JEN',JEN:'LI',LI:'KIAN',KUN:'SUN',SUN:'DUI',DUI:'KAN',KAN:'KUN',pages:'100-101'}),
  status:'parallel source formulations; neither silently wins'
});

export const GOVINDA_HOUSE_EXAMPLES = Object.freeze({
  KIAN:Object.freeze({gates:[1,44,33,12,20,23,35,14],pages:'74-75'}),
  KUN:Object.freeze({gates:[2,24,19,11,34,43,5,8],pages:'75'})
});

export function govindaStateEvidence(gate) {
  const structure=innerTrigramStructure(gate);
  const interaction=directionalInteraction(gate);
  const temporalIndex=GOVINDA_KING_WEN_TEMPORAL_SEQUENCE.indexOf(structure.outer.lower.id);
  return Object.freeze({gate,structure,interaction,projections:Object.freeze({
    knowledge:Object.freeze([{relation:'has-outer-structure',value:[structure.outer.lower.id,structure.outer.upper.id]},{relation:'has-inner-structure',value:[structure.inner.lower.id,structure.inner.upper.id]}]),
    causal:Object.freeze([{relation:'directional-interaction',value:interaction.outcome,status:interaction.status}]),
    temporal:Object.freeze([{relation:'lower-trigram-temporal-position',value:temporalIndex,sequence:GOVINDA_KING_WEN_TEMPORAL_SEQUENCE}]),
    dependency:Object.freeze([{relation:'inner-line-membership',value:structure.membership}])
  }),source:GOVINDA_SOURCE});
}

