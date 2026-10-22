// Pure Synthia Automata — engine: self-correcting loop (confidence tracking,
// disputes, explicit unknowns) over the OverrideRegistry.
// Ported from self_correcting_v1/src/core/{SelfCorrectingEngine,ConfidenceTracker,
// UnknownHandler}.ts (TS -> JS). The donor's SelfCorrectingEngine.ts was glue +
// console.log examples; its UNIQUE capability is the confidence/dispute/unknown
// machinery, ported here. We already have src/emergence/self-editor.js
// (versioned reversible edits as Derivations) — this module does NOT duplicate
// it; wireSelfEditorBridge() routes accepted corrections into the editor's
// append-only edit log so registry-level self-correction joins the same
// replayable audit trail.
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Date.now()/uuidv4 -> per-instance seq counters (dispute ids
//       `dispute:N`, history snapshots carry `seq` not timestamps).
//   F2. Donor time-decay ran on setInterval(applyTimeDecay) — wall-clock
//       driven and un-testable. Replaced by explicit tick(): each tick ages
//       every model by one tick; recency = max(0, 1 - ticksSinceUpdate *
//       decayRatePerTick). Deterministic and browser-safe.
//   F3. Donor EvidenceType/confidence formula kept verbatim
//       (verifiedRatio * 0.7 + evidenceBonus + 0.1, capped at 1).
//   F4. Donor singletons (confidenceTracker/unknownHandler exports) removed —
//       factory wiring only, via createSelfCorrectingSystem().
//   F5. UnknownHandler self-match: handleUnknown() registers a placeholder key
//       before analyzing, so its own exact-match check (donor
//       attemptPatternMatch) self-resolved every unknown at confidence 1.0.
//       Pattern matching now ignores UNKNOWN-layer-only keys.

import { OverrideRegistry, KNOWLEDGE_LAYER, EVIDENCE_TYPE } from './override-registry.js';

const SOURCE = 'handoff/02_safe_namespaced_additions/self_correcting_v1/src/core';

// ─── UNKNOWN vocabulary (donor enums, verbatim) ───
export const UNKNOWN_TYPE = Object.freeze({
  SYMBOL: 'symbol', CONCEPT: 'concept', COORDINATE: 'coordinate', RELATION: 'relation',
  PATTERN: 'pattern', STRUCTURE: 'structure', LANGUAGE: 'language', DOMAIN: 'domain',
});

export const UNKNOWN_STATUS = Object.freeze({
  NEW: 'new', ANALYZING: 'analyzing', HYPOTHESIZED: 'hypothesized',
  PENDING_REVIEW: 'pending_review', RESOLVED: 'resolved', REJECTED: 'rejected', ARCHIVED: 'archived',
});

// SOURCE_STATEMENT: ConfidenceTracker source-authority table.
const SOURCE_AUTHORITY = Object.freeze({
  system: 1.0, system_bootstrap: 1.0, user: 0.8, canon: 0.9, community: 0.6,
  inferred: 0.4, unknown: 0.0, unknown_handler: 0.1, auto_resolved: 0.5, dispute_resolution: 0.7,
});

// SOURCE_STATEMENT: ConfidenceTracker confidence weights.
const CONFIDENCE_WEIGHTS = Object.freeze({
  evidenceBased: 0.35, sourceAuthority: 0.25, consensus: 0.20, recency: 0.10, consistency: 0.10,
});

/**
 * ConfidenceTracker — per-key confidence models with a 5-component breakdown,
 * challenges (disputes) with accept/reject/merge resolution, revision rules,
 * and a recommendation ladder. Deterministic: seq counters + explicit tick().
 */
export class ConfidenceTracker {
  constructor(registry, { decayRatePerTick = 0.01, autoRecalculateThreshold = 0.1 } = {}) {
    if (!(registry instanceof OverrideRegistry)) throw new TypeError('ConfidenceTracker requires an OverrideRegistry');
    this.registry = registry;
    this.models = new Map(); // key -> model
    this.revisionRules = defaultRevisionRules();
    this.decayRatePerTick = decayRatePerTick; // F2: was 1% per wall-clock day
    this.autoRecalculateThreshold = autoRecalculateThreshold;
    this._seq = 0;
    this._tick = 0;
    this._listeners = new Map();
    registry.on('override', ({ key, confidence }) => {
      this.trackConfidence(key, confidence, 'user_override');
    });
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this._listeners.get(event) || []) fn(payload);
  }

  // ─── TRACK ───
  trackConfidence(key, confidence, trigger = 'auto_recalc', reason = '') {
    const model = this.models.get(key) || this._createModel(key);
    const entry = this._getEntry(key);
    model.evidenceBased = this.calculateEvidenceConfidence(entry?.evidence || []);
    model.sourceAuthority = this.calculateSourceAuthority(entry?.source || 'unknown');
    model.consensus = this.calculateConsensus(key);
    model.consistency = this.calculateConsistency(key);
    model.recency = 1.0;
    const old = model.overall;
    model.overall = this._computeOverall(model);
    model.revisionCount++;
    model.lastUpdateTick = this._tick;
    model.history.push({ seq: ++this._seq, overall: model.overall, evidenceCount: (entry?.evidence || []).length, reason, trigger });
    this.models.set(key, model);
    if (Math.abs(model.overall - old) > this.autoRecalculateThreshold) {
      this.emit('confidenceShift', { key, oldConfidence: old, newConfidence: model.overall });
    }
    this.applyRules(key, model, trigger);
    return model;
  }

  addEvidence(key, evidence) {
    const entries = this.registry.entries.get(key);
    const active = entries?.find((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN);
    if (!active) return false;
    active.evidence.push({ id: `ev:${++this._seq}`, type: evidence.type || EVIDENCE_TYPE.OBSERVATION, source: evidence.source || 'auto', content: evidence.content || JSON.stringify(evidence), weight: evidence.weight ?? 0.5, seq: this._seq, verified: Boolean(evidence.verified) });
    this.trackConfidence(key, active.confidence, 'new_evidence', 'Evidence added');
    return true;
  }

  // ─── DISPUTES (donor challenge / resolveDispute, verbatim semantics) ───
  challenge(key, proposedValue, challengerEvidence = [], challenger = 'user') {
    const current = this.registry.get(key);
    if (!current || current.isUnknown) return null;
    const dispute = {
      id: `dispute:${++this._seq}`, // F1: was dispute_<uuid>
      challenger,
      proposedValue,
      confidence: this.calculateEvidenceConfidence(challengerEvidence),
      evidence: challengerEvidence,
      seq: this._seq,
      status: 'open',
      resolution: null,
    };
    const model = this.models.get(key) || this._createModel(key);
    model.disputes = model.disputes || [];
    model.disputes.push(dispute);
    model.disputed = true;
    this.models.set(key, model);
    this.emit('disputeRaised', { key, dispute, currentValue: current.value });
    this.applyRules(key, model, 'dispute_raised');
    return dispute;
  }

  resolveDispute(key, disputeId, resolution, resolutionValue = undefined) {
    const model = this.models.get(key);
    if (!model || !model.disputes) return false;
    const dispute = model.disputes.find((d) => d.id === disputeId);
    if (!dispute) return false;
    dispute.status = 'resolved';
    dispute.resolution = resolution;

    if (resolution === 'accept') {
      this.registry.set(key, resolutionValue !== undefined ? resolutionValue : dispute.proposedValue, KNOWLEDGE_LAYER.COMPUTED, {
        source: `dispute_resolution:${disputeId}`,
        confidence: dispute.confidence,
        evidence: dispute.evidence,
      });
      this.trackConfidence(key, dispute.confidence, 'auto_recalc', `Dispute ${disputeId} accepted`);
    } else if (resolution === 'merge') {
      const current = this.registry.get(key);
      if (current && !current.isUnknown) {
        const merged = mergeValues(current.value, resolutionValue !== undefined ? resolutionValue : dispute.proposedValue);
        this.registry.set(key, merged, KNOWLEDGE_LAYER.COMPUTED, {
          source: `dispute_resolution:${disputeId}`,
          confidence: (current.confidence + dispute.confidence) / 2,
          evidence: dispute.evidence,
        });
      }
    }
    // 'reject': just mark resolved.

    if (model.disputes.every((d) => d.status !== 'open')) model.disputed = false;
    this.emit('disputeResolved', { key, disputeId, resolution, dispute });
    return true;
  }

  // ─── CONFIDENCE COMPONENTS (donor formulas verbatim) ───
  calculateEvidenceConfidence(evidence) {
    if (!evidence || evidence.length === 0) return 0.5;
    let totalWeight = 0, verifiedWeight = 0;
    for (const e of evidence) {
      totalWeight += Number(e.weight) || 0;
      if (e.verified) verifiedWeight += Number(e.weight) || 0;
    }
    const evidenceBonus = Math.min(evidence.length / 5, 0.2);
    const verifiedRatio = totalWeight > 0 ? verifiedWeight / totalWeight : 0;
    return Math.min(verifiedRatio * 0.7 + evidenceBonus + 0.1, 1.0);
  }

  calculateSourceAuthority(source) {
    return SOURCE_AUTHORITY[source] ?? 0.5;
  }

  calculateConsensus(key) {
    const entry = this.registry.get(key);
    if (!entry || entry.isUnknown) return 0;
    const all = this.registry.query(key);
    const active = all.filter((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN);
    if (active.length <= 1) return 1.0;
    const same = active.filter((e) => JSON.stringify(e.value) === JSON.stringify(entry.rawValue)).length;
    return same / active.length;
  }

  calculateConsistency(key) {
    const entry = this.registry.get(key);
    if (!entry || entry.isUnknown) return 0;
    return 0.9; // donor placeholder (domain checks were a TODO); kept verbatim
  }

  _computeOverall(model) {
    return model.evidenceBased * CONFIDENCE_WEIGHTS.evidenceBased
      + model.sourceAuthority * CONFIDENCE_WEIGHTS.sourceAuthority
      + model.consensus * CONFIDENCE_WEIGHTS.consensus
      + model.recency * CONFIDENCE_WEIGHTS.recency
      + model.consistency * CONFIDENCE_WEIGHTS.consistency;
  }

  // ─── TIME DECAY (F2: explicit deterministic tick, was setInterval) ───
  tick(n = 1) {
    for (let i = 0; i < n; i++) {
      this._tick++;
      for (const [key, model] of this.models) {
        const age = this._tick - model.lastUpdateTick;
        model.recency = Math.max(0, 1 - age * this.decayRatePerTick);
        const old = model.overall;
        model.overall = this._computeOverall(model);
        if (Math.abs(model.overall - old) > this.autoRecalculateThreshold) {
          this.emit('decayTriggered', { key, oldConfidence: old, newConfidence: model.overall });
          this.applyRules(key, model, 'time_decay');
        }
      }
    }
  }

  // ─── REVISION RULES (donor's five defaults, verbatim) ───
  applyRules(key, model, trigger) {
    const fired = [];
    const rules = [...this.revisionRules].filter((r) => r.active).sort((a, b) => a.priority - b.priority);
    for (const rule of rules) {
      if (this._checkRuleCondition(rule.condition, model, trigger)) {
        fired.push({ ruleId: rule.id, action: rule.action });
        this.emit('ruleFired', { key, rule, trigger });
      }
    }
    return fired;
  }

  _checkRuleCondition(condition, model, trigger) {
    switch (condition.type) {
      case 'confidence_drop': {
        const last = model.history[model.history.length - 1];
        const prev = model.history[model.history.length - 2];
        return Boolean(last && prev && prev.overall - last.overall >= condition.threshold);
      }
      case 'new_evidence': return trigger === 'new_evidence';
      case 'evidence_contradicted': return trigger === 'evidence_contradicted';
      case 'time_elapsed': return trigger === 'time_decay';
      case 'dispute_raised': return trigger === 'dispute_raised';
      default: return false;
    }
  }

  // ─── REPORTS ───
  generateRecommendation(key) {
    const model = this.models.get(key);
    const overall = model ? model.overall : 0;
    if (overall >= 0.9) return 'Highly reliable. Suitable for critical decisions.';
    if (overall >= 0.7) return 'Generally reliable. Verify for important use cases.';
    if (overall >= 0.5) return 'Moderate confidence. Consider gathering more evidence.';
    if (overall >= 0.3) return 'Low confidence. Treat as tentative. Seek verification.';
    return 'Very low confidence. Do not rely on this information.';
  }

  getConfidenceReport(key) {
    const model = this.models.get(key);
    if (!model) return null;
    return {
      key,
      confidence: model.overall,
      breakdown: {
        evidenceBased: model.evidenceBased,
        sourceAuthority: model.sourceAuthority,
        consensus: model.consensus,
        recency: model.recency,
        consistency: model.consistency,
      },
      revisionCount: model.revisionCount,
      disputed: model.disputed,
      disputes: (model.disputes || []).map((d) => ({ id: d.id, status: d.status, resolution: d.resolution })),
      recommendation: this.generateRecommendation(key),
    };
  }

  getStats() {
    let high = 0, medium = 0, low = 0, disputed = 0;
    for (const model of this.models.values()) {
      if (model.overall >= 0.7) high++;
      else if (model.overall >= 0.4) medium++;
      else low++;
      if (model.disputed) disputed++;
    }
    return { totalTracked: this.models.size, highConfidence: high, mediumConfidence: medium, lowConfidence: low, disputed, tick: this._tick };
  }

  _createModel(key) {
    return {
      evidenceBased: 0.5, sourceAuthority: 0.5, consensus: 1.0, recency: 1.0, consistency: 0.9,
      overall: 0.5,
      history: [{ seq: ++this._seq, overall: 0.5, evidenceCount: 0, reason: 'Initial confidence model created', trigger: 'auto_recalc' }],
      lastUpdateTick: this._tick,
      revisionCount: 0,
      disputed: false,
      disputes: [],
    };
  }

  _getEntry(key) {
    const entries = this.registry.entries.get(key);
    if (!entries) return null;
    return entries.find((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN) || null;
  }
}

/** Donor mergeValues: objects spread (b wins), arrays concat, primitives take b. */
export function mergeValues(a, b) {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return { ...a, ...b };
  }
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  return b;
}

/** Donor's five default revision rules (times converted to ticks, F2). */
export function defaultRevisionRules() {
  return [
    { id: 'rule_confidence_drop', name: 'Confidence Drop Alert', condition: { type: 'confidence_drop', threshold: 0.2 }, action: { type: 'flag_review' }, priority: 1, active: true },
    { id: 'rule_new_evidence', name: 'New Evidence Auto-Recalculate', condition: { type: 'new_evidence', evidenceCount: 1 }, action: { type: 'recalculate' }, priority: 2, active: true },
    { id: 'rule_evidence_contradicted', name: 'Contradicted Evidence Review', condition: { type: 'evidence_contradicted' }, action: { type: 'flag_review', parameters: { urgency: 'high' } }, priority: 1, active: true },
    { id: 'rule_time_decay', name: 'Time Decay Recalculation', condition: { type: 'time_elapsed', ticks: 7 }, action: { type: 'recalculate' }, priority: 3, active: true },
    { id: 'rule_dispute_raised', name: 'Dispute Resolution', condition: { type: 'dispute_raised' }, action: { type: 'notify_user', parameters: { message: 'Knowledge dispute detected' } }, priority: 1, active: true },
  ];
}

/**
 * UnknownHandler — explicit UNKNOWN handling (donor UnknownHandler.ts): an
 * unknown value is a first-class object with classification attempts,
 * hypotheses, and a status ladder; it is never silently forced into a false
 * binary (repair contract §7). Auto-resolves into the registry at the
 * INFERRED layer only when a hypothesis clears autoResolveThreshold.
 */
export class UnknownHandler {
  constructor(registry, { autoResolveThreshold = 0.85 } = {}) {
    if (!(registry instanceof OverrideRegistry)) throw new TypeError('UnknownHandler requires an OverrideRegistry');
    this.registry = registry;
    this.autoResolveThreshold = autoResolveThreshold;
    this.unknowns = new Map();   // id -> UnknownObject
    this.rawIndex = new Map();   // rawValue -> [id]
    this._seq = 0;
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this._listeners.get(event) || []) fn(payload);
  }

  handleUnknown(rawValue, context = '') {
    const raw = String(rawValue);
    const existing = (this.rawIndex.get(raw) || []).map((id) => this.unknowns.get(id));
    if (existing.length > 0) {
      const u = existing[0];
      u.frequency++;
      u.lastEncounteredSeq = ++this._seq;
      return u;
    }
    const unknown = {
      id: `unknown:${++this._seq}`, // F1: was uuid
      type: UNKNOWN_TYPE.CONCEPT,
      rawValue: raw,
      context,
      classificationAttempts: [],
      evidence: [],
      hypotheses: [],
      status: UNKNOWN_STATUS.NEW,
      resolvedTo: null,
      resolutionConfidence: 0,
      frequency: 1,
      lastEncounteredSeq: this._seq,
      relatedUnknowns: [],
    };
    this.unknowns.set(unknown.id, unknown);
    if (!this.rawIndex.has(raw)) this.rawIndex.set(raw, []);
    this.rawIndex.get(raw).push(unknown.id);
    this.registry.unknown(raw, context); // placeholder in the registry queue (never shadows values — registry F2)
    this.emit('unknownEncountered', unknown);
    this.analyze(unknown);
    return unknown;
  }

  analyze(unknown) {
    unknown.status = UNKNOWN_STATUS.ANALYZING;

    // 1. pattern match against existing registry keys (exact / fuzzy / pattern-derived)
    const match = this._attemptPatternMatch(unknown);
    if (match) {
      unknown.classificationAttempts.push({
        classifier: 'pattern_matcher', proposedType: match.type, confidence: match.confidence,
        seq: ++this._seq, result: match.confidence >= this.autoResolveThreshold ? 'success' : 'uncertain',
        reasoning: `Matched existing key ${match.key}`,
      });
      if (match.confidence >= this.autoResolveThreshold) {
        unknown.status = UNKNOWN_STATUS.RESOLVED;
        unknown.resolvedTo = match.key;
        unknown.resolutionConfidence = match.confidence;
        this.emit('resolved', { unknown, key: match.key });
        return unknown;
      }
    }

    // 2. structural hypotheses (gate.N / codon.N shapes, numeric, CJK)
    const structural = this._analyzeStructure(unknown);
    if (structural) {
      for (const h of structural.hypotheses) {
        unknown.hypotheses.push({
          id: `hyp:${++this._seq}`,
          proposedMeaning: h.meaning,
          proposedDomain: h.domain,
          confidence: h.confidence,
          supportingEvidence: [],
          contradictingEvidence: [],
          seq: this._seq,
          status: 'active',
        });
      }
      unknown.classificationAttempts.push({
        classifier: 'structural_analyzer', proposedType: structural.type, confidence: structural.confidence,
        seq: this._seq, result: 'uncertain', reasoning: structural.reasoning,
      });
    }

    if (unknown.hypotheses.length > 0) unknown.status = UNKNOWN_STATUS.HYPOTHESIZED;
    this.emit('analyzed', unknown);
    this._evaluateHypotheses(unknown);
    return unknown;
  }

  _attemptPatternMatch(unknown) {
    const raw = unknown.rawValue;
    // F5 fix: ignore keys whose only entries are UNKNOWN-layer placeholders —
    // otherwise handleUnknown() exact-matches the placeholder it just created
    // and every unknown self-resolves at confidence 1.0.
    const allKeys = this.registry.keys().filter((k) =>
      (this.registry.entries.get(k) || []).some((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN));
    if (allKeys.includes(raw)) return { key: raw, type: 'exact', confidence: 1.0 };
    let best = null;
    for (const key of allKeys) {
      const similarity = stringSimilarity(raw, key);
      if (similarity > 0.8 && (!best || similarity > best.similarity)) best = { key, similarity };
    }
    if (best && best.similarity > 0.85) return { key: best.key, type: 'fuzzy_match', confidence: best.similarity };
    const m = raw.match(/^(\w+)\.(\d+)(?:\.(\w+))?$/);
    if (m) {
      const candidateKey = `${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`;
      if (allKeys.includes(candidateKey)) return { key: candidateKey, type: 'pattern_derived', confidence: 0.9 };
    }
    return null;
  }

  _analyzeStructure(unknown) {
    const raw = unknown.rawValue;
    const hypotheses = [];
    if (/^gate\.\d+/i.test(raw) || /^gate\s*\d+/i.test(raw)) {
      hypotheses.push({ meaning: `Human Design gate reference: ${raw}`, domain: 'gates', confidence: 0.7 });
    }
    if (/^codon\.\d+/i.test(raw)) {
      hypotheses.push({ meaning: `Codon reference: ${raw}`, domain: 'codons', confidence: 0.7 });
    }
    if (/^\d+$/.test(raw)) {
      hypotheses.push({ meaning: `Numeric value: ${raw}`, domain: 'general', confidence: 0.4 });
    }
    if (/[一-鿿]/.test(raw)) {
      hypotheses.push({ meaning: `Chinese text: ${raw}`, domain: 'yijing', confidence: 0.5 });
    }
    if (hypotheses.length === 0) return null;
    return {
      type: UNKNOWN_TYPE.CONCEPT,
      confidence: Math.max(...hypotheses.map((h) => h.confidence)) * 0.8,
      reasoning: `Structural patterns suggest: ${hypotheses.map((h) => h.domain).join(', ')}`,
      hypotheses,
    };
  }

  _evaluateHypotheses(unknown) {
    if (unknown.hypotheses.length === 0) return;
    const best = [...unknown.hypotheses].sort((a, b) => b.confidence - a.confidence)[0];
    if (best.confidence >= this.autoResolveThreshold) {
      this.resolveUnknown(unknown, best);
    } else if (best.confidence >= 0.5) {
      unknown.status = UNKNOWN_STATUS.PENDING_REVIEW;
      this.emit('pendingReview', { unknown, bestHypothesis: best });
    }
  }

  resolveUnknown(unknown, hypothesis, userConfirmed = false) {
    const key = this._generateRegistryKey(unknown, hypothesis);
    this.registry.set(key, hypothesis.proposedMeaning, KNOWLEDGE_LAYER.INFERRED, {
      source: 'unknown_handler',
      confidence: hypothesis.confidence,
      evidence: [{
        id: `ev:${++this._seq}`, type: EVIDENCE_TYPE.OBSERVATION, source: 'unknown_analysis',
        content: `Resolved from unknown: ${unknown.rawValue}`, weight: 0.7, seq: this._seq, verified: userConfirmed,
      }],
      tags: ['auto_resolved', 'from_unknown', unknown.type],
    });
    unknown.status = UNKNOWN_STATUS.RESOLVED;
    unknown.resolvedTo = key;
    unknown.resolutionConfidence = hypothesis.confidence;
    this.emit('resolved', { unknown, key, hypothesis });
    return true;
  }

  userResolve(unknownId, key, value, confidence = 1.0) {
    const unknown = this.unknowns.get(unknownId);
    if (!unknown) return false;
    this.registry.set(key, value, KNOWLEDGE_LAYER.USER, {
      source: 'user_override',
      confidence,
      evidence: [{
        id: `ev:${++this._seq}`, type: EVIDENCE_TYPE.INTUITION, source: 'user',
        content: `User resolved unknown "${unknown.rawValue}" to ${key} = ${JSON.stringify(value)}`,
        weight: 1.0, seq: this._seq, verified: true,
      }],
      tags: ['user_resolved', 'from_unknown'],
    });
    unknown.status = UNKNOWN_STATUS.RESOLVED;
    unknown.resolvedTo = key;
    unknown.resolutionConfidence = confidence;
    this.emit('resolved', { unknown, key });
    return true;
  }

  _generateRegistryKey(unknown, hypothesis) {
    const slug = unknown.rawValue.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
    return `${hypothesis.proposedDomain}.${slug}`;
  }

  getUnknownQueue() { return [...this.unknowns.values()].filter((u) => u.status !== UNKNOWN_STATUS.RESOLVED); }

  getStats() {
    const all = [...this.unknowns.values()];
    const byStatus = {};
    for (const u of all) byStatus[u.status] = (byStatus[u.status] || 0) + 1;
    return { total: all.length, byStatus, pending: all.filter((u) => u.status === UNKNOWN_STATUS.PENDING_REVIEW).length };
  }
}

/** Deterministic bigram (Dice) similarity for the fuzzy matcher (donor used the same idea). */
export function stringSimilarity(a, b) {
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}

/**
 * Bridge to src/emergence/self-editor.js: accepted/merged dispute resolutions
 * (value-level self-corrections) are recorded as `add_rule` edits in the
 * editor's versioned, reversible, derivation-hashed edit log — corrections
 * join the same audit trail as code-level self-modification instead of living
 * in a parallel, non-replayable store. Returns an unsubscribe function.
 */
export function wireSelfEditorBridge(tracker, editor) {
  if (!editor || typeof editor.addRule !== 'function') {
    throw new TypeError('wireSelfEditorBridge requires a SelfEditor-like editor (addRule)');
  }
  const handler = ({ key, disputeId, resolution, dispute }) => {
    if (resolution !== 'accept' && resolution !== 'merge') return;
    editor.addRule(
      { kind: 'value-correction', key, disputeId, resolution },
      { kind: 'registry-override', layer: KNOWLEDGE_LAYER.COMPUTED },
      [{ kind: 'dispute', source: `dispute_resolution:${disputeId}`, confidence: dispute?.confidence ?? null }],
    );
  };
  tracker.on('disputeResolved', handler);
  return () => {
    const list = tracker._listeners.get('disputeResolved') || [];
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  };
}

/**
 * Donor SelfCorrectingEngine.ts wiring, minus console.log examples: one
 * factory that creates the registry + tracker + unknown handler (and
 * optionally bridges a SelfEditor) and reports combined stats.
 */
export function createSelfCorrectingSystem({ registry = null, editor = null } = {}) {
  const reg = registry || new OverrideRegistry();
  const confidenceTracker = new ConfidenceTracker(reg);
  const unknownHandler = new UnknownHandler(reg);
  const unbridge = editor ? wireSelfEditorBridge(confidenceTracker, editor) : null;
  return {
    registry: reg,
    confidenceTracker,
    unknownHandler,
    unbridge,
    getSystemStats() {
      return {
        registry: reg.getStats(),
        unknown: unknownHandler.getStats(),
        confidence: confidenceTracker.getStats(),
      };
    },
  };
}

export const SELF_CORRECTING_PROVENANCE = Object.freeze({
  source: `${SOURCE}/{ConfidenceTracker,UnknownHandler,SelfCorrectingEngine}.ts`,
  confidenceFormula: 'SOURCE_STATEMENT (verifiedRatio*0.7 + bonus + 0.1, cap 1; 5-component weighted overall)',
  disputes: 'SOURCE_STATEMENT (challenge/accept/reject/merge semantics)',
  unknowns: 'SOURCE_STATEMENT (status ladder, auto-resolve threshold 0.85, structural hypotheses)',
  decay: 'F2 fix: explicit tick() replaces wall-clock setInterval decay',
  bridge: 'IMPLEMENTATION_CHOICE: accepted corrections recorded as SelfEditor add_rule edits (no duplicated versioning)',
});

export default createSelfCorrectingSystem;

