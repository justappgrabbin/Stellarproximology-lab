// Pure Synthia Automata — experiments/scale: D1 feature-scale benchmark (o_bundle construction), ported with reproduction gate

/**
 * PORT of pure-synthia-phase1-d1-d2-d31/src/engine/d1-engine.js and
 * src/experiments/d1-benchmark.js.
 *
 * FROZEN ASSUMPTIONS (ported VERBATIM from pure-synthia-phase1-d1-d2-d31/ASSUMPTIONS.md):
 *   1. Three categorical feature axes are sufficient for this first inspectable benchmark.
 *   2. The 12-item inventory and 9/3 split are implementation choices, not linguistic completeness claims.
 *   3. Test labels never enter generation.
 *   4. Equality is exact structural equality.
 *   5. The compression code is a frozen benchmark convention, not a universal MDL claim.
 *   6. `o_sequence` is implemented and tested separately; D1 held-out reconstruction uses `o_bundle`.
 * Plus this port's own assumptions:
 *   7. Fixture ids are kept verbatim (see datasets.js); the crosswalk into
 *      src/state-space/features.js is metadata, not part of generation.
 *   8. The reproduction gate compares this report against the sealed
 *      D1_RESULTS.json fixture field-by-field; nothing is dropped silently.
 *
 * PROVENANCE (runtime mirror in report.provenance):
 *   - metrics ratio/compressionGain/ablationImpact: SOURCE_STATEMENT
 *     (pure-synthia-phase1-d1-d2-d31/src/experiments/metrics.js)
 *   - split 9 discovery / 3 test: SOURCE_STATEMENT (datasets/d1.js +
 *     ASSUMPTIONS.md #2 frames it as the source's implementation choice)
 *   - compression {directBits: 48, grammarBits: 92}: SOURCE_STATEMENT frozen
 *     convention (EXPERIMENT_CONTRACT.md compression encoding; ASSUMPTIONS.md #5)
 *   - ablations removeBundle / removeVoicedPrimitive: SOURCE_STATEMENT
 *     (d1-benchmark.js; sealed expectations ablatedAccuracy 0, impact 1)
 *   - engine/grammar/operator versions: SOURCE_STATEMENT (d1-engine.js)
 *   - ledger/derivation/hash reuse of our engine modules: IMPLEMENTATION_CHOICE
 *     (see core.js header; verified to reproduce the sealed hashes byte-exactly)
 */

import {
  D1_ITEMS, D1_DISCOVERY_LABELS, D1_TEST_LABELS, D1_CONTRACT_VERSION,
  createD1PrimitiveRegistry, featureIdsFor, getD1Item,
} from './datasets.js';
import { createBundleOperator, canonicalBundleSignature } from './operators.js';
import { Composite, ScaleDerivation, newBenchmarkLedger, replayMatches, fnv1a32, stableStringify } from './core.js';
import { ratio, compressionGain, ablationImpact, METRIC_PROVENANCE } from './metrics.js';
import { SEALED_D1_RESULTS } from './sealed-results.js';
import { compareToSealed } from './reproduce.js';

/* ------------------------------------------------- D1 engine (ported) */
/* source: pure-synthia-phase1-d1-d2-d31/src/engine/d1-engine.js */

export const D1_ENGINE_VERSION = '0.1.0';
export const D1_GRAMMAR_VERSION = 'd1.1.0';
export const D1_OPERATOR_VERSION = 'phase1.1.0';

export function generateBundle({ featureIds, primitiveRegistry, bundleOperator, context = {} }) {
  const ledger = newBenchmarkLedger();
  if (!bundleOperator) return Object.freeze({ ok: false, reason: 'missing-operator', ledger: ledger.snapshot() });

  const operands = [];
  for (const id of featureIds) {
    const primitive = primitiveRegistry.get(id);
    if (!primitive) return Object.freeze({ ok: false, reason: `missing-primitive:${id}`, ledger: ledger.snapshot() });
    operands.push(primitive);
  }

  ledger.record({
    primitivesActivated: operands.length,
    edgesTraversed: Math.max(0, operands.length - 1),
    operationsExecuted: 1,
    recursionDepth: 1,
    transitionCount: 1,
  });

  const representation = bundleOperator.apply(operands, context);
  const signature = canonicalBundleSignature(representation);
  const derivationId = `derivation:${fnv1a32(signature)}`;
  const compositeId = `composite:${fnv1a32(stableStringify(representation))}`;
  ledger.record({ statesGenerated: 1 });

  const composite = new Composite({
    id: compositeId,
    scale: 'phoneme',
    children: operands.map((operand) => operand.id),
    operatorId: bundleOperator.id,
    representation,
    context,
    derivationId,
  });

  const derivation = new ScaleDerivation({
    id: derivationId,
    engineVersion: D1_ENGINE_VERSION,
    grammarVersion: D1_GRAMMAR_VERSION,
    operatorVersion: D1_OPERATOR_VERSION,
    input: { featureIds: [...featureIds] },
    context,
    steps: [
      { step: 'resolve-primitives', resolved: operands.map((operand) => operand.id) },
      { step: 'apply-operator', operatorId: bundleOperator.id },
      { step: 'generate-composite', compositeId, signature },
    ],
    output: { compositeId, signature, representation },
    ledger: ledger.snapshot(),
  });

  return Object.freeze({ ok: true, composite, derivation, signature });
}

/* ---------------------------------------------- D1 benchmark (ported) */
/* source: pure-synthia-phase1-d1-d2-d31/src/experiments/d1-benchmark.js */

function buildDiscoverySolutions(primitiveRegistry, bundleOperator) {
  const storedSolutions = new Set();
  for (const label of D1_DISCOVERY_LABELS) {
    const generated = generateBundle({
      featureIds: featureIdsFor(getD1Item(label)),
      primitiveRegistry,
      bundleOperator,
    });
    if (!generated.ok) throw new Error(`Discovery generation failed: ${label}`);
    storedSolutions.add(generated.signature);
  }
  return storedSolutions;
}

function expectedSignature(itemRecord, primitiveRegistry, bundleOperator) {
  const representation = bundleOperator.apply(featureIdsFor(itemRecord).map((id) => primitiveRegistry.get(id)));
  return canonicalBundleSignature(representation);
}

function evaluateHeldout(label, primitiveRegistry, bundleOperator, storedSolutions) {
  const record = getD1Item(label);
  const generated = generateBundle({
    featureIds: featureIdsFor(record),
    primitiveRegistry,
    bundleOperator,
  });
  if (!generated.ok) return { label, correct: false, novel: false, replayMatch: false, reason: generated.reason };
  const expected = expectedSignature(record, primitiveRegistry, bundleOperator);
  return Object.freeze({
    label,
    correct: generated.signature === expected,
    novel: !storedSolutions.has(generated.signature),
    replayMatch: replayMatches(generated.derivation),
    signature: generated.signature,
    derivationHash: generated.derivation.hash,
    ledger: generated.derivation.ledger,
  });
}

function reconstructionRecord(record, primitiveRegistry, bundleOperator) {
  const generated = generateBundle({
    featureIds: featureIdsFor(record),
    primitiveRegistry,
    bundleOperator,
  });
  return {
    label: record.label,
    correct: generated.ok && generated.signature === expectedSignature(record, primitiveRegistry, bundleOperator),
  };
}

function aggregateLedger(records) {
  const total = {
    primitivesActivated: 0, statesGenerated: 0, edgesTraversed: 0,
    operationsExecuted: 0, recursionDepth: 0, activeAutomata: 0, transitionCount: 0,
  };
  for (const record of records) {
    if (!record.ledger) continue;
    total.primitivesActivated += record.ledger.primitivesActivated;
    total.statesGenerated += record.ledger.statesGenerated;
    total.edgesTraversed += record.ledger.edgesTraversed;
    total.operationsExecuted += record.ledger.operationsExecuted;
    total.recursionDepth = Math.max(total.recursionDepth, record.ledger.recursionDepth);
    total.activeAutomata = Math.max(total.activeAutomata, record.ledger.activeAutomata);
    total.transitionCount += record.ledger.transitionCount;
  }
  return Object.freeze(total);
}

export const D1_ASSUMPTIONS = Object.freeze([
  'Three categorical feature axes are sufficient for this first inspectable benchmark.',
  'The 12-item inventory and 9/3 split are implementation choices, not linguistic completeness claims.',
  'Test labels never enter generation.',
  'Equality is exact structural equality.',
  'The compression code is a frozen benchmark convention, not a universal MDL claim.',
  'o_sequence is implemented and tested separately; D1 held-out reconstruction uses o_bundle.',
]);

export const D1_PROVENANCE = Object.freeze({
  metrics: METRIC_PROVENANCE,
  split: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/datasets/d1.js (9 discovery / 3 test; ASSUMPTIONS.md #2: implementation choice, not a completeness claim)' }),
  compression: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/EXPERIMENT_CONTRACT.md compression encoding; ASSUMPTIONS.md #5 frozen convention', directBits: 48, grammarBits: 92 }),
  ablations: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/experiments/d1-benchmark.js (removeBundle, removeVoicedPrimitive)' }),
  versions: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/engine/d1-engine.js', engine: D1_ENGINE_VERSION, grammar: D1_GRAMMAR_VERSION, operator: D1_OPERATOR_VERSION }),
  machinery: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'src/engine/{derivation,ledger}.js reused via src/experiments/scale/core.js (see its header); sealed hashes reproduced byte-exactly' }),
});

export function runD1Benchmark() {
  const primitiveRegistry = createD1PrimitiveRegistry();
  const bundleOperator = createBundleOperator();
  const storedSolutions = buildDiscoverySolutions(primitiveRegistry, bundleOperator);

  const heldout = D1_TEST_LABELS.map((label) => evaluateHeldout(label, primitiveRegistry, bundleOperator, storedSolutions));
  const reconstruction = D1_ITEMS.map((record) => reconstructionRecord(record, primitiveRegistry, bundleOperator));

  const generationAccuracy = ratio(heldout.filter((r) => r.correct).length, heldout.length);
  const reconstructionAccuracy = ratio(reconstruction.filter((r) => r.correct).length, reconstruction.length);
  const correctHeldout = heldout.filter((r) => r.correct);
  const novelCompositionRate = ratio(correctHeldout.filter((r) => r.novel).length, correctHeldout.length);
  const derivationIntegrity = ratio(heldout.filter((r) => r.replayMatch).length, heldout.length);

  const directBits = 48;
  const grammarBits = 92;

  const noBundleResults = D1_TEST_LABELS.map((label) =>
    generateBundle({
      featureIds: featureIdsFor(getD1Item(label)),
      primitiveRegistry,
      bundleOperator: null,
    }));
  const noBundleAccuracy = ratio(noBundleResults.filter((r) => r.ok).length, noBundleResults.length);

  const noVoicedRegistry = createD1PrimitiveRegistry();
  noVoicedRegistry.delete('f.voice.voiced');
  const noVoicedResults = D1_TEST_LABELS.map((label) =>
    generateBundle({
      featureIds: featureIdsFor(getD1Item(label)),
      primitiveRegistry: noVoicedRegistry,
      bundleOperator,
    }));
  const noVoicedAccuracy = ratio(noVoicedResults.filter((r) => r.ok).length, noVoicedResults.length);

  const report = Object.freeze({
    contractVersion: D1_CONTRACT_VERSION,
    discoveryLabels: [...D1_DISCOVERY_LABELS],
    testLabels: [...D1_TEST_LABELS],
    metrics: Object.freeze({
      generationAccuracy,
      reconstructionAccuracy,
      novelCompositionRate,
      derivationIntegrity,
      compressionGain: compressionGain({ directBits, grammarBits }),
    }),
    compression: Object.freeze({ directBits, grammarBits }),
    ablations: Object.freeze({
      removeBundle: Object.freeze({
        ablatedAccuracy: noBundleAccuracy,
        impact: ablationImpact(generationAccuracy, noBundleAccuracy),
      }),
      removeVoicedPrimitive: Object.freeze({
        ablatedAccuracy: noVoicedAccuracy,
        impact: ablationImpact(generationAccuracy, noVoicedAccuracy),
      }),
    }),
    ledger: aggregateLedger(heldout),
    heldout: Object.freeze(heldout),
    reconstruction: Object.freeze(reconstruction),
    assumptions: D1_ASSUMPTIONS,
    provenance: D1_PROVENANCE,
  });

  return Object.freeze({
    ...report,
    reproduction: compareToSealed(SEALED_D1_RESULTS, report),
  });
}

