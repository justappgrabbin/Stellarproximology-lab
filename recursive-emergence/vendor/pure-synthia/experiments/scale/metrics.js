// Pure Synthia Automata — experiments/scale: metric definitions (ported, with provenance per definition)

/**
 * PORT of:
 *   - pure-synthia-phase1-d1-d2-d31/src/experiments/metrics.js
 *     (ratio, compressionGain, ablationImpact)
 *   - pure-synthia-phase2-REPAIRED/src/experiments/metrics.js
 *     (MetricsCollector methods, Appendix H.8–H.15, ported as pure functions;
 *      identical in pass3-REPAIRED — diff confirmed no change)
 *
 * PROVENANCE per metric is attached below as METRIC_PROVENANCE and mirrored in
 * each benchmark report's runtime `provenance` field.
 *
 *   - ratio / generationAccuracy / novelCompositionRate / derivationIntegrity /
 *     operatorReuse / specialCaseBurden: status SOURCE_STATEMENT
 *     (definitions lifted verbatim; "N_correct / N_test" style, 0 when the
 *     denominator is 0 — the 0-guard is the REPAIRED convention, see the
 *     phase-2 REPAIR_LOG repair 4 for the NaN defect class).
 *   - compressionGain: status SOURCE_STATEMENT with a frozen convention —
 *     the source's ASSUMPTIONS.md #5: "The compression code is a frozen
 *     benchmark convention, not a universal MDL claim." Two arities exist in
 *     the sources and BOTH are preserved: the phase-1 two-field form
 *     compressionGain({directBits, grammarBits}) = 1 - grammarBits/directBits
 *     (throws on directBits <= 0) used by the sealed D1/D2/D3 benchmarks, and
 *     the phase-2 three-length form compressionGain3(grammarLength,
 *     conditionalLength, directLength) = 1 - (L(G)+L(X|G))/L_direct.
 *   - ablationImpact = fullAccuracy - ablatedAccuracy: status SOURCE_STATEMENT.
 *   - reconstructionAccuracyExact: JSON-string equality (source: phase-2
 *     MetricsCollector.reconstructionAccuracy, "Exact equality for symbolic
 *     domains" — also D3 contract §7).
 */

export const ratio = (n, d) => (d === 0 ? 0 : n / d);

// Phase-1 frozen form (sealed benchmarks). Throws on non-positive directBits,
// exactly like the source.
export function compressionGain({ directBits, grammarBits }) {
  if (directBits <= 0) throw new RangeError('directBits must be positive.');
  return 1 - grammarBits / directBits;
}

// Phase-2 general form: 1 - (L(G) + L(X|G)) / L_direct(X).
export function compressionGain3(grammarLength, conditionalLength, directLength) {
  if (directLength === 0) return 0;
  return 1 - (grammarLength + conditionalLength) / directLength;
}

export const ablationImpact = (fullAccuracy, ablatedAccuracy) => fullAccuracy - ablatedAccuracy;

// Generation Accuracy: N_correct_generated / N_test
export const generationAccuracy = (correct, total) => (total > 0 ? correct / total : 0);

// Reconstruction Accuracy: exact symbolic equality -> {0, 1}
export const reconstructionAccuracyExact = (original, reconstructed) =>
  (JSON.stringify(original) === JSON.stringify(reconstructed) ? 1 : 0);

// Novel Composition Rate: N_correct_not_stored / N_correct_outputs
export const novelCompositionRate = (correctNovel, correctTotal) =>
  (correctTotal > 0 ? correctNovel / correctTotal : 0);

// Operator Reuse: |{s : o successfully operates at scale s}|
export const operatorReuse = (successfulScales) => successfulScales.length;

// Special-Case Burden: N_scale_specific_rules / N_successful_transformations
export const specialCaseBurden = (specificRules, successfulTransforms) =>
  (successfulTransforms > 0 ? specificRules / successfulTransforms : 0);

// Derivation Integrity: N_reproducible / N_generated
export const derivationIntegrity = (reproducible, total) => (total > 0 ? reproducible / total : 0);

export const METRIC_PROVENANCE = Object.freeze({
  ratio: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/experiments/metrics.js' }),
  compressionGain: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/experiments/metrics.js + ASSUMPTIONS.md #5 (frozen benchmark convention, not a universal MDL claim)' }),
  compressionGain3: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js (Appendix H compression form)' }),
  ablationImpact: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/experiments/metrics.js' }),
  generationAccuracy: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js' }),
  reconstructionAccuracyExact: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js + D3_EXPERIMENT_CONTRACT.md §7' }),
  novelCompositionRate: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js' }),
  operatorReuse: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js' }),
  specialCaseBurden: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js' }),
  derivationIntegrity: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/experiments/metrics.js' }),
});
