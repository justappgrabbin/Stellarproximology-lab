// Pure Synthia Automata — organism: the endogenous living loop
//
// LivingLoop closes the autonomy gap: the organism EXISTS (constructed over a
// SynthiaAutomata engine), SENSES its internal condition (organism/vitals.js),
// DEVELOPS NEEDS when a vital crosses its threshold (with hysteresis),
// INITIATES ACTION ITSELF (an endogenous engine.call — never prompted from
// outside), EVALUATES THE CONSEQUENCE (did the target vital improve? did the
// detector report novelty/emergence?), LEARNS (per-need policy weights), and
// RECORDS an autobiographical, hash-chained episode log (same chaining idiom
// as emergence/self-editor.js: each entry carries prevHash + hash).
//
// ENDOGENOUS_CAP determinism guarantee:
//   same seed + same exogenous engine.call schedule + same tick count
//   => byte-identical getState() and episode log.
//   No wall-clock, no library randomness anywhere in this module; the
//   only nondeterminism source is a seeded mulberry32 (note: the task brief
//   said src/engine/constants.js — the mulberry32 actually lives in
//   src/state-space/constants.js, which is what the rest of the codebase
//   imports; we follow the codebase).
//
// ORIGIN PASSTHROUGH (no edits to existing files): endogenous actions are
// executed as engine.call(input, context) where context carries
//   { origin: 'endogenous', needId, tick, strategy }.
// engine.call already stores `context` on the Derivation (synthia.js:
// `context` is a Derivation field and participates in the derivation hash),
// so the origin threads through intake -> derivation WITHOUT touching
// synthia.js/intake.js. This module is the "adapter layer": callers verify
// endogenous provenance via derivation.context.origin === 'endogenous'.
//
// Need -> initiative mapping (IMPLEMENTATION_CHOICE, see LOOP_PROVENANCE):
//   tension   -> proposal  (remediation probe at an intent-gap's target tool,
//                           marking the gap addressed) | question | experiment
//   curiosity -> experiment (Predictor/enumerateLattice self-experiment on a
//                           vitals-derived state, novel probe input) | exercise
//   sociality -> exercise  (least-recently-used tool(s), chained in pairs to
//                           stir channel traffic) | experiment
//   coherence -> question  (attempt an open question) | experiment
//   energy    -> rest      (no call; dormancy regenerates the budget)
// Strategy choice within a vital is policy-weighted: weights start at 1.0,
// gain on positive consequence, lose on non-positive consequence.
//
// Consequence scoring in [-1,1] (IMPLEMENTATION_CHOICE):
//   score = clamp( 0.6 * clamp(4 * vitalImprovement)
//                + (acted ? (accepted ? +0.2 : -0.2) : 0)
//                + (detectorEmergent ? +0.2 : 0) )
// where vitalImprovement is the signed change of the target vital across the
// post-action sense (positive = moved toward health for that vital's
// polarity).

import { Vitals, VITAL_NAMES } from './vitals.js';
import { hashObject, stableStringify } from '../engine/derivation.js';
import { mulberry32 } from '../state-space/constants.js';
import { TOOL_IDS } from '../state-space/lexicon.js';
import { enumerateLattice } from '../engine/prediction.js';
import { CONTROLLED_SENTENCES } from '../experiments/scale/phase-corpora.js';

const freeze = (x) => Object.freeze(x);

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

const clamp = (lo, hi, x) => (x < lo ? lo : x > hi ? hi : x);

// IMPLEMENTATION_CHOICE: floating-point dust guard. A vital sitting an
// ulp below its threshold is not a need — intensity below this epsilon
// never raises one. (Without this, sociality at threshold + 1e-16 would
// surface as an active need of intensity ~0.)
const LOOP_EPSILON = 1e-9;

/** Provenance registry: every behavioral parameter here is an engineering choice, not a source claim. */
export const LOOP_PROVENANCE = freeze({
  strategies: freeze({ status: 'IMPLEMENTATION_CHOICE', note: 'need->initiative mapping (tension->proposal, curiosity->experiment, sociality->exercise, coherence->question, energy->rest) is designed for this module' }),
  consequenceScoring: freeze({ status: 'IMPLEMENTATION_CHOICE', note: 'weights 0.6 vital-improvement / 0.2 acceptance / 0.2 detector-emergence, clamped to [-1,1]' }),
  policyLearning: freeze({ status: 'IMPLEMENTATION_CHOICE', note: 'weight += learningRate * score, clamped to [0.1, 3]; selection = max weight, ties broken by strategy preference order' }),
  originPassthrough: freeze({ status: 'IMPLEMENTATION_CHOICE', note: "origin:'endogenous' threaded through engine.call's existing context parameter; no existing files edited" }),
  episodeChaining: freeze({ status: 'IMPLEMENTATION_CHOICE', note: 'episode hash = hashObject(episode sans hash), prevHash links the chain — same idiom as self-editor edit derivations' }),
});

export const LOOP_DEFAULTS = freeze({
  learningRate: 0.2,
  weightMin: 0.1,
  weightMax: 3,
  strategies: freeze({
    tension: freeze(['proposal', 'question', 'experiment']),
    curiosity: freeze(['experiment', 'exercise']),
    sociality: freeze(['exercise', 'experiment']),
    coherence: freeze(['question', 'experiment']),
    energy: freeze(['rest']),
  }),
  allStrategies: freeze(['proposal', 'question', 'experiment', 'exercise', 'rest']),
});

/**
 * Probe inputs for exercising each registered tool through the tool-call
 * grammar. Best-effort: some tools (e.g. iching-grammar, whose grammar-level
 * input never reaches input.lines) cannot accept via engine.call — exercising
 * them still produces a lawful derivation, and the consequence scorer lets
 * the loop LEARN which probes pay off. Probe text comes from the phase-2
 * corpora (src/experiments/scale/phase-corpora.js).
 */
const TEXT_TOOLS = [
  'autoling-lite', 'diseminer-lite', 'language-contact', 'historical-monte-carlo',
  'autonovel', 'messy', 'conversation', 'computational-grammar-coder', 'autoling', 'diseminer',
];
const PROBES = {
  'klein-analogy': () => 'klein-analogy "boy girl woman"',
  'iching-grammar': () => 'iching-grammar 1 0 1 0 1 0',
  success: () => 'success \'{"operation":"define","personId":"loop","purpose":{"statement":"self-model probe","indicators":[{"id":"i1","name":"n"}]}}\'',
  'browser-form': () => 'browser-form inspect-page \'{"page":{"id":"pg1","url":"about:blank","fields":[]}}\'',
  'research-browser': () => 'research-browser create \'{"project":{"id":"p1","title":"living probe"}}\'',
  'morph-mir': (text) => `morph-mir ingest '{"name":"probe.txt","content":"${text}"}'`,
};
function probeFor(tool, text) {
  if (PROBES[tool]) return PROBES[tool](text);
  if (TEXT_TOOLS.includes(tool)) return `${tool} "${text}"`;
  return `${tool} "${text}"`;
}

/** Verify an episode log's hash chain. Returns {valid, episodes, brokenAt}. */
export function verifyEpisodeChain(log) {
  let prevHash = null;
  for (let k = 0; k < log.length; k++) {
    const episode = log[k];
    const { hash, ...payload } = episode;
    if (episode.prevHash !== prevHash) return { valid: false, episodes: k, brokenAt: k, reason: 'prevHash' };
    if (hashObject(payload) !== hash) return { valid: false, episodes: k, brokenAt: k, reason: 'hash' };
    prevHash = hash;
  }
  return { valid: true, episodes: log.length, brokenAt: null };
}

export class LivingLoop {
  /**
   * @param engine  a SynthiaAutomata (or any object with the same observable
   *                surface: runtime.derivations, call(), intent, detector,
   *                questions, channels, meshMetrics, toolsById)
   * @param options { seed, config: { vitals, learningRate, weightMin, weightMax, strategies } }
   */
  constructor(engine, { seed = 1, config = {} } = {}) {
    if (!engine || typeof engine.call !== 'function') {
      throw new TypeError('LivingLoop requires an engine with call(input, context)');
    }
    this.engine = engine;
    this.seed = seed >>> 0;
    this.config = freeze({
      learningRate: config.learningRate ?? LOOP_DEFAULTS.learningRate,
      weightMin: config.weightMin ?? LOOP_DEFAULTS.weightMin,
      weightMax: config.weightMax ?? LOOP_DEFAULTS.weightMax,
      strategies: config.strategies || LOOP_DEFAULTS.strategies,
    });
    this.vitals = new Vitals({ config: config.vitals || null });

    this._tick = 0;
    this._rng = mulberry32(this.seed);
    this._needSeq = 0;
    this._episodeSeq = 0;
    this._needs = new Map(); // vital -> active Need {id, vital, intensity, tick}
    this._weights = new Map(); // "vital:strategy" -> policy weight
    for (const vital of VITAL_NAMES) {
      for (const strategy of LOOP_DEFAULTS.allStrategies) this._weights.set(`${vital}:${strategy}`, 1);
    }
    // Optional initial policy-weight seeding ({'vital:strategy': w}) — a
    // host/testing hook; defaults stay 1.0.
    if (config.policyWeights && typeof config.policyWeights === 'object') {
      for (const [key, w] of Object.entries(config.policyWeights)) {
        if (this._weights.has(key) && Number.isFinite(w)) this._weights.set(key, w);
      }
    }
    this._initialPolicyWeights = config.policyWeights || null; // replay must re-seed identically
    this._addressedGaps = new Set(); // intent-gap ids the loop has acted on
    this._toolLastUsed = new Map(TOOL_IDS.map((id) => [id, -1]));
    this._corpusCursor = 0;
    this._questionCursor = 0;

    this.log = []; // hash-chained autobiographical episode log (append-only)
    this._logHead = null;
    this._vitalHistory = []; // cheap per-tick snapshots (dormancy record)
    this._lastSnapshot = null;
    this._ownDerivationIds = new Set();
    this._lastScanCount = 0;
    this.exogenousLog = []; // observed external engine.calls {tick, input, context} — replay schedule
  }

  /** Advance ONE logical tick: sense -> need -> initiative -> consequence -> learn -> record. */
  tick() {
    this._tick++;
    const snapshot = this.vitals.sense(this.engine, { regen: true, addressedGaps: this._addressedGaps });
    this._lastSnapshot = snapshot;
    this._scanDerivations();
    this._vitalHistory.push(freeze({ tick: this._tick, values: freeze(this.vitals.values) }));

    this._updateNeeds(snapshot);
    const need = this._topNeed();
    if (!need) {
      // Quiescent tick: dormancy is valid and cheap — nothing but the vital
      // snapshot above is recorded.
      return freeze({ tick: this._tick, quiescent: true, vitals: freeze(this.vitals.values) });
    }

    const episode = this._act(need, snapshot);
    return freeze({ tick: this._tick, quiescent: false, episode });
  }

  /** Current logical tick. */
  get tickCount() {
    return this._tick;
  }

  /** The cheap dormancy record: one frozen {tick, values} snapshot per tick. */
  get vitalHistory() {
    return this._vitalHistory.slice();
  }

  /** Frozen snapshot for a UI panel (rendering/heartbeat is the orchestrator's job). */
  getState() {
    return deepFreeze({
      tick: this._tick,
      vitals: this._lastSnapshot ? JSON.parse(stableStringify(this._lastSnapshot)) : null,
      activeNeed: this._topNeed() ? { ...this._topNeed() } : null,
      policyWeights: Object.fromEntries(this._weights),
      episodeCount: this.log.length,
      logHead: this._logHead,
    });
  }

  /**
   * Verify and re-execute a log: (1) the hash chain must verify; (2) a fresh
   * engine + fresh loop with the same seed, re-running the same number of
   * ticks with the same exogenous schedule, must reproduce the log byte-for-
   * byte (double-run determinism).
   *
   * options.exogenous: replay schedule, entries {tick, input, context} for
   *   external engine.calls, or {tick, apply(engine)} for any other external
   *   stimulation (e.g. direct intent.observe gap injection). Defaults to the
   *   exogenous schedule THIS loop observed (this.exogenousLog).
   * options.engineFactory: defaults to `new engine.constructor()`.
   */
  replay(log = this.log, { exogenous = null, engineFactory = null } = {}) {
    const chain = verifyEpisodeChain(log);
    const schedule = exogenous === null ? this.exogenousLog : exogenous;
    const maxTick = log.reduce((m, e) => Math.max(m, e.tick), 0);
    const freshEngine = engineFactory ? engineFactory() : new this.engine.constructor();
    const fresh = new LivingLoop(freshEngine, {
      seed: this.seed,
      config: {
        vitals: this.vitals.config,
        learningRate: this.config.learningRate,
        weightMin: this.config.weightMin,
        weightMax: this.config.weightMax,
        strategies: this.config.strategies,
        policyWeights: this._initialPolicyWeights,
      },
    });
    for (let t = 1; t <= maxTick; t++) {
      for (const ex of schedule.filter((e) => e.tick === t)) {
        if (typeof ex.apply === 'function') ex.apply(freshEngine);
        else freshEngine.call(ex.input, ex.context || {});
      }
      fresh.tick();
    }
    const reproduced = stableStringify(fresh.log.map((e) => ({ ...e }))) === stableStringify(log.map((e) => ({ ...e })));
    return freeze({
      valid: chain.valid,
      chain,
      reproduced,
      episodes: log.length,
      replayedEpisodes: fresh.log.length,
      logHash: hashObject(log.map((e) => ({ ...e }))),
      replayHash: hashObject(fresh.log.map((e) => ({ ...e }))),
    });
  }

  // ---------------- internals ----------------

  /** Track tool usage + observe exogenous calls (derivations the loop did not cause). */
  _scanDerivations() {
    const derivations = (this.engine.runtime && Array.isArray(this.engine.runtime.derivations))
      ? this.engine.runtime.derivations
      : [];
    const fresh = derivations.slice(this._lastScanCount);
    this._lastScanCount = derivations.length;
    for (const d of fresh) {
      for (const tool of (d && Array.isArray(d.primitives) ? d.primitives : [])) {
        if (this._toolLastUsed.has(tool)) this._toolLastUsed.set(tool, this._tick);
      }
      if (d && d.id && !this._ownDerivationIds.has(d.id)) {
        this.exogenousLog.push(freeze({ tick: this._tick, input: d.input, context: d.context || {} }));
      }
    }
  }

  _updateNeeds(snapshot) {
    const config = this.vitals.config;
    for (const vital of VITAL_NAMES) {
      const cfg = config[vital];
      const value = snapshot[vital].value;
      const active = this._needs.get(vital);
      if (active) {
        const cleared = cfg.polarity === 'high-bad'
          ? value <= cfg.threshold - cfg.hysteresis
          : value >= cfg.threshold + cfg.hysteresis;
        if (cleared) this._needs.delete(vital);
        else active.intensity = this._intensity(cfg, value);
      } else {
        const crossed = cfg.polarity === 'high-bad' ? value > cfg.threshold : value < cfg.threshold;
        if (crossed) {
          const intensity = this._intensity(cfg, value);
          if (intensity > LOOP_EPSILON) {
            this._needs.set(vital, {
              id: `need-${++this._needSeq}`,
              vital,
              intensity,
              tick: this._tick,
            });
          }
        }
      }
    }
  }

  _intensity(cfg, value) {
    const raw = cfg.polarity === 'high-bad'
      ? (value - cfg.threshold) / (1 - cfg.threshold)
      : (cfg.threshold - value) / cfg.threshold;
    return clamp(0, 1, raw);
  }

  /** Rank active needs by intensity x priority; ties: higher priority, then vital order. */
  _topNeed() {
    let best = null;
    let bestRank = -1;
    for (const need of this._needs.values()) {
      const priority = this.vitals.config[need.vital].priority;
      const rank = need.intensity * priority;
      if (
        rank > bestRank ||
        (rank === bestRank && best && (
          priority > this.vitals.config[best.vital].priority ||
          (priority === this.vitals.config[best.vital].priority &&
            VITAL_NAMES.indexOf(need.vital) < VITAL_NAMES.indexOf(best.vital))
        ))
      ) {
        best = need;
        bestRank = rank;
      }
    }
    return best ? freeze({ ...best }) : null;
  }

  _strategyAvailable(strategy) {
    if (strategy === 'proposal') {
      const proposals = (this.engine.intent && Array.isArray(this.engine.intent.proposals))
        ? this.engine.intent.proposals
        : [];
      return proposals.some((p) => p && p.applied === null);
    }
    if (strategy === 'question') {
      return this.engine.questions && typeof this.engine.questions.list === 'function'
        ? this.engine.questions.list({ status: 'open' }).length > 0
        : false;
    }
    return true; // experiment / exercise / rest are always available
  }

  /** Policy-weighted strategy choice for a vital: max weight, ties -> preference order. */
  _chooseStrategy(vital) {
    const order = [...(this.config.strategies[vital] || ['experiment'])];
    const available = order.filter((s) => this._strategyAvailable(s));
    const candidates = available.length ? available : ['rest'];
    let best = candidates[0];
    let bestWeight = this._weights.get(`${vital}:${best}`) ?? 1;
    for (const strategy of candidates.slice(1)) {
      const weight = this._weights.get(`${vital}:${strategy}`) ?? 1;
      if (weight > bestWeight) {
        best = strategy;
        bestWeight = weight;
      }
    }
    return best;
  }

  _corpusText() {
    const sentences = CONTROLLED_SENTENCES.length ? CONTROLLED_SENTENCES : [{ text: 'the organism breathes' }];
    const text = sentences[this._corpusCursor % sentences.length].text.replace(/"/g, '');
    this._corpusCursor++;
    return text;
  }

  /** Translate a need into an endogenous action plan. */
  _plan(need) {
    const vital = need.vital;
    const strategy = this._chooseStrategy(vital);

    if (strategy === 'rest') {
      return freeze({ kind: 'rest', strategy, vital });
    }

    if (strategy === 'proposal') {
      const proposals = this.engine.intent.proposals
        .filter((p) => p && p.applied === null)
        .sort((a, b) => (b.confidence - a.confidence) || (a.seq - b.seq));
      const proposal = proposals[0];
      const target = proposal && proposal.spec && (proposal.spec.target || proposal.spec.grownToolId);
      const tool = TOOL_IDS.includes(target) ? target : 'conversation';
      if (proposal && proposal.gapId) this._addressedGaps.add(proposal.gapId);
      return freeze({
        kind: 'call',
        strategy,
        vital,
        input: probeFor(tool, this._corpusText()),
        chainLength: 1,
        meta: freeze({ proposalId: proposal ? proposal.id : null, gapId: proposal ? proposal.gapId : null, target: tool }),
      });
    }

    if (strategy === 'question') {
      const open = this.engine.questions.list({ status: 'open' })
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const question = open[this._questionCursor % open.length];
      this._questionCursor++;
      return freeze({
        kind: 'call',
        strategy,
        vital,
        input: `conversation "open question ${question.id} ${question.name}"`,
        chainLength: 1,
        meta: freeze({ questionId: question.id }),
      });
    }

    if (strategy === 'experiment') {
      // Self-experiment: derive a state from the current vitals, enumerate its
      // lawful next states (Predictor machinery), probe the chosen successor.
      const v = this.vitals.values;
      const base = v.coherence + v.curiosity + v.energy + v.tension + v.sociality; // in [0,5]
      const gate = 1 + Math.min(63, Math.floor((base / 5) * 64));
      const changing = 1 + Math.floor(this._rng() * 3); // 1..3 moving lines
      const lattice = enumerateLattice(gate, changing, { maxDepth: 1 });
      const successors = lattice.nodes.filter((n) => n.depth === 1);
      const pool = successors.length ? successors : lattice.nodes;
      const node = pool[Math.floor(this._rng() * pool.length)] || lattice.nodes[0];
      return freeze({
        kind: 'call',
        strategy,
        vital,
        input: `conversation "self-experiment g${gate} k${changing} to g${node.gate} tick ${this._tick}"`,
        chainLength: 1,
        meta: freeze({ experiment: freeze({ from: gate, changing, to: node.gate, latticeNodes: lattice.nodes.length }) }),
      });
    }

    // exercise: least-recently-used tool(s); sociality chains a PAIR to stir
    // channel traffic (relational exercise).
    const lru = [...TOOL_IDS].sort((a, b) => {
      const ua = this._toolLastUsed.get(a) ?? -1;
      const ub = this._toolLastUsed.get(b) ?? -1;
      if (ua !== ub) return ua - ub;
      return TOOL_IDS.indexOf(a) - TOOL_IDS.indexOf(b);
    });
    if (vital === 'sociality' && lru.length >= 2) {
      const a = lru[0];
      const b = lru[1];
      return freeze({
        kind: 'call',
        strategy,
        vital,
        input: `${probeFor(a, this._corpusText())} then ${probeFor(b, this._corpusText())}`,
        chainLength: 2,
        meta: freeze({ tools: freeze([a, b]) }),
      });
    }
    return freeze({
      kind: 'call',
      strategy,
      vital,
      input: probeFor(lru[0], this._corpusText()),
      chainLength: 1,
      meta: freeze({ tools: freeze([lru[0]]) }),
    });
  }

  /** Initiative -> execution -> consequence -> learn -> record. */
  _act(need, snapshot) {
    const plan = this._plan(need);
    const before = snapshot[need.vital].value;

    let action;
    let derivation = null;
    let accepted = null;
    let emergent = false;
    const acted = plan.kind === 'call';

    if (plan.kind === 'rest') {
      action = { kind: 'rest', strategy: plan.strategy };
    } else {
      const cost = this.vitals.actionCost(plan.chainLength);
      if (this.vitals.values.energy < cost) {
        // The loop NEVER acts below the action cost.
        action = { kind: 'skipped', reason: 'insufficient_energy', cost, input: plan.input, strategy: plan.strategy };
      } else {
        const energyBefore = this.vitals.values.energy;
        this.vitals.spendEnergy(cost);
        derivation = this.engine.call(plan.input, {
          origin: 'endogenous',
          needId: need.id,
          tick: this._tick,
          strategy: plan.strategy,
        });
        if (derivation && derivation.id) this._ownDerivationIds.add(derivation.id);
        accepted = derivation && derivation.evaluation ? derivation.evaluation.accepted === true : null;
        emergent = this._wasEmergent(derivation && derivation.id);
        action = {
          kind: 'call',
          strategy: plan.strategy,
          input: plan.input,
          chainLength: plan.chainLength,
          cost,
          energyBefore,
          meta: plan.meta || null,
        };
      }
    }

    // Consequence: sense again (no regen — a tick regenerates exactly once)
    // and measure whether the target vital moved toward health.
    const after = this.vitals.sense(this.engine, { regen: false, addressedGaps: this._addressedGaps });
    this._lastSnapshot = after;
    const vitalAfter = after[need.vital].value;
    const cfg = this.vitals.config[need.vital];
    const improvement = cfg.polarity === 'low-bad' ? vitalAfter - before : before - vitalAfter;
    let score = 0.6 * clamp(-1, 1, improvement * 4);
    if (acted && action.kind === 'call') score += accepted === false ? -0.2 : 0.2;
    // Emergence bonus only counts when the action actually succeeded — a
    // rejected derivation's "emergent" verdict is not a consequence win.
    if (emergent && accepted !== false) score += 0.2;
    score = clamp(-1, 1, score);

    // Learn: per-need policy weight update.
    const strategyKey = `${need.vital}:${plan.strategy}`;
    const weight = this._weights.get(strategyKey) ?? 1;
    const newWeight = clamp(this.config.weightMin, this.config.weightMax, weight + this.config.learningRate * score);
    this._weights.set(strategyKey, newWeight);

    // Record: append the hash-chained episode (self-editor chaining idiom).
    const seq = ++this._episodeSeq;
    const payload = {
      id: `ep-${String(seq).padStart(4, '0')}`,
      seq,
      tick: this._tick,
      origin: 'endogenous',
      vitals: this.vitals.values,
      need: { id: need.id, vital: need.vital, intensity: need.intensity, tick: need.tick },
      needId: need.id,
      action,
      result: derivation
        ? { derivationId: derivation.id, accepted, emergent }
        : null,
      consequence: {
        score,
        vital: need.vital,
        vitalBefore: before,
        vitalAfter,
        policyWeight: newWeight,
      },
      derivationId: derivation ? derivation.id : null,
      prevHash: this._logHead,
    };
    const episode = deepFreeze({ ...payload, hash: hashObject(payload) });
    this.log.push(episode);
    this._logHead = episode.hash;
    return episode;
  }

  _wasEmergent(derivationId) {
    if (!derivationId) return false;
    const log = (this.engine.detector && Array.isArray(this.engine.detector.emergenceLog))
      ? this.engine.detector.emergenceLog
      : [];
    return log.some((r) => r && r.derivationId === derivationId && r.emergent === true);
  }
}

export default LivingLoop;

