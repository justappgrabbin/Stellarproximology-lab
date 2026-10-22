import { OPERATORS, operatorById } from '../state-space/operators.js';
import { NAMED_TRANSITIONS, transitionById } from '../state-space/transitions.js';
import { gateBits, gateFromBits, addrKey } from '../state-space/addressing.js';
import { TOOL_REGISTRY } from '../automata/registry.js';
import { stableStringify, fnv1a32 } from '../engine/derivation.js';
import { MemoryRecordStore } from './storage.js';
import { govindaStateEvidence } from '../state-space/govinda-structure.js';
import { calculateFocalSpaceWeight, projectionEvidenceWeight } from './focal-weight-calculator.js';
import { formatCanonicalAddress, formatContactAddress } from './canonical-address-code.js';

export const CANONICAL_ADDRESS_FIELDS = Object.freeze([
  'planetary', 'dimension', 'gate', 'line', 'color', 'tone', 'base',
  'degree', 'minute', 'second', 'arcAxis', 'zodiac', 'house'
]);

const requiredAddressFields = Object.freeze(['planetary','dimension','gate','line','color','tone','base','degree','minute','second','arcAxis','zodiac','house']);
const clone = (value) => structuredClone(value);

function validateAddress(address) {
  const missing = requiredAddressFields.filter((field) => address?.[field] === undefined || address?.[field] === null || address?.[field] === '');
  if (missing.length) throw new Error(`UNRESOLVED_CANONICAL_ADDRESS: missing ${missing.join(', ')}`);
  const ranges = { gate:[1,64], line:[1,6], color:[1,6], tone:[1,6], base:[1,5], degree:[0,359], minute:[0,59], second:[0,59.999999] };
  for (const [field,[min,max]] of Object.entries(ranges)) {
    const value = Number(address[field]);
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`canonical address ${field} must be ${min}..${max}`);
  }
  return Object.freeze(Object.fromEntries(CANONICAL_ADDRESS_FIELDS.map((field) => [field, address[field]])));
}

function artifactIdentity(artifact) {
  if (artifact?.identity) return String(artifact.identity);
  const stable = { name: artifact?.name ?? null, type: artifact?.type ?? null, content: artifact?.content ?? null };
  return `artifact:${fnv1a32(stableStringify(stable))}`;
}

function transitionApplication(before, transitionId, args = {}) {
  const transition = transitionById(transitionId);
  if (!transition) throw new Error(`Unknown existing Kimi transition: ${transitionId}`);
  const operator = operatorById(transition.operatorId);
  if (!operator) throw new Error(`Disconnected Kimi operator: ${transition.operatorId}`);
  const focalGate = before.executionState?.gate ?? before.canonicalAddress.gate;
  const bits = gateBits(focalGate);
  let result;
  if (transition.operatorId === 'o_change') result = operator.transform([bits, args.changingLines || args.mask || []]);
  else if (['o_reverse','o_inverse','o_converse','o_nuclear'].includes(transition.operatorId)) result = operator.transform(bits, args);
  else result = operator.transform(args.operands ?? before.executionState, args);
  const nextBits = Array.isArray(result) ? result : result?.bits;
  const nextGate = nextBits?.length === 6 ? gateFromBits(nextBits) : focalGate;
  return { transition, operator, result, nextGate };
}

export class FocalStateSpace {
  constructor({ store = new MemoryRecordStore(), semanticResolvers = [] } = {}) {
    this.store = store;
    this.semanticResolvers = [...semanticResolvers];
    this.focusIdentity = null;
  }

  inventory() {
    return {
      operators: OPERATORS.map(({transform, ...meta}) => ({...meta, exportedSymbol:'OPERATORS/operatorById', filename:'src/state-space/operators.js'})),
      transitions: NAMED_TRANSITIONS.map((item) => ({...item, exportedSymbol:'NAMED_TRANSITIONS/transitionById', filename:'src/state-space/transitions.js'})),
      automata: TOOL_REGISTRY.map((item) => ({...item, exportedSymbol:'TOOL_REGISTRY', filename:'src/automata/registry.js'}))
    };
  }

  async ingest(artifact, context = {}) {
    const identity = artifactIdentity(artifact);
    const existing = await this.store.get(identity);
    if (existing) { this.focusIdentity = identity; return { record: existing, created:false, analyzed:false, view:this.project(existing) }; }

    let resolution = artifact.canonicalAddress ? { address: artifact.canonicalAddress, evidence: artifact.addressEvidence || 'artifact-explicit' } : null;
    for (const resolver of this.semanticResolvers) {
      if (resolution) break;
      const candidate = await resolver(artifact, context);
      if (candidate?.address) resolution = candidate;
    }
    if (!resolution) throw new Error('UNRESOLVED_CANONICAL_ADDRESS: no explicit address or registered semantic resolver; hashes and keyword guesses are forbidden');
    const canonicalAddress = validateAddress(resolution.address);
    const now = context.sequence ?? 0;
    const inventory = this.inventory();
    const record = {
      schema:'synthia.canonical-artifact.v1', identity, canonicalAddress,
      canonicalAddressCode: formatCanonicalAddress(canonicalAddress),
      contactAddressCode: artifact.kind === 'person' || artifact.kind === 'agent' ? formatContactAddress(canonicalAddress) : null,
      focalSpacePosition:{ identity, addressKey:formatCanonicalAddress(canonicalAddress), scale:'focal', currentState:{gate:canonicalAddress.gate,bits:gateBits(canonicalAddress.gate)} },
      graphs:{ knowledge:[], causal:[], temporal:[], dependency:[] },
      macroContext:clone(artifact.macroContext || { containers:[], neighbors:[], upstream:[], downstream:[] }),
      microContext:clone(artifact.microContext || { components:[], localStates:[{gate:canonicalAddress.gate,bits:gateBits(canonicalAddress.gate)}], relationships:[], transitions:[] }),
      availablePrimitivesOperators:{ operatorIds:inventory.operators.map((x)=>x.id), transitionIds:inventory.transitions.map((x)=>x.id), automataIds:inventory.automata.map((x)=>x.id) },
      executionState:clone(artifact.executionState || { status:'ingested', gate:canonicalAddress.gate }),
      dependencies:clone(artifact.dependencies || []), provenance:clone({ ...(artifact.provenance || {}), addressEvidence:resolution.evidence }),
      historyReplay:[{ sequence:now, type:'ingest', address:canonicalAddress, evidence:resolution.evidence }],
      artifactSnapshot:clone({ name:artifact.name, type:artifact.type, metadata:artifact.metadata || null })
    };
    this.recompute(record);
    await this.store.put(record);
    this.focusIdentity = identity;
    return { record:clone(record), created:true, analyzed:true, view:this.project(record) };
  }

  recompute(record) {
    const history = record.historyReplay;
    const currentGate = record.executionState?.gate ?? record.canonicalAddress.gate;
    const govinda = govindaStateEvidence(currentGate);
    record.graphs.knowledge = [
      ...record.availablePrimitivesOperators.operatorIds.map((id)=>({from:record.identity,to:`operator:${id}`,relation:'can-use'})),
      ...record.availablePrimitivesOperators.automataIds.map((id)=>({from:record.identity,to:`automaton:${id}`,relation:'can-route-to'})),
      {from:record.identity,to:`address:${record.canonicalAddressCode || formatCanonicalAddress(record.canonicalAddress)}`,relation:'canonically-located'},
      ...govinda.projections.knowledge.map((x)=>({from:record.identity,to:`govinda:${currentGate}`,source:'Govinda 1981',...x}))
    ];
    record.graphs.causal = [...history.filter((e)=>e.type==='transition').map((e)=>({from:e.before.gate,to:e.after.gate,relation:e.transition,sequence:e.sequence})),...govinda.projections.causal];
    record.graphs.temporal = [...history.map((e,i)=>({from:i?history[i-1].sequence:null,to:e.sequence,relation:e.type})),...govinda.projections.temporal];
    record.graphs.dependency = [...record.dependencies.map((dep)=>({from:record.identity,to:typeof dep==='string'?dep:dep.identity,relation:dep.relation||'depends-on'})),...govinda.projections.dependency];
    record.focalSpacePosition.weightCalculation = calculateFocalSpaceWeight(Object.fromEntries(
      ['knowledge','causal','temporal','dependency'].map((field)=>[field,projectionEvidenceWeight(record.graphs[field])])
    ));
    return record;
  }

  project(record) {
    return clone({ space:record.focalSpacePosition, knowledge:record.graphs.knowledge, causal:record.graphs.causal, temporal:record.graphs.temporal, dependency:record.graphs.dependency, macro:record.macroContext, micro:record.microContext });
  }

  async focus(identity) {
    const record = await this.store.get(identity);
    if (!record) throw new Error(`Unknown focal artifact: ${identity}`);
    this.focusIdentity = identity;
    this.recompute(record);
    return this.project(record);
  }

  async execute(identity, transitionId, args = {}) {
    const record = await this.store.get(identity);
    if (!record) throw new Error(`Unknown artifact: ${identity}`);
    const before = clone(record);
    const applied = transitionApplication(before, transitionId, args);
    record.focalSpacePosition.currentState = {gate:applied.nextGate,bits:gateBits(applied.nextGate)};
    record.executionState = { status:'transitioned', gate:applied.nextGate, transition:transitionId, output:clone(applied.result) };
    const event = { sequence:record.historyReplay.length, type:'transition', transition:transitionId, operator:applied.operator.id, args:clone(args), before:{gate:before.canonicalAddress.gate,bits:gateBits(before.canonicalAddress.gate)}, after:{gate:applied.nextGate,bits:gateBits(applied.nextGate)}, result:clone(applied.result) };
    record.historyReplay.push(event);
    record.microContext.localStates.push({gate:applied.nextGate,bits:gateBits(applied.nextGate)});
    record.microContext.transitions.push(event.sequence);
    this.recompute(record);
    await this.store.put(record);
    return { event:clone(event), record:clone(record), view:this.project(record) };
  }

  async replay(identity, sequence) {
    const record = await this.store.get(identity);
    if (!record) throw new Error(`Unknown artifact: ${identity}`);
    const event = record.historyReplay.find((x)=>x.sequence===sequence && x.type==='transition');
    if (!event) throw new Error(`Unknown transition event: ${sequence}`);
    const synthetic = {...record, executionState:{gate:event.before.gate}};
    const applied = transitionApplication(synthetic, event.transition, event.args);
    const reproduced = stableStringify({gate:applied.nextGate,result:applied.result}) === stableStringify({gate:event.after.gate,result:event.result});
    return { reproduced, usedArtifactSnapshot:false, reanalyzed:false, transition:event.transition, operator:event.operator, expected:event.after, actual:{gate:applied.nextGate,bits:gateBits(applied.nextGate)} };
  }
}

