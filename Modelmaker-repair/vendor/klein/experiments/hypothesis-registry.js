// Pure Synthia Automata — experiments: formal hypothesis registry (Appendix B).
// Ported from pure-synthia-pass3.zip src/hypotheses/hypothesis.js (identical in
// phase1/phase2/pass3 originals; dropped by the repaired lineages).
//
// H_i = (claim, nullHypothesis, metric, test, threshold, evidence, status).
// Donor rationale kept verbatim: "No module should contain logic equivalent to
// candidateMapping.isTrue = true." This complements state-space/claim-status.js:
// the claim system tags epistemic status; this registry tracks the LIFECYCLE of
// the project's six core hypotheses (H1-H6) against their pre-registered
// thresholds. PROMOTION_GATE (claim-status.js) governs any status move toward
// EMPIRICALLY_SUPPORTED; this registry's 'supported' is a threshold verdict,
// not a promotion.
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Date.now() in addEvidence -> per-hypothesis evidence seq counter
//       (deterministic; field renamed `seq`).

export const HYPOTHESIS_STATUS = Object.freeze([
  'unobserved',
  'observed',
  'inferred',
  'hypothesized',
  'tested',
  'supported',
  'rejected',
  'inconclusive',
]);

export class Hypothesis {
  constructor({
    id,
    claim,
    nullHypothesis,
    metric,
    test,
    threshold,
    evidence = [],
    status = 'hypothesized',
  }) {
    this.id = id;
    this.claim = claim;
    this.nullHypothesis = nullHypothesis;
    this.metric = metric;
    this.test = test;
    this.threshold = threshold;
    this.evidence = [...evidence];
    this.status = status;
    this._evidenceSeq = evidence.length; // F1: deterministic counter
  }

  addEvidence(evidenceId, supports = true) {
    this.evidence.push({ evidenceId, supports, seq: ++this._evidenceSeq }); // F1: was timestamp: Date.now()
  }

  evaluate(result) {
    // Compare result against threshold, update status (donor rule, verbatim).
    if (result >= this.threshold) {
      this.status = 'supported';
    } else if (result <= this.threshold * 0.5) {
      this.status = 'rejected';
    } else {
      this.status = 'inconclusive';
    }
    return this.status;
  }

  toJSON() {
    return {
      id: this.id,
      claim: this.claim,
      nullHypothesis: this.nullHypothesis,
      metric: this.metric,
      test: this.test,
      threshold: this.threshold,
      evidence: this.evidence,
      status: this.status,
    };
  }

  static fromJSON(data) {
    return new Hypothesis(data);
  }
}

export class HypothesisRegistry {
  constructor({ seedCore = true } = {}) {
    this.hypotheses = new Map();
    if (seedCore) this.initializeCoreHypotheses();
  }

  // The six core hypotheses, verbatim from the donor (SOURCE_STATEMENT:
  // hypothesis.js initializeCoreHypotheses; claims/nulls/metrics/thresholds).
  initializeCoreHypotheses() {
    // H1 — Recursive Generativity
    this.register(new Hypothesis({
      id: 'H1',
      claim: 'A finite primitive vocabulary P and finite operator vocabulary O can generate valid higher-order structures that were not explicitly stored.',
      nullHypothesis: 'Successful generation requires dedicated representations whose stored complexity grows with target structure complexity.',
      metric: 'novelCompositionRate',
      test: 'unseen_composition',
      threshold: 0.7,
    }));
    // H2 — Cross-Scale Operator Invariance
    this.register(new Hypothesis({
      id: 'H2',
      claim: 'At least some discovered operators retain structurally equivalent behavior when operands are replaced by objects from another scale.',
      nullHypothesis: 'Each scale requires unrelated special-case operators.',
      metric: 'operatorReuse',
      test: 'cross_scale_holdout',
      threshold: 0.5,
    }));
    // H3 — Address Utility
    this.register(new Hypothesis({
      id: 'H3',
      claim: 'Canonical recursive addresses provide measurable advantages over control-address systems.',
      nullHypothesis: 'Canonical addressing provides no advantage over arbitrary labels.',
      metric: 'addressPerformanceDelta',
      test: 'address_ablation',
      threshold: 0.1,
    }));
    // H4 — Dimensional Correspondence
    this.register(new Hypothesis({
      id: 'H4',
      claim: 'Candidate mappings involving Movement, Evolution, Being, Design, and Space explain measurable structure better than alternatives.',
      nullHypothesis: 'Dimensional mappings fail to outperform reasonable alternative mappings.',
      metric: 'mappingPerformanceDelta',
      test: 'dimensional_evaluation',
      threshold: 0.1,
    }));
    // H5 — Compression
    this.register(new Hypothesis({
      id: 'H5',
      claim: 'Reusable primitives and operators provide shorter representation of observed structures without unacceptable loss.',
      nullHypothesis: 'Generated structures require essentially as much stored information as direct representation.',
      metric: 'compressionGain',
      test: 'compression_test',
      threshold: 0.15,
    }));
    // H6 — Candidate Numerical Laws
    this.register(new Hypothesis({
      id: 'H6',
      claim: 'Proposed numerical relationships (e.g., W(g,l) = g^l) correlate with measurable runtime quantities.',
      nullHypothesis: 'Proposed numerical relationships are coincidences without generalization.',
      metric: 'numericalCorrelation',
      test: 'runtime_measurement',
      threshold: 0.6,
    }));
  }

  register(hypothesis) {
    this.hypotheses.set(hypothesis.id, hypothesis);
    return this;
  }

  get(id) {
    return this.hypotheses.get(id) || null;
  }

  list() {
    return [...this.hypotheses.values()];
  }

  byStatus(status) {
    return this.list().filter((h) => h.status === status);
  }

  toJSON() {
    return this.list().map((h) => h.toJSON());
  }

  static fromJSON(data) {
    const reg = new HypothesisRegistry({ seedCore: false });
    for (const h of data) reg.register(Hypothesis.fromJSON(h));
    return reg;
  }
}

export const HYPOTHESIS_REGISTRY_PROVENANCE = Object.freeze({
  source: 'pure-synthia-pass3.zip/src/hypotheses/hypothesis.js (byte-identical across phase1/phase2/pass3 originals)',
  coreHypotheses: 'SOURCE_STATEMENT (H1-H6 claims, null hypotheses, metrics, tests, thresholds verbatim)',
  f1: 'Date.now() in addEvidence -> per-hypothesis seq counter',
  relation: 'threshold verdicts here; PROMOTION_GATE (state-space/claim-status.js) governs EMPIRICALLY_SUPPORTED promotion',
});

export default HypothesisRegistry;

