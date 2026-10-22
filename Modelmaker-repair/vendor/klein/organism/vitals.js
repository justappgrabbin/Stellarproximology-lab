// Pure Synthia Automata — organism: endogenous vitals (the internal condition the living loop senses)
//
// Five endogenous vitals, each in [0,1], computed DETERMINISTICALLY per
// logical tick from real engine observables (mesh metrics, derivation
// history, intent gaps, open questions, emergent channels, detector log).
// No wall-clock, no library randomness: every vital is a pure function of
// (previous vital state, observables collected since the previous sense), so
// the same engine history always yields the same vitals.
//
// The five vitals:
//   coherence — mesh stability. Drained by failed derivations and canon
//               conflicts; regenerates a little every tick the mesh stays up.
//   curiosity — novelty deficit. Rises when recent derivations repeat output
//               already seen (known patterns); relieved by novel outputs and
//               detector-reported emergence; a tiny boredom drift accrues on
//               silent ticks.
//   energy    — activity budget. Spent by actions (cost scales with chain
//               length, see actionCost); regenerates per tick.
//   tension   — unresolved gaps/conflicts: intent-engine gap records not yet
//               addressed by the loop + open questions + canon conflicts.
//   sociality — relational under-use. Rises while tools stay unexercised and
//               promoted channels sit idle; relieved by exercising tools and
//               by channel traffic (crossings whose use-count grew).
//
// PROVENANCE — every rate, threshold, hysteresis band, weight, and cost in
// VITAL_CONFIG is an IMPLEMENTATION_CHOICE: a tunable engineering constant
// invented for this module. Nothing here is a SOURCE_STATEMENT or a claim
// about the source corpus; the constants exist so the living loop has a
// legible, deterministic internal condition to sense. Adjust freely.

const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

export const VITAL_NAMES = Object.freeze(['coherence', 'curiosity', 'energy', 'tension', 'sociality']);

// polarity: 'low-bad' vitals (coherence, energy) raise a need when they fall
// BELOW threshold; 'high-bad' vitals (curiosity, tension, sociality) raise a
// need when they rise ABOVE threshold.
export const VITAL_CONFIG = Object.freeze({
  coherence: Object.freeze({
    polarity: 'low-bad',
    threshold: 0.35,
    hysteresis: 0.05,
    priority: 3,
    initial: 1,
    rates: Object.freeze({ regen: 0.05, errorPenalty: 0.15, conflictPenalty: 0.02, maxErrorCount: 3 }),
  }),
  curiosity: Object.freeze({
    polarity: 'high-bad',
    threshold: 0.6,
    hysteresis: 0.05,
    priority: 2,
    initial: 0.2,
    rates: Object.freeze({ repetitionGain: 0.1, noveltyRelief: 0.15, boredom: 0.005 }),
  }),
  energy: Object.freeze({
    polarity: 'low-bad',
    threshold: 0.25,
    hysteresis: 0.05,
    priority: 4,
    initial: 1,
    rates: Object.freeze({ regen: 0.08 }),
    costs: Object.freeze({ base: 0.1, perChainLink: 0.05 }),
  }),
  tension: Object.freeze({
    polarity: 'high-bad',
    threshold: 0.5,
    hysteresis: 0.05,
    priority: 5,
    initial: 0,
    rates: Object.freeze({ gapWeight: 0.15, questionWeight: 0.1, conflictWeight: 0.05, approach: 0.5 }),
  }),
  sociality: Object.freeze({
    polarity: 'high-bad',
    threshold: 0.7,
    hysteresis: 0.05,
    priority: 1,
    initial: 0.1,
    rates: Object.freeze({ idleToolGain: 0.02, channelRelief: 0.15, exerciseRelief: 0.1, maxReliefUnits: 2 }),
  }),
});

// IMPLEMENTATION_CHOICE: deltas smaller than this are reported as 'steady'.
const TREND_EPSILON = 1e-12;

const trendOf = (delta) => (delta > TREND_EPSILON ? 'rising' : delta < -TREND_EPSILON ? 'falling' : 'steady');

/** Shallow-merge user config over the frozen defaults (per vital), re-frozen. */
export function resolveVitalConfig(overrides = null) {
  if (!overrides || typeof overrides !== 'object') return VITAL_CONFIG;
  const merged = {};
  for (const name of VITAL_NAMES) {
    const base = VITAL_CONFIG[name];
    const over = overrides[name] && typeof overrides[name] === 'object' ? overrides[name] : {};
    merged[name] = Object.freeze({
      ...base,
      ...over,
      rates: Object.freeze({ ...base.rates, ...(over.rates || {}) }),
      ...(base.costs || over.costs
        ? { costs: Object.freeze({ ...(base.costs || {}), ...(over.costs || {}) }) }
        : {}),
    });
  }
  return Object.freeze(merged);
}

/**
 * Vitals — the organism's internal condition. Holds the five vital values and
 * the observables-tracking state needed to compute per-tick deltas from an
 * engine: how many derivations are new since the last sense, which output
 * hashes have been seen before, channel use-counts, tool usage, etc.
 *
 * The engine itself is only READ (runtime derivations, intent gaps, question
 * registry, channel crossings, detector log, mesh metrics). Feature-detection
 * everywhere: a bare or partially-wired engine still yields lawful vitals.
 */
export class Vitals {
  constructor({ config = null } = {}) {
    this.config = resolveVitalConfig(config);
    this._values = {};
    for (const name of VITAL_NAMES) this._values[name] = this.config[name].initial;
    // Observables tracking (all counter-derived, no wall-clock):
    this._lastDerivationCount = 0; // engine.runtime.derivations length at last sense
    this._lastEmergenceCount = 0; // engine.detector.emergenceLog length at last sense
    this._seenOutputHashes = new Set(); // derivation output hashes seen across the engine history
    this._channelUses = new Map(); // "a~b" -> last observed use count
    this._toolsUsed = new Set(); // tool ids that appear in any observed derivation
    this._seededHashes = false; // first sense backfills instead of counting history as "new"
  }

  /** Current raw values {coherence, curiosity, energy, tension, sociality}. */
  get values() {
    return { ...this._values };
  }

  /** The deterministic action cost: base + per extra chain link (chain length >= 1). */
  actionCost(chainLength = 1) {
    const costs = this.config.energy.costs;
    const links = Math.max(1, Math.floor(chainLength));
    return costs.base + costs.perChainLink * (links - 1);
  }

  /**
   * Spend energy on an action. Returns true when the budget covered the cost
   * (value is debited); false when energy is below cost (nothing is debited,
   * the caller must not act).
   */
  spendEnergy(cost) {
    if (this._values.energy < cost) return false;
    this._values.energy = clamp01(this._values.energy - cost);
    return true;
  }

  /**
   * Collect per-tick observables from the engine and advance the vital
   * dynamics by one sense. Deterministic: depends only on engine state and
   * this Vitals' own tracking state.
   *
   *   options.regen         apply the per-tick regeneration (true for the
   *                         tick's primary sense; false for the post-action
   *                         consequence sense, so a tick regenerates once)
   *   options.addressedGaps Set of intent-gap ids the organism has addressed
   *                         (tension counts only UNADDRESSED gaps)
   *
   * Returns the frozen snapshot {vital: {value, trend, lastInputs}}.
   */
  sense(engine, { regen = true, addressedGaps = null } = {}) {
    const obs = this._collect(engine, addressedGaps);
    const c = this.config;
    const v = this._values;
    const prev = { ...v };

    // coherence — mesh stability
    const co = c.coherence.rates;
    const coherenceDrain =
      co.errorPenalty * Math.min(obs.newFailures, co.maxErrorCount) +
      co.conflictPenalty * Math.min(obs.canonConflicts, 10);
    v.coherence = clamp01(v.coherence + (regen ? co.regen : 0) - coherenceDrain);

    // curiosity — novelty deficit. The primary feed is OUTPUT REPETITION vs
    // NOVELTY of what actually ran; the detector's novelty signal is reported
    // in lastInputs.detectorEmergent and consumed by the loop's consequence
    // scoring (the detector counts every not-explicitly-stored output as
    // emergent, which is too permissive to relieve curiosity on its own).
    const cu = c.curiosity.rates;
    if (obs.newCalls > 0) {
      const repetition = obs.repeatedOutputs / obs.newCalls;
      const novelty = obs.novelOutputs / obs.newCalls;
      v.curiosity = clamp01(v.curiosity + cu.repetitionGain * repetition - cu.noveltyRelief * novelty);
    } else if (regen) {
      v.curiosity = clamp01(v.curiosity + cu.boredom); // silent ticks accrue mild boredom
    }

    // energy — regen only (spending happens through spendEnergy between senses)
    if (regen) v.energy = clamp01(v.energy + c.energy.rates.regen);

    // tension — unresolved gaps/conflicts: exponential approach to the target
    const te = c.tension.rates;
    const tensionTarget = clamp01(
      te.gapWeight * obs.unaddressedGaps +
      te.questionWeight * obs.openQuestions +
      te.conflictWeight * Math.min(obs.canonConflicts, 10),
    );
    v.tension = clamp01(v.tension + (tensionTarget - v.tension) * te.approach);

    // sociality — relational under-use
    const so = c.sociality.rates;
    const idleFraction = obs.toolsTotal > 0 ? (obs.toolsTotal - obs.toolsUsedTotal) / obs.toolsTotal : 0;
    const reliefUnits = Math.min(obs.exercisedTools + obs.activeChannels, so.maxReliefUnits);
    v.sociality = clamp01(
      v.sociality +
      so.idleToolGain * idleFraction +
      so.idleToolGain * 0.5 * obs.idlePromoted -
      so.exerciseRelief * reliefUnits -
      so.channelRelief * Math.min(obs.activeChannels, so.maxReliefUnits),
    );

    const snapshot = {};
    for (const name of VITAL_NAMES) {
      snapshot[name] = Object.freeze({
        value: v[name],
        trend: trendOf(v[name] - prev[name]),
        lastInputs: Object.freeze({ ...obs }),
      });
    }
    return Object.freeze(snapshot);
  }

  /**
   * Read the engine's real observables. The FIRST sense backfills the
   * tracking baselines (derivation history, seen outputs, channel uses, tool
   * usage) without counting pre-existing history as "new" activity — vitals
   * measure what happens while the organism lives, not what happened before
   * it woke. (Exception: structural backlog — gaps, open questions, idle
   * tools — is always counted; it IS the condition sensed.)
   */
  _collect(engine, addressedGaps) {
    const derivations = (engine && engine.runtime && Array.isArray(engine.runtime.derivations))
      ? engine.runtime.derivations
      : [];

    // Backfill on first sense: everything already in the history is "seen".
    if (!this._seededHashes) {
      for (const d of derivations) this._noteDerivation(d);
      this._lastDerivationCount = derivations.length;
      this._lastEmergenceCount = this._emergenceLog(engine).length;
      this._seedChannels(engine);
      this._seededHashes = true;
    }

    const fresh = derivations.slice(this._lastDerivationCount);
    let newFailures = 0;
    let repeatedOutputs = 0;
    let novelOutputs = 0;
    const exercised = new Set();
    for (const d of fresh) {
      if (d && d.evaluation && d.evaluation.accepted === false) newFailures++;
      const hash = this._patternKey(d);
      if (hash !== null) {
        if (this._seenOutputHashes.has(hash)) repeatedOutputs++;
        else { this._seenOutputHashes.add(hash); novelOutputs++; }
      }
      for (const tool of (d && Array.isArray(d.primitives) ? d.primitives : [])) {
        this._toolsUsed.add(tool);
        exercised.add(tool);
      }
    }
    this._lastDerivationCount = derivations.length;

    // detector log: emergence records since last sense
    const emergenceLog = this._emergenceLog(engine);
    const detectorEmergent = emergenceLog
      .slice(this._lastEmergenceCount)
      .filter((r) => r && r.emergent === true).length;
    this._lastEmergenceCount = emergenceLog.length;

    // intent gaps (unaddressed = not yet handled by the organism)
    const gaps = (engine && engine.intent && Array.isArray(engine.intent.gaps)) ? engine.intent.gaps : [];
    const unaddressedGaps = addressedGaps instanceof Set
      ? gaps.filter((g) => g && !addressedGaps.has(g.id)).length
      : gaps.length;

    // open questions
    const openQuestions = (engine && engine.questions && typeof engine.questions.list === 'function')
      ? engine.questions.list({ status: 'open' }).length
      : 0;

    // canon conflicts (feature-detected: no canon registry is wired on the
    // stock engine, so this is normally 0 — the input exists for hosts that
    // mount one)
    const canonConflicts = this._canonConflicts(engine);

    // emergent channels: promoted crossings, idle ones, and ones whose
    // use-count grew since last sense (channel traffic = relational exercise)
    const crossings = (engine && engine.channels && typeof engine.channels.crossings === 'function')
      ? engine.channels.crossings()
      : [];
    let promotedChannels = 0;
    let idlePromoted = 0;
    let activeChannels = 0;
    for (const crossing of crossings) {
      const key = `${crossing.a}~${crossing.b}`;
      const uses = crossing.uses || 0;
      const prevUses = this._channelUses.has(key) ? this._channelUses.get(key) : uses;
      if (crossing.promoted) {
        promotedChannels++;
        if (uses <= prevUses) idlePromoted++;
      }
      if (uses > prevUses) activeChannels++;
      this._channelUses.set(key, uses);
    }

    // mesh stability surface
    let meshNodes = 0;
    let meshEdges = 0;
    let meshConnections = 0;
    if (engine && typeof engine.meshMetrics === 'function') {
      const metrics = engine.meshMetrics();
      meshConnections = metrics.connections || 0;
      for (const proj of Object.values(metrics.projections || {})) {
        meshNodes += proj.nodes || 0;
        meshEdges += proj.edges || 0;
      }
    }

    const toolsTotal = (engine && engine.toolsById && typeof engine.toolsById.size === 'number')
      ? engine.toolsById.size
      : Math.max(this._toolsUsed.size, 1);

    return {
      newCalls: fresh.length,
      newFailures,
      repeatedOutputs,
      novelOutputs,
      detectorEmergent,
      unaddressedGaps,
      totalGaps: gaps.length,
      openQuestions,
      canonConflicts,
      promotedChannels,
      idlePromoted,
      activeChannels,
      exercisedTools: exercised.size,
      toolsUsedTotal: this._toolsUsed.size,
      toolsTotal,
      meshNodes,
      meshEdges,
      meshConnections,
    };
  }

  // Pattern identity for repetition detection: the derivation's INPUT (the
  // call string) is the "pattern" — re-issuing a known call is repeating a
  // known pattern. (Outputs of stateful tools carry turn counters, so output
  // hashing would never detect repetition; input hashing detects exactly the
  // "recent episodes repeat known patterns" signal.) Falls back to a stable
  // structural hash of the output when the input is absent.
  _patternKey(derivation) {
    if (!derivation) return null;
    if (derivation.input !== null && derivation.input !== undefined) {
      return `in:${typeof derivation.input === 'string' ? derivation.input : this._fnvJson(derivation.input)}`;
    }
    const out = this._fnvJson(derivation.output);
    return out === null ? null : `out:${out}`;
  }

  _fnvJson(value) {
    try {
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      if (json === undefined) return null;
      let hash = 0x811c9dc5;
      for (let k = 0; k < json.length; k++) {
        hash ^= json.charCodeAt(k);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    } catch {
      return null;
    }
  }

  _noteDerivation(d) {
    const hash = this._patternKey(d);
    if (hash !== null) this._seenOutputHashes.add(hash);
    for (const tool of (d && Array.isArray(d.primitives) ? d.primitives : [])) this._toolsUsed.add(tool);
  }

  _seedChannels(engine) {
    const crossings = (engine && engine.channels && typeof engine.channels.crossings === 'function')
      ? engine.channels.crossings()
      : [];
    for (const crossing of crossings) this._channelUses.set(`${crossing.a}~${crossing.b}`, crossing.uses || 0);
  }

  _emergenceLog(engine) {
    return (engine && engine.detector && Array.isArray(engine.detector.emergenceLog))
      ? engine.detector.emergenceLog
      : [];
  }

  _canonConflicts(engine) {
    const canon = engine && (engine.canon || engine.canonRegistry);
    if (!canon) return 0;
    try {
      const entries = typeof canon.entries === 'function' ? canon.entries()
        : canon.entries instanceof Map ? [...canon.entries.values()]
        : Array.isArray(canon.entries) ? canon.entries
        : [];
      return entries.filter((e) => e && Array.isArray(e.conflicts) && e.conflicts.length > 0).length;
    } catch {
      return 0;
    }
  }
}

export default Vitals;

