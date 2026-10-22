import { operator, BINARY_BOOLEAN_FUNCTIONS, hammingDistance } from '../engine/boolean-ato.js';

export const FOCAL_WEIGHT_FIELDS = Object.freeze(['knowledge','causal','temporal','dependency']);
export const FOCAL_WEIGHT_OPERATORS = BINARY_BOOLEAN_FUNCTIONS;

const clamp01=(n)=>Math.max(0,Math.min(1,Number(n)||0));
const encode=(weight,width)=>{
  const max=(2**width)-1;
  const value=Math.round(clamp01(weight)*max);
  return value.toString(2).padStart(width,'0').split('').map(Number);
};
const score=(bits)=>bits.reduce((sum,bit,index)=>sum+bit*(2**(bits.length-index-1)),0)/((2**bits.length)-1);

/**
 * Combines all four graph weights through every recovered Boolean operator.
 * Commutative operators fold Knowledge/Causal/Temporal/Dependency together.
 * BUT preserves that explicit order and exposes every directional step.
 * Space is the weighted mean of all five operator results; no result wins or
 * disappears. Operator weights default to one each.
 */
export function calculateFocalSpaceWeight(fieldWeights={}, {width=8,operatorWeights={}}={}) {
  const inputs=Object.fromEntries(FOCAL_WEIGHT_FIELDS.map((field)=>[field,clamp01(fieldWeights[field])]));
  const vectors=Object.fromEntries(FOCAL_WEIGHT_FIELDS.map((field)=>[field,encode(inputs[field],width)]));
  const results={};
  for(const mode of FOCAL_WEIGHT_OPERATORS){
    let current=vectors.knowledge;
    const trace=[];
    for(const field of FOCAL_WEIGHT_FIELDS.slice(1)){
      const before=current;
      current=operator(current,vectors[field],mode);
      trace.push({left:[...before],rightField:field,right:[...vectors[field]],result:[...current]});
    }
    results[mode]={vector:[...current],score:score(current),weight:clamp01(operatorWeights[mode]??1),trace,directional:['a_and_not_b','not_a_and_b','a_implies_b','b_implies_a'].includes(mode)};
  }
  const pairs=[];
  for(let i=0;i<FOCAL_WEIGHT_FIELDS.length;i++)for(let j=i+1;j<FOCAL_WEIGHT_FIELDS.length;j++){
    const a=FOCAL_WEIGHT_FIELDS[i],b=FOCAL_WEIGHT_FIELDS[j],distance=hammingDistance(vectors[a],vectors[b]);
    pairs.push({a,b,distance,normalizedDistance:distance/width,similarity:1-distance/width});
  }
  const hamming={pairs,meanDistance:pairs.reduce((s,x)=>s+x.normalizedDistance,0)/pairs.length,meanSimilarity:pairs.reduce((s,x)=>s+x.similarity,0)/pairs.length};
  const denominator=FOCAL_WEIGHT_OPERATORS.reduce((sum,mode)=>sum+results[mode].weight,0)+1;
  const spaceWeight=(FOCAL_WEIGHT_OPERATORS.reduce((sum,mode)=>sum+results[mode].score*results[mode].weight,0)+hamming.meanSimilarity)/denominator;
  return Object.freeze({inputs,vectors,operators:results,hamming,spaceWeight,order:[...FOCAL_WEIGHT_FIELDS],policy:'retain-all-boolean-results-plus-hamming'});
}

export function projectionEvidenceWeight(edges=[]) {
  if(!edges.length)return 0;
  return edges.reduce((sum,edge)=>sum+clamp01(edge.weight??edge.confidence??1),0)/edges.length;
}

