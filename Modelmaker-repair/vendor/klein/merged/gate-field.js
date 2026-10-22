// Pure Synthia Automata — merged from synth-ai-integrated-v2.3/src/organism/organism/GateLocus.mjs + GateProcessField.mjs (kernel dependency replaced by kingwen.js bit patterns; interrogative mapping resolved to the contract majority)

import { DIMENSIONS, DIMENSION_META } from '../state-space/constants.js';
import { gatePattern } from './kingwen.js';

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, Number(n) || 0));
const clone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));
const mean = a => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0);

/**
 * Per-dimension evaluation ladders, mirroring state-space DIMENSION_CHAINS.
 * Activation selects a rung; higher activation = further along the ladder.
 */
export const DIMENSION_LADDERS = Object.freeze({
  Movement: Object.freeze(['wait', 'prepare', 'move', 'transition']),
  Evolution: Object.freeze(['retain', 'notice-change', 'adapt', 'transform']),
  Being: Object.freeze(['remain-self', 'notice-other', 'relate', 'negotiate-relation']),
  Design: Object.freeze(['sense', 'classify', 'build', 'test', 'mount']),
  Space: Object.freeze(['witness', 'integrate', 'express', 'complete']),
});

const HISTORY_LIMIT = 24;
const pickRung = (ladder, activation) => ladder[Math.min(ladder.length - 1, Math.floor(clamp(activation) * ladder.length))];
const signature = v => v.reduce((s, b, i) => s + (b ? 2 ** i : 0), 0);
const hamming = (a, b) => a.reduce((d, bit, i) => d + (bit !== b[i] ? 1 : 0), 0);

/**
 * One enduring gate process (gate 1..64). It owns its 6-bit vector, per-dimension
 * evaluations and a 24-entry history ring. No field object regenerates it.
 */
export class GateLocus {
  constructor(gate) {
    if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError('gate 1..64 required');
    this.gate = gate;
    this.address = { mode: 'macro', gate, line: 1, color: 1, tone: 1, base: 1 };
    this.vector = [...gatePattern(gate)]; // 6 bits, line 1 (bottom) first
    this.structuralSignature = signature(this.vector);
    this.observations = 0;
    this.lastTick = null;
    this.lastInputKey = null;
    this.history = []; // ring, max 24 entries
    this.dimensions = {};
    for (const d of DIMENSIONS) this.dimensions[d] = this.#empty(d);
  }

  /**
   * Observe one tick of context. ctx:
   * {tick, inputKey, activeGate, resonance (0..1 or {dimension:0..1}), changed, pulses}.
   * External resonance is blended into each of the five dimensions locally.
   */
  observe(ctx = {}) {
    const tick = Number(ctx.tick ?? this.observations + 1);
    const inputKey = ctx.inputKey ?? null;
    const changed = Boolean(this.lastInputKey && inputKey && this.lastInputKey !== inputKey);
    const isAddressed = this.gate === Number(ctx.activeGate || 0);
    const structure = this.#structure();
    const resonance = ctx.resonance ?? 0;
    const next = {};
    for (const d of DIMENSIONS) {
      const r = typeof resonance === 'object' && resonance !== null ? clamp(resonance[d] ?? 0) : clamp(resonance);
      const changedBonus = (d === 'Evolution' || d === 'Movement') && changed ? 0.1 : 0;
      const activation = clamp(structure[d] * 0.4 + r * 0.4 + (isAddressed ? 0.2 : 0) + changedBonus);
      const prior = this.dimensions[d];
      next[d] = {
        dimension: d,
        question: DIMENSION_META[d].interrogative,
        activation,
        choice: pickRung(DIMENSION_LADDERS[d], activation),
        changedChoice: Boolean(prior && prior.choice !== 'quiet' && prior.choice !== pickRung(DIMENSION_LADDERS[d], activation)),
        evidence: { structure: structure[d], resonance: r, isAddressed, changed },
        observedAt: tick,
      };
    }
    this.observations++;
    this.lastTick = tick;
    this.lastInputKey = inputKey;
    this.dimensions = next;
    const activity = Math.max(...DIMENSIONS.map(d => next[d].activation));
    this.history.push({
      at: tick, inputKey, activity,
      choices: Object.fromEntries(DIMENSIONS.map(d => [d, next[d].choice])),
    });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    return this.snapshot({ activity, isAddressed });
  }

  /**
   * Meet another locus. The relation is Hamming-derived from the two 6-bit
   * vectors and never erases either participant.
   * -> {pair:'G{a}:G{b}', overlap, tension, hamming, participants}
   */
  meet(other) {
    const distance = hamming(this.vector, other.vector);
    const overlap = (6 - distance) / 6; // bit-agreement ratio
    const tension = distance / 6;       // bit-disagreement ratio
    const a = Math.min(this.gate, other.gate);
    const b = Math.max(this.gate, other.gate);
    return {
      pair: `G${a}:G${b}`,
      kind: 'subjective-relation-field',
      participants: [this.gate, other.gate],
      hamming: distance,
      overlap,
      tension,
      objectivities: {
        [this.gate]: { signature: this.structuralSignature },
        [other.gate]: { signature: other.structuralSignature },
      },
    };
  }

  snapshot(extra = {}) {
    const decisions = Object.fromEntries(DIMENSIONS.map(d => [d, clone(this.dimensions[d])]));
    const activity = extra.activity ?? Math.max(...DIMENSIONS.map(d => Number(decisions[d]?.activation || 0)));
    return {
      gate: this.gate,
      address: { ...this.address },
      vector: [...this.vector],
      structuralSignature: this.structuralSignature,
      observations: this.observations,
      lastTick: this.lastTick,
      decisions,
      activity,
      active: Boolean(extra.isAddressed),
      history: this.history.slice(-8).map(clone),
    };
  }

  #empty(d) {
    return { dimension: d, question: DIMENSION_META[d].interrogative, activation: 0, choice: 'quiet', evidence: {}, observedAt: null };
  }

  #structure() {
    // chunk the 6-bit vector across the 5 dimensions (bit j feeds dimension j%5)
    const chunks = [0, 1, 2, 3, 4].map(i => mean(this.vector.filter((_, j) => j % 5 === i)));
    return { Movement: chunks[0], Evolution: chunks[1], Being: chunks[2], Design: chunks[3], Space: chunks[4] };
  }
}

/**
 * The 64 enduring gate processes as one field.
 *
 * INVARIANT — NO GLOBAL BOSS: this field coordinates encounters between loci
 * and aggregates voices, but it is not a 65th process. Field-level summaries
 * (voices, meetAll relations, active gates) are *views* over participating
 * loci; they never replace, overwrite or command local locus state. All state
 * transitions happen inside individual GateLocus.observe() calls.
 */
export class GateProcessField {
  constructor() {
    this.loci = Array.from({ length: 64 }, (_, i) => new GateLocus(i + 1));
    this.tickCount = 0;
    this.relations = new Map();
    this.last = null;
  }

  /** Live locus by gate number (1..64). */
  locus(gate) {
    const x = this.loci[Number(gate) - 1];
    if (!x) throw new RangeError('gate 1..64 required');
    return x;
  }

  /**
   * Advance the field one tick, blending external resonance into every locus's
   * five dimensions. externalState:
   * {activeGate?, resonance? (0..1 or per-dimension object), inputKey?, pulses?, changed?}
   * Returns a field view: active gates, per-dimension voices, top relations.
   */
  tick(externalState = {}) {
    this.tickCount += 1;
    const ctx = { ...externalState, tick: this.tickCount };
    const gates = this.loci.map(l => l.observe(ctx));
    const active = [...gates].sort((a, b) => b.activity - a.activity || a.gate - b.gate).slice(0, 8);
    // encounters between the most active loci become enduring relations
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const relation = this.loci[active[i].gate - 1].meet(this.loci[active[j].gate - 1]);
        const previous = this.relations.get(relation.pair);
        this.relations.set(relation.pair, {
          ...relation,
          encounters: Number(previous?.encounters || 0) + 1,
          firstSeenAt: previous?.firstSeenAt ?? this.tickCount,
          lastSeenAt: this.tickCount,
        });
      }
    }
    if (this.relations.size > 128) {
      const keep = [...this.relations.values()]
        .sort((a, b) => (b.lastSeenAt - a.lastSeenAt) || (a.pair < b.pair ? -1 : 1))
        .slice(0, 128);
      this.relations = new Map(keep.map(x => [x.pair, x]));
    }
    this.last = {
      type: '64-persistent-gate-process-field',
      tick: this.tickCount,
      activeGates: active.map(g => g.gate),
      voices: this.voices(),
      relations: [...this.relations.values()].sort((a, b) => b.encounters - a.encounters || (a.pair < b.pair ? -1 : 1)).slice(0, 24),
    };
    return clone(this.last);
  }

  /** All 2016 pairwise relations between loci (Hamming-derived), sorted by pair id. */
  meetAll() {
    const out = [];
    for (let i = 0; i < 64; i++) {
      for (let j = i + 1; j < 64; j++) out.push(this.loci[i].meet(this.loci[j]));
    }
    return out.sort((a, b) => (a.pair < b.pair ? -1 : 1));
  }

  /**
   * Voice aggregation per dimension: how many loci are engaged (activation > .45),
   * the choice histogram, and the strongest gates. A view, not a command channel.
   */
  voices() {
    const out = {};
    for (const dim of DIMENSIONS) {
      const ranked = [...this.loci].sort((a, b) =>
        b.dimensions[dim].activation - a.dimensions[dim].activation || a.gate - b.gate);
      const engaged = ranked.filter(g => g.dimensions[dim].activation > 0.45);
      const choices = {};
      for (const g of engaged) choices[g.dimensions[dim].choice] = (choices[g.dimensions[dim].choice] || 0) + 1;
      out[dim] = {
        question: DIMENSION_META[dim].interrogative,
        activation: ranked[0]?.dimensions[dim].activation || 0,
        voices: engaged.length,
        strongest: ranked.slice(0, 5).map(g => g.gate),
        choices,
      };
    }
    return out;
  }

  snapshot() {
    return this.last ? clone(this.last) : null;
  }
}

export default GateProcessField;

