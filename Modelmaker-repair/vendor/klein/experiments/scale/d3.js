// Pure Synthia Automata — experiments/scale: D3 word-scale benchmark (o_sequence over reused D2 morphemes), ported with reproduction gate

/**
 * PORT of pure-synthia-phase1-d1-d2-d31/src/engine/d3-engine.js and
 * src/experiments/d3-benchmark.js (operand builder from src/datasets/d3.js).
 *
 * FROZEN ASSUMPTIONS (D3 contract, pure-synthia-phase1-d1-d2-d31/D3_EXPERIMENT_CONTRACT.md):
 *   1. The tested recursive path is
 *      feature primitive -> phoneme composite -> morpheme composite -> word composite;
 *      no D3 word may directly instantiate an opaque morpheme or phoneme solution.
 *   2. D3 uses the existing o_sequence operator unchanged;
 *      o_sequence(A,B) != o_sequence(B,A) when the operands differ.
 *   3. Exactly eight symbolic two-morpheme words; the 6/2 discovery/test split
 *      is immutable for D3-contract-1.0.0. Word ids are evaluation labels, not
 *      claims about English lexical semantics.
 *   4. StoredSolutions_D3 is exactly the set of canonical word signatures
 *      generated from the six discovery words before test execution.
 *   5. Generation is correct iff the canonical ordered word signature exactly
 *      matches the independently declared held-out morpheme order;
 *      reconstruction uses exact symbolic equality.
 *   6. The compression encoding (L_direct = 24, L_grammar = 80) is a frozen
 *      benchmark convention; the negative gain is reported unchanged.
 *   7. A1 (remove D3 o_sequence) is a declared structural zero, frozen as
 *      ablatedAccuracy = 0 in the source benchmark — preserved verbatim.
 *   8. Interpretation boundary (contract §12): passing D3 supports only the
 *      narrow claim that generated D2 morpheme composites can be reused as
 *      next-scale operands for the unchanged sequence operator in this frozen
 *      symbolic benchmark.
 * Plus this port's own assumptions:
 *   9. Fixture ids are kept verbatim (see datasets.js header).
 *  10. The reproduction gate compares against sealed D3_RESULTS.json
 *      field-by-field; nothing is dropped silently.
 *
 * PROVENANCE (runtime mirror in report.provenance): see D3_PROVENANCE below.
 */

import {
  D2_CONTRACT_VERSION, getD2Item, createD1PrimitiveRegistry,
  D3_ITEMS, D3_DISCOVERY_IDS, D3_TEST_IDS, D3_CONTRACT_VERSION, getD3Item,
} from './datasets.js';
import { createBundleOperator, createSequenceOperator, canonicalSequenceSignature } from './operators.js';
import { Composite, ScaleDerivation, newBenchmarkLedger, replayMatches, fnv1a32, stableStringify } from './core.js';
import { buildD1PhonemeComposite, generateSequence } from './d2.js';
import { ratio, compressionGain, ablationImpact, METRIC_PROVENANCE } from './metrics.js';
import { SEALED_D3_RESULTS } from './sealed-results.js';
import { compareToSealed } from './reproduce.js';

/* ------------------------------------------------- D3 engine (ported) */
/* source: pure-synthia-phase1-d1-d2-d31/src/engine/d3-engine.js */

export const D3_ENGINE_VERSION = '0.3.0';
export const D3_GRAMMAR_VERSION = 'd3.1.0';
export const D3_OPERATOR_VERSION = 'phase1.2.0';

export function generateWord({ morphemeOperands, sequenceOperator, context = {} }) {
  const ledger = newBenchmarkLedger();

  if (!sequenceOperator) {
    return Object.freeze({ ok: false, reason: 'missing-operator:o_sequence', ledger: ledger.snapshot() });
  }

  if (
    !Array.isArray(morphemeOperands)
    || morphemeOperands.length !== 2
    || morphemeOperands.some((operand) => !operand?.composite?.id)
  ) {
    return Object.freeze({ ok: false, reason: 'invalid-morpheme-operands', ledger: ledger.snapshot() });
  }

  const operands = morphemeOperands.map((operand) => operand.composite);

  ledger.record({
    primitivesActivated: operands.length,
    edgesTraversed: 1,
    operationsExecuted: 1,
    recursionDepth: 3,
    transitionCount: 1,
  });

  const representation = sequenceOperator.apply(operands, context);
  const signature = canonicalSequenceSignature(representation);
  const compositeId = `d3-composite:${fnv1a32(stableStringify(representation))}`;
  const derivationId = `d3-derivation:${fnv1a32(signature)}`;

  ledger.record({ statesGenerated: 1 });

  const composite = new Composite({
    id: compositeId,
    scale: 'symbolic-word',
    children: operands.map((operand) => operand.id),
    operatorId: sequenceOperator.id,
    representation,
    context,
    derivationId,
  });

  const derivation = new ScaleDerivation({
    id: derivationId,
    engineVersion: D3_ENGINE_VERSION,
    grammarVersion: D3_GRAMMAR_VERSION,
    operatorVersion: D3_OPERATOR_VERSION,
    input: {
      operandCompositeIds: operands.map((operand) => operand.id),
      operandDerivationHashes: morphemeOperands.map((operand) => operand.derivation.hash),
    },
    context,
    steps: [
      { step: 'accept-d2-generated-morphemes', operandIds: operands.map((operand) => operand.id) },
      { step: 'apply-operator', operatorId: sequenceOperator.id },
      { step: 'generate-word-composite', compositeId, signature },
    ],
    output: { compositeId, signature, representation },
    ledger: ledger.snapshot(),
  });

  return Object.freeze({ ok: true, composite, derivation, signature });
}

/* ------------------------------------- D2->D3 operand builder (ported) */
/* source: pure-synthia-phase1-d1-d2-d31/src/datasets/d3.js buildD2MorphemeComposite */

export function buildD2MorphemeComposite(morphemeId, {
  primitiveRegistry = createD1PrimitiveRegistry(),
  bundleOperator = createBundleOperator(),
  sequenceOperator = createSequenceOperator(),
} = {}) {
  if (!sequenceOperator) {
    return Object.freeze({ ok: false, reason: 'missing-d2-sequence-operator' });
  }

  const d2Item = getD2Item(morphemeId);
  const phonemeOperands = d2Item.phonemes.map((label) =>
    buildD1PhonemeComposite(label, { primitiveRegistry, bundleOperator }));

  if (phonemeOperands.some((operand) => !operand.ok)) {
    return Object.freeze({ ok: false, reason: 'd1-phoneme-construction-failed' });
  }

  const generated = generateSequence({
    phonemeOperands,
    sequenceOperator,
    context: { sourceContract: D2_CONTRACT_VERSION, role: 'D3-morpheme-operand', morphemeId },
  });

  if (!generated.ok) return generated;

  return Object.freeze({
    ok: true,
    morphemeId,
    composite: generated.composite,
    derivation: generated.derivation,
    signature: generated.signature,
  });
}

/* ---------------------------------------------- D3 benchmark (ported) */
/* source: pure-synthia-phase1-d1-d2-d31/src/experiments/d3-benchmark.js */

function buildMorphemeOperands(item, { primitiveRegistry, bundleOperator, d2SequenceOperator }) {
  return item.morphemes.map((morphemeId) =>
    buildD2MorphemeComposite(morphemeId, {
      primitiveRegistry,
      bundleOperator,
      sequenceOperator: d2SequenceOperator,
    }));
}

function expectedSignature(item, operands, d3SequenceOperator) {
  return canonicalSequenceSignature(
    d3SequenceOperator.apply(operands.map((operand) => operand.composite)),
  );
}

function buildStoredSolutions(config) {
  const signatures = new Set();

  for (const id of D3_DISCOVERY_IDS) {
    const item = getD3Item(id);
    const operands = buildMorphemeOperands(item, config);

    if (operands.some((operand) => !operand.ok)) {
      throw new Error(`D3 discovery operand construction failed: ${id}`);
    }

    const generated = generateWord({
      morphemeOperands: operands,
      sequenceOperator: config.d3SequenceOperator,
      context: { dataset: 'D3', split: 'discovery' },
    });

    if (!generated.ok) throw new Error(`D3 discovery generation failed: ${id}`);

    signatures.add(generated.signature);
  }

  return signatures;
}

function evaluateHeldout(id, config, storedSolutions) {
  const item = getD3Item(id);
  const operands = buildMorphemeOperands(item, config);

  if (operands.some((operand) => !operand.ok)) {
    return Object.freeze({ id, correct: false, novel: false, orderSensitive: false, replayMatch: false, reason: 'morpheme-construction-failed' });
  }

  const generated = generateWord({
    morphemeOperands: operands,
    sequenceOperator: config.d3SequenceOperator,
    context: { dataset: 'D3', split: 'test' },
  });

  if (!generated.ok) {
    return Object.freeze({ id, correct: false, novel: false, orderSensitive: false, replayMatch: false, reason: generated.reason });
  }

  const expected = expectedSignature(item, operands, config.d3SequenceOperator);

  const reversedRepresentation = config.d3SequenceOperator.apply([
    operands[1].composite,
    operands[0].composite,
  ]);
  const reversedSignature = canonicalSequenceSignature(reversedRepresentation);

  return Object.freeze({
    id,
    morphemes: [...item.morphemes],
    correct: generated.signature === expected,
    novel: !storedSolutions.has(generated.signature),
    orderSensitive: generated.signature !== reversedSignature,
    replayMatch: replayMatches(generated.derivation),
    signature: generated.signature,
    reversedSignature,
    derivationHash: generated.derivation.hash,
    operandDerivationHashes: operands.map((operand) => operand.derivation.hash),
    ledger: generated.derivation.ledger,
  });
}

function evaluateReconstruction(item, config) {
  const operands = buildMorphemeOperands(item, config);

  if (operands.some((operand) => !operand.ok)) {
    return Object.freeze({ id: item.id, correct: false });
  }

  const generated = generateWord({ morphemeOperands: operands, sequenceOperator: config.d3SequenceOperator });

  if (!generated.ok) return Object.freeze({ id: item.id, correct: false });

  return Object.freeze({
    id: item.id,
    correct: generated.signature === expectedSignature(item, operands, config.d3SequenceOperator),
  });
}

function unorderedCollisionCount(config) {
  const signatures = new Map();

  for (const item of D3_ITEMS) {
    const operands = buildMorphemeOperands(item, config);
    if (operands.some((operand) => !operand.ok)) continue;

    const unordered = operands.map((operand) => operand.composite.id).sort().join('|');
    const ids = signatures.get(unordered) ?? [];
    ids.push(item.id);
    signatures.set(unordered, ids);
  }

  let collisions = 0;
  for (const ids of signatures.values()) {
    if (ids.length > 1) collisions += ids.length - 1;
  }
  return collisions;
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

export const D3_ASSUMPTIONS = Object.freeze([
  'The tested recursive path is feature primitive -> phoneme composite -> morpheme composite -> word composite; no D3 word may directly instantiate an opaque morpheme or phoneme solution.',
  'D3 uses the existing o_sequence operator unchanged; o_sequence(A,B) != o_sequence(B,A) when the operands differ.',
  'Exactly eight symbolic two-morpheme words; the 6/2 discovery/test split is immutable for D3-contract-1.0.0; word ids are evaluation labels, not lexical-semantics claims.',
  'StoredSolutions_D3 is exactly the set of canonical word signatures generated from the six discovery words before test execution.',
  'Generation is correct iff the canonical ordered word signature exactly matches the independently declared held-out morpheme order; reconstruction uses exact symbolic equality.',
  'The compression encoding (L_direct=24, L_grammar=80) is a frozen benchmark convention; the negative gain is reported unchanged.',
  'The removeD3Sequence ablation is a declared structural zero, frozen as ablatedAccuracy=0 in the source benchmark.',
  'Interpretation boundary: passing D3 supports only the narrow claim that generated D2 morpheme composites can be reused as next-scale operands for the unchanged sequence operator in this frozen symbolic benchmark.',
]);

export const D3_PROVENANCE = Object.freeze({
  metrics: METRIC_PROVENANCE,
  split: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/datasets/d3.js (6 discovery / 2 test; D3_EXPERIMENT_CONTRACT.md §5 immutable)' }),
  compression: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/D3_EXPERIMENT_CONTRACT.md §9 (8 identities × 3 bits direct; 64 bits morpheme references + 16 bits grammar overhead)', directBits: 24, grammarBits: 80 }),
  ablations: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/experiments/d3-benchmark.js (removeD3Sequence structural zero; removeD2MorphemeConstruction; destroyOrder collision count)' }),
  versions: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase1-d1-d2-d31/src/engine/d3-engine.js', engine: D3_ENGINE_VERSION, grammar: D3_GRAMMAR_VERSION, operator: D3_OPERATOR_VERSION }),
  machinery: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'src/engine/{derivation,ledger}.js reused via src/experiments/scale/core.js; sealed hashes reproduced byte-exactly' }),
});

export function runD3Benchmark() {
  const config = {
    primitiveRegistry: createD1PrimitiveRegistry(),
    bundleOperator: createBundleOperator(),
    d2SequenceOperator: createSequenceOperator(),
    d3SequenceOperator: createSequenceOperator(),
  };

  const storedSolutions = buildStoredSolutions(config);

  const heldout = D3_TEST_IDS.map((id) => evaluateHeldout(id, config, storedSolutions));
  const reconstruction = D3_ITEMS.map((item) => evaluateReconstruction(item, config));

  const generationAccuracy = ratio(heldout.filter((record) => record.correct).length, heldout.length);
  const reconstructionAccuracy = ratio(reconstruction.filter((record) => record.correct).length, reconstruction.length);
  const correctHeldout = heldout.filter((record) => record.correct);
  const novelCompositionRate = ratio(correctHeldout.filter((record) => record.novel).length, correctHeldout.length);
  const orderSensitivity = ratio(heldout.filter((record) => record.orderSensitive).length, heldout.length);
  const derivationIntegrity = ratio(heldout.filter((record) => record.replayMatch).length, heldout.length);

  // Frozen structural zero: without D3 o_sequence no word generation can occur.
  const noD3SequenceAccuracy = 0;

  const noD2SequenceResults = D3_TEST_IDS.map((id) => {
    const item = getD3Item(id);
    const operands = buildMorphemeOperands(item, { ...config, d2SequenceOperator: null });
    return operands.every((operand) => operand.ok);
  });
  const noD2SequenceAccuracy = ratio(noD2SequenceResults.filter(Boolean).length, noD2SequenceResults.length);

  const directBits = 24;
  const grammarBits = 80;

  const report = Object.freeze({
    contractVersion: D3_CONTRACT_VERSION,
    discoveryIds: [...D3_DISCOVERY_IDS],
    testIds: [...D3_TEST_IDS],
    metrics: Object.freeze({
      generationAccuracy,
      reconstructionAccuracy,
      novelCompositionRate,
      orderSensitivity,
      derivationIntegrity,
      compressionGain: compressionGain({ directBits, grammarBits }),
    }),
    compression: Object.freeze({ directBits, grammarBits }),
    ablations: Object.freeze({
      removeD3Sequence: Object.freeze({
        ablatedAccuracy: noD3SequenceAccuracy,
        impact: ablationImpact(generationAccuracy, noD3SequenceAccuracy),
      }),
      removeD2MorphemeConstruction: Object.freeze({
        ablatedAccuracy: noD2SequenceAccuracy,
        impact: ablationImpact(generationAccuracy, noD2SequenceAccuracy),
      }),
      destroyOrder: Object.freeze({ collisionCount: unorderedCollisionCount(config) }),
    }),
    ledger: aggregateLedger(heldout),
    heldout: Object.freeze(heldout),
    reconstruction: Object.freeze(reconstruction),
    assumptions: D3_ASSUMPTIONS,
    provenance: D3_PROVENANCE,
  });

  return Object.freeze({
    ...report,
    reproduction: compareToSealed(SEALED_D3_RESULTS, report),
  });
}

