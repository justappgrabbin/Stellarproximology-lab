// Pure Synthia Automata — experiments/scale: cross-scale transfer + D1/D2/D3 cross-scale analysis

/**
 * PORT of:
 *   - pure-synthia-phase2-REPAIRED/src/experiments/cross-scale.js
 *     (CrossScaleExperiment — identical in pass3-REPAIRED; diff confirmed)
 *   - the analysis content of pure-synthia-phase1-d1-d2-d31/PHASE1_CROSS_SCALE_REPORT.{md,json}
 *     (operator reuse / recursion depth / ablation / compression across scales)
 *
 * FROZEN ASSUMPTIONS:
 *   - (source, Appendix H.3.4/H.6) Cross-scale transfer tests whether operators
 *     discovered at one scale apply at another; transferRate >= 0.5 is the
 *     frozen threshold for "cross-scale invariant".
 *   - (source report) The honest boundary: D1–D3 support compositional reuse
 *     with increasing recursion depth; they do NOT establish general
 *     cross-scale operator invariance, semantic generalization, dimensional
 *     correspondence, canonical-address utility, or compression advantage.
 *   - (this port) Determinism: the source's transfer record carried
 *     `timestamp: Date.now()` — omitted here (wall-clock is the phase-1
 *     repair-log defect class #2: it must never enter a deterministic
 *     experiment record).
 *   - (this port) testTransfer/runFullBattery are synchronous; the source
 *     declared them async without any await. Behavior unchanged.
 *
 * PROVENANCE:
 *   - transferRate = successCount/totalTests (0 when no tests):
 *     SOURCE_STATEMENT, pure-synthia-phase2-REPAIRED/src/experiments/cross-scale.js
 *   - invariant threshold 0.5: SOURCE_STATEMENT (same file, "threshold for
 *     cross-scale invariance")
 *   - recursion ladder / compression deltas: SOURCE_STATEMENT,
 *     pure-synthia-phase1-d1-d2-d31/PHASE1_CROSS_SCALE_REPORT.md §2/§4
 *   - operand adaptation (re-tag scale metadata): SOURCE_STATEMENT (same file,
 *     _adaptOperands)
 *   - timestamp omission + sync API: IMPLEMENTATION_CHOICE (determinism)
 */

import { operatorReuse } from './metrics.js';

/* ------------------------------- CrossScaleExperiment (ported, phase-2) */

export const CROSS_SCALE_INVARIANT_THRESHOLD = 0.5; // frozen: source comment "threshold for cross-scale invariance"

export class CrossScaleExperiment {
  // engine: anything exposing operators with get(id) (and optionally list())
  // — e.g. a Map of id -> operator, or the source's OperatorRegistry.
  constructor(engine) {
    if (!engine || !engine.operators || typeof engine.operators.get !== 'function') {
      throw new TypeError('CrossScaleExperiment requires {engine} with engine.operators.get(id)');
    }
    this.engine = engine;
    this.transferResults = [];
  }

  // Test operator transfer from sourceScale to targetScale.
  // testCases: [{id, operands:[...], context?, expected?}]
  testTransfer(operatorId, sourceScale, targetScale, testCases) {
    const operator = this.engine.operators.get(operatorId);
    if (!operator) {
      return { operatorId, sourceScale, targetScale, success: false, reason: 'operator_not_found' };
    }

    const results = [];
    let successCount = 0;

    for (const testCase of testCases) {
      try {
        // Attempt to apply operator at target scale without modification.
        const adapted = this._adaptOperands(testCase.operands, targetScale);
        const result = operator.apply(adapted, testCase.context || {});
        const success = this._validateResult(result, testCase.expected);
        results.push({ testCase: testCase.id, success, result });
        if (success) successCount += 1;
      } catch (error) {
        results.push({ testCase: testCase.id, success: false, error: error.message });
      }
    }

    const transferRate = testCases.length > 0 ? successCount / testCases.length : 0;
    const record = {
      operatorId,
      sourceScale,
      targetScale,
      successCount,
      totalTests: testCases.length,
      transferRate,
      invariant: transferRate >= CROSS_SCALE_INVARIANT_THRESHOLD,
      results,
      // timestamp omitted — determinism (see header; source used Date.now()).
    };

    this.transferResults.push(record);

    if (this.engine.topologyBuilder) {
      this.engine.topologyBuilder.recordCrossScale(
        operatorId, sourceScale, targetScale, transferRate >= CROSS_SCALE_INVARIANT_THRESHOLD,
      );
    }

    return record;
  }

  // Run full cross-scale battery across all operator/scale pairs.
  runFullBattery(scalePairs, testCaseMap) {
    const battery = [];
    const operators = typeof this.engine.operators.list === 'function'
      ? this.engine.operators.list()
      : [...this.engine.operators.values()];
    for (const op of operators) {
      for (const [source, target] of scalePairs) {
        if (source === target) continue;
        const testCases = testCaseMap[`${op.id}:${target}`] || testCaseMap[target] || [];
        if (testCases.length > 0) {
          battery.push(this.testTransfer(op.id, source, target, testCases));
        }
      }
    }
    return battery;
  }

  summary() {
    const invariantOps = new Set();
    const failedOps = new Set();

    for (const r of this.transferResults) {
      if (r.invariant) invariantOps.add(r.operatorId);
      else failedOps.add(r.operatorId);
    }

    return {
      totalTransfers: this.transferResults.length,
      invariantTransfers: this.transferResults.filter((r) => r.invariant).length,
      invariantOperators: [...invariantOps],
      failedOperators: [...failedOps],
      averageTransferRate: this.transferResults.reduce((a, r) => a + r.transferRate, 0)
        / (this.transferResults.length || 1),
    };
  }

  _adaptOperands(operands, targetScale) {
    // Phase-2 adaptation: wrap operands with target scale metadata.
    return operands.map((op) => ({ ...op, scale: targetScale, _adapted: true }));
  }

  _validateResult(result, expected) {
    if (!result || !expected) return false;
    // Loose validation for Phase 2 (source semantics preserved).
    return result.operator === expected.operator
      || (result.members && expected.members && result.members.length === expected.members.length);
  }

  toJSON() {
    return { transferResults: this.transferResults, summary: this.summary() };
  }
}

/* ------------------- D1/D2/D3 cross-scale analysis (ported, phase-1 report) */

/**
 * Compute the cross-scale metrics of PHASE1_CROSS_SCALE_REPORT from three
 * benchmark reports (runD1Benchmark/runD2Benchmark/runD3Benchmark output):
 *   - operatorReuse: scales at which each operator successfully operated
 *     (o_bundle: D1 primary + D2/D3 operand construction; o_sequence: D2 + D3);
 *   - recursionDepth ladder + successive deltas;
 *   - ablation impacts per benchmark;
 *   - compression table + successive compression-gain deltas.
 *
 * The D3 column is included (the sealed report predates D3 and used only
 * D1/D2; including D3 is flagged IMPLEMENTATION_CHOICE, metrics unchanged).
 */
export function runCrossScaleAnalysis({ d1Report, d2Report, d3Report }) {
  const reports = Object.freeze({ D1: d1Report, D2: d2Report, D3: d3Report });

  // Operator reuse across the tested scale ladder. Successful = the scale's
  // generation accuracy is 1 (the operator's construction path succeeded on
  // every held-out item).
  const succeeded = (report) => report.metrics.generationAccuracy === 1;
  const bundleScales = ['D1', 'D2', 'D3'].filter((k) => succeeded(reports[k])); // bundle is on the construction path at every scale
  const sequenceScales = ['D2', 'D3'].filter((k) => succeeded(reports[k])); // sequence enters at D2
  const operators = Object.freeze({
    o_bundle: Object.freeze({ scales: Object.freeze(bundleScales), reuse: operatorReuse(bundleScales) }),
    o_sequence: Object.freeze({ scales: Object.freeze(sequenceScales), reuse: operatorReuse(sequenceScales) }),
  });

  // Recursion depth ladder (held-out high-water marks).
  const recursionDepth = Object.freeze({
    D1: d1Report.ledger.recursionDepth,
    D2: d2Report.ledger.recursionDepth,
    D3: d3Report.ledger.recursionDepth,
    deltas: Object.freeze({
      'D2-D1': d2Report.ledger.recursionDepth - d1Report.ledger.recursionDepth,
      'D3-D2': d3Report.ledger.recursionDepth - d2Report.ledger.recursionDepth,
    }),
  });

  // Ablation impacts per benchmark (ported verbatim from each report).
  const ablations = Object.freeze(Object.fromEntries(
    Object.entries(reports).map(([k, r]) => [k, r.ablations]),
  ));
  const allRemovalsReduceToZero = Object.values(reports).every((r) =>
    Object.values(r.ablations)
      .filter((a) => typeof a.ablatedAccuracy === 'number')
      .every((a) => a.ablatedAccuracy === 0 && a.impact === 1));

  // Compression table + deltas.
  const compression = Object.freeze({
    D1: Object.freeze({ ...d1Report.compression, gain: d1Report.metrics.compressionGain }),
    D2: Object.freeze({ ...d2Report.compression, gain: d2Report.metrics.compressionGain }),
    D3: Object.freeze({ ...d3Report.compression, gain: d3Report.metrics.compressionGain }),
    deltas: Object.freeze({
      'D2-D1': d2Report.metrics.compressionGain - d1Report.metrics.compressionGain,
      'D3-D2': d3Report.metrics.compressionGain - d2Report.metrics.compressionGain,
    }),
    allNegative: [d1Report, d2Report, d3Report].every((r) => r.metrics.compressionGain < 0),
  });

  return Object.freeze({
    reportVersion: 'phase1-cross-scale-1.0.0-ported',
    operators,
    recursionDepth,
    ablations,
    allRemovalsReduceToZero,
    compression,
    conclusion: Object.freeze({
      supported: Object.freeze([
        'generated wholes are reused as operands at the next tested scale',
        'recursion depth increases along D1 -> D2 -> D3',
        'lower-scale construction remains operationally necessary inside higher scales',
        'order-sensitive composition with deterministic replay holds at D2 and D3',
      ]),
      notEstablished: Object.freeze([
        'general cross-scale operator invariance',
        'linguistic semantic generalization',
        'dimensional correspondence',
        'canonical-address utility',
        'compression advantage (gains are negative under the frozen encodings — a genuine negative result at these benchmark sizes)',
      ]),
    }),
    provenance: Object.freeze({
      transferRate: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/cross-scale.js' }),
      invariantThreshold: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/cross-scale.js (0.5)', value: CROSS_SCALE_INVARIANT_THRESHOLD }),
      recursionAndCompression: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/PHASE1_CROSS_SCALE_REPORT.md §1-§4' }),
      d3Inclusion: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'this port — the sealed report predates D3; D2/D1 delta preserved, D3/D2 added' }),
      determinism: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'this port — Date.now() timestamp omitted from transfer records (repair-log defect class: wall-clock must not enter experiment records)' }),
    }),
  });
}
