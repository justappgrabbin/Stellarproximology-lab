// Pure Synthia Automata — engine: ResonanceNetwork (relational feedback field).
// Ported from Synthia-OS-v2.0.0-COHERENT/resonance/ResonanceNetwork.mjs
// (byte-identical in synth-ai-integrated-v2.3). It does not declare truth or
// choose goals; it records observed interaction outcomes and derives bounded
// relationship weights — a capability our mesh (src/mesh/*) does not have
// (AutomataMesh routes automata; StateMesh broadcasts qualified packets;
// neither learns edge weights from observations).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. clock default was ()=>Date.now() and event ids were
//       `resonance:${clock()}:${n}` — wall-clock ids. Replaced with a
//       per-instance seq counter; the `clock` injection point is kept for
//       callers that genuinely want a time axis (default: deterministic seq).

const clone = (x) => (x == null ? x : structuredClone(x));
const clamp = (v, min = -1, max = 1) => Math.max(min, Math.min(max, Number(v) || 0));

export class ResonanceNetwork {
  constructor({ memory = null, learningRate = 0.15, clock = null } = {}) {
    this.memory = memory;
    this.learningRate = Math.max(0.01, Math.min(0.5, learningRate));
    this._eventSeq = 0; // F1: event ids
    this._clockSeq = 0; // F1: logical clock ticks (separate from event ids)
    this.clock = clock || (() => ++this._clockSeq);
    this.nodes = new Map();
    this.edges = new Map();
    this.events = [];
  }

  addNode(id, meta = {}) {
    id = String(id);
    const n = { id, meta: clone(meta), at: this.clock() };
    this.nodes.set(id, n);
    return clone(n);
  }

  #edgeId(a, b) { return [String(a), String(b)].sort().join('<->'); }

  connect(a, b, { weight = 0, evidence = [] } = {}) {
    if (!this.nodes.has(String(a))) this.addNode(a);
    if (!this.nodes.has(String(b))) this.addNode(b);
    const id = this.#edgeId(a, b);
    const e = { id, a: String(a), b: String(b), weight: clamp(weight), observations: 0, evidence: [...evidence], updatedAt: this.clock() };
    this.edges.set(id, e);
    return clone(e);
  }

  observe({ a, b, outcome = 0, type = 'interaction', evidence = null, verified = true } = {}) {
    const id = this.#edgeId(a, b);
    if (!this.edges.has(id)) this.connect(a, b);
    const e = this.edges.get(id);
    const target = clamp(outcome);
    if (verified) {
      e.weight = clamp((1 - this.learningRate) * e.weight + this.learningRate * target);
      e.observations++;
    }
    const event = {
      id: `resonance:${++this._eventSeq}`, // F1: was `resonance:${clock()}:${n}`
      at: this.clock(), edgeId: id, type: String(type), outcome: target,
      verified: Boolean(verified), evidence: clone(evidence), weightAfter: e.weight,
    };
    e.evidence.push(event.id);
    e.updatedAt = this.clock();
    this.events.push(event);
    this.memory?.remember?.('resonance-events', event);
    return { event: clone(event), edge: clone(e) };
  }

  score(ids = []) {
    const set = new Set(ids.map(String));
    const relevant = [...this.edges.values()].filter((e) => set.has(e.a) && set.has(e.b));
    if (!relevant.length) return { score: 0, observations: 0, edges: [] };
    const totalObs = relevant.reduce((n, e) => n + e.observations, 0);
    const weighted = relevant.reduce((n, e) => n + e.weight * Math.max(1, e.observations), 0);
    const denom = relevant.reduce((n, e) => n + Math.max(1, e.observations), 0);
    return { score: weighted / (denom || 1), observations: totalObs, edges: relevant.map(clone) };
  }

  snapshot() {
    return {
      nodes: [...this.nodes.values()].map(clone),
      edges: [...this.edges.values()].map(clone),
      events: this.events.slice(-128).map(clone),
    };
  }
}

export const RESONANCE_PROVENANCE = Object.freeze({
  source: 'Synthia-OS-v2.0.0-COHERENT/resonance/ResonanceNetwork.mjs',
  semantics: 'SOURCE_STATEMENT (clamped exponential-weight-update, verbatim)',
  f1: 'clock default Date.now -> deterministic seq counter (injection point kept)',
});

export default ResonanceNetwork;

