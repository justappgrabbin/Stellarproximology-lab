// Pure Synthia Automata — experiments/scale: address + dimensional evaluators (H3 / H4), ported deterministic

/**
 * PORT of pure-synthia-phase2-REPAIRED/src/engine/{address-evaluator,
 * dimensional-evaluator}.js (the repaired revisions; pass3-REPAIRED carries
 * the SAME dimensional-evaluator but REGRESSES address-evaluator's
 * zero-guard — this port follows the repaired phase-2 version).
 *
 * FROZEN ASSUMPTIONS:
 *   - (source, H3) Address evaluation scores a candidate address function
 *     against control address systems: random, shuffled, flat, reduced —
 *     on three metrics: retrieval, compression, generative; deltas are
 *     candidate - control per metric per control.
 *   - (source, H4) Dimensional evaluation scores a candidate dimensional
 *     mapping against alternatives (random / single / permuted) on
 *     predictive, generative, and transform-consistency metrics; deltas are
 *     candidate - alternative. Per Appendix J, CandidateDimension records are
 *     weaker than Primitives.
 *   - (source, phase-2 REPAIR_LOG repair 4) Every evaluation average guards
 *     the empty-case with `length > 0 ? x/length : 0`. This port keeps the
 *     REPAIRED guard everywhere (pass3's regression to the NaN form is a
 *     known defect and is NOT reproduced).
 *   - (this port) Determinism: the source's random/shuffled controls used
 *     Math.random(); here they take a seeded rng (default mulberry32 with
 *     DEFAULT_EVALUATOR_SEED). Same defect class as controls.js.
 *   - (this port) Addresses are plain objects ({planetaryDimension?, gate?,
 *     line?, color?, ...}) — the source's CanonicalAddress class is reduced
 *     to its data content; address keys use the source's
 *     `${planetaryDimension}:${gate}:${line}` shape verbatim.
 *
 * PROVENANCE:
 *   - retrieval score = |found ∩ expected| / |expected| (0 when |expected|=0):
 *     SOURCE_STATEMENT, address-evaluator.js _scoreRetrieval
 *   - size estimates (50 bytes/primitive direct; 20/unique address + 10/primitive
 *     addressed): SOURCE_STATEMENT, address-evaluator.js — a rough frozen
 *     heuristic, not a measured cost model (its own comments say "rough").
 *   - generative match threshold (confidence > 0.3): SOURCE_STATEMENT
 *     ("Loose matching for Phase 2" — preserved verbatim, flagged as loose).
 *   - H4 alternatives (random/single/permuted): SOURCE_STATEMENT,
 *     dimensional-evaluator.js generateAlternatives
 */

import { mulberry32 } from '../../state-space/constants.js';

export const DEFAULT_EVALUATOR_SEED = 0xE5A1A70;

function addressKeyOf(addr) {
  if (!addr) return 'null';
  return `${addr.planetaryDimension || '?'}:${addr.gate || '?'}:${addr.line || '?'}`;
}

/* ------------------------------------------------------- AddressEvaluator */

export class AddressEvaluator {
  constructor({ seed = DEFAULT_EVALUATOR_SEED, rng = null } = {}) {
    this.rng = rng || mulberry32(seed);
    this.results = [];
  }

  // Generate control addresses (H3 controls: random, shuffled, flat, reduced).
  generateControl(address, type) {
    switch (type) {
      case 'random':
        return this._randomAddress();
      case 'shuffled':
        return this._shuffledAddress(address);
      case 'flat':
        return { gate: address.gate };
      case 'reduced':
        return {
          planetaryDimension: address.planetaryDimension,
          gate: address.gate,
          line: address.line,
        };
      default:
        return address;
    }
  }

  // Retrieval: how completely does an address bucket recover expected ids?
  evaluateRetrieval(primitives, addressFn, testQueries) {
    const index = this._buildIndex(primitives, addressFn);
    let totalScore = 0;

    for (const query of testQueries) {
      const target = addressFn(query);
      const related = this._findRelated(index, target);
      totalScore += this._scoreRetrieval(related, query.expected);
    }

    // REPAIRED guard (phase-2 repair 4; pass3 regressed this — not reproduced).
    return testQueries.length > 0 ? totalScore / testQueries.length : 0;
  }

  // Compression: does addressing reduce description length? (rough frozen heuristic)
  evaluateCompression(primitives, addressFn) {
    const directSize = this._estimateDirectSize(primitives);
    const addressedSize = this._estimateAddressedSize(primitives, addressFn);
    return directSize > 0 ? 1 - addressedSize / directSize : 0;
  }

  // Generative: can addresses predict composition? (loose phase-2 matching)
  evaluateGenerative(primitives, addressFn, testCompositions) {
    let correct = 0;
    for (const test of testCompositions) {
      const predicted = this._predictFromAddresses(test.inputs, addressFn);
      if (this._matchPrediction(predicted, test.expected)) correct += 1;
    }
    return testCompositions.length > 0 ? correct / testCompositions.length : 0;
  }

  // Full H3 evaluation: candidate vs controls, with per-metric deltas.
  evaluateH3(primitives, candidateAddressFn, testQueries, testCompositions) {
    const controls = ['random', 'shuffled', 'flat', 'reduced'];
    const results = { candidate: {}, controls: {} };

    results.candidate.retrieval = this.evaluateRetrieval(primitives, candidateAddressFn, testQueries);
    results.candidate.compression = this.evaluateCompression(primitives, candidateAddressFn);
    results.candidate.generative = this.evaluateGenerative(primitives, candidateAddressFn, testCompositions);

    for (const controlType of controls) {
      const controlFn = (p) => this.generateControl(candidateAddressFn(p), controlType);
      results.controls[controlType] = {
        retrieval: this.evaluateRetrieval(primitives, controlFn, testQueries),
        compression: this.evaluateCompression(primitives, controlFn),
        generative: this.evaluateGenerative(primitives, controlFn, testCompositions),
      };
    }

    results.deltas = {};
    for (const metric of ['retrieval', 'compression', 'generative']) {
      results.deltas[metric] = {};
      for (const controlType of controls) {
        results.deltas[metric][controlType] = results.candidate[metric] - results.controls[controlType][metric];
      }
    }

    this.results.push(results);
    return results;
  }

  _buildIndex(primitives, addressFn) {
    const index = new Map();
    for (const p of primitives) {
      const key = addressKeyOf(addressFn(p));
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(p);
    }
    return index;
  }

  _findRelated(index, target) {
    return index.get(addressKeyOf(target)) || [];
  }

  _scoreRetrieval(found, expected) {
    const foundSet = new Set(found.map((f) => f.id));
    const expectedSet = new Set(expected);
    const intersection = new Set([...foundSet].filter((x) => expectedSet.has(x)));
    return expectedSet.size > 0 ? intersection.size / expectedSet.size : 0;
  }

  _estimateDirectSize(primitives) {
    return primitives.length * 50; // source: "rough bytes per primitive"
  }

  _estimateAddressedSize(primitives, addressFn) {
    const uniqueAddresses = new Set();
    for (const p of primitives) uniqueAddresses.add(addressKeyOf(addressFn(p)));
    return uniqueAddresses.size * 20 + primitives.length * 10;
  }

  _predictFromAddresses(inputs, addressFn) {
    const addresses = inputs.map(addressFn);
    const shared = this._sharedComponents(addresses);
    return { shared, confidence: shared.length / (addresses[0] ? Object.keys(addresses[0]).length : 1) };
  }

  _matchPrediction(predicted, expected) {
    // Loose matching for Phase 2 (source semantics preserved).
    return predicted.confidence > 0.3;
  }

  _sharedComponents(addresses) {
    if (addresses.length === 0) return [];
    const keys = Object.keys(addresses[0]);
    return keys.filter((k) => addresses.every((a) => a[k] === addresses[0][k] && a[k] != null));
  }

  _randomAddress() {
    return {
      gate: Math.floor(this.rng() * 64) + 1,
      line: Math.floor(this.rng() * 6) + 1,
      color: Math.floor(this.rng() * 6) + 1,
    };
  }

  _shuffledAddress(address) {
    const fields = {};
    const keys = Object.keys(address).filter((k) => address[k] != null);
    const values = keys.map((k) => address[k]);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    keys.forEach((k, i) => { fields[k] = values[i]; });
    return fields;
  }
}

/* --------------------------------------------------- DimensionalEvaluator */

export class DimensionalEvaluator {
  constructor({ seed = DEFAULT_EVALUATOR_SEED, rng = null } = {}) {
    this.rng = rng || mulberry32(seed);
    this.candidateDimensions = new Map();
    this.alternativeMappings = [];
  }

  // Register a candidate dimension (from Appendix J).
  registerCandidate(dimension) {
    this.candidateDimensions.set(dimension.id, dimension);
    return this;
  }

  // Generate alternative mappings by permuting dimensions.
  generateAlternatives() {
    const dims = [...this.candidateDimensions.values()];
    const alternatives = [];

    // Null model: random assignment (seeded — source used Math.random).
    alternatives.push({
      id: 'random',
      name: 'Random Mapping',
      mapping: () => dims[Math.floor(this.rng() * dims.length)],
    });

    // Null model: single dimension only.
    alternatives.push({
      id: 'single',
      name: 'Single Dimension',
      mapping: () => dims[0],
    });

    // Permuted: swap macro/micro pairs.
    if (dims.length >= 2) {
      alternatives.push({
        id: 'permuted',
        name: 'Permuted Dimensions',
        mapping: (idx) => dims[(idx + 1) % dims.length],
      });
    }

    this.alternativeMappings = alternatives;
    return alternatives;
  }

  // Predictive power of a mapping on a dataset.
  evaluatePredictive(mappingFn, dataset) {
    let correct = 0;
    for (const item of dataset) {
      const predicted = mappingFn(item.index);
      if (predicted.id === item.expectedDimension) correct += 1;
    }
    return dataset.length > 0 ? correct / dataset.length : 0;
  }

  // Generative power: does the mapping produce coherent compositions?
  evaluateGenerative(mappingFn, compositionTests) {
    let coherent = 0;
    for (const test of compositionTests) {
      const dims = test.inputs.map((i) => mappingFn(i));
      if (this._measureCoherence(dims) > test.threshold) coherent += 1;
    }
    return compositionTests.length > 0 ? coherent / compositionTests.length : 0;
  }

  // Transform consistency: does T_i->j preserve structure?
  evaluateTransformConsistency(mappingFn, transformTests) {
    let consistent = 0;
    for (const test of transformTests) {
      const fromDim = mappingFn(test.from);
      const toDim = mappingFn(test.to);
      if (this._inferRelation(fromDim, toDim) === test.expectedRelation) consistent += 1;
    }
    return transformTests.length > 0 ? consistent / transformTests.length : 0;
  }

  // Full H4 evaluation: candidate vs alternatives, with per-metric deltas.
  evaluateH4(dataset, compositionTests, transformTests) {
    const alternatives = this.generateAlternatives();
    const results = { candidate: {}, alternatives: {} };

    const dims = [...this.candidateDimensions.values()];
    const candidateFn = (idx) => dims[idx % dims.length];
    results.candidate = {
      predictive: this.evaluatePredictive(candidateFn, dataset),
      generative: this.evaluateGenerative(candidateFn, compositionTests),
      transformConsistency: this.evaluateTransformConsistency(candidateFn, transformTests),
    };

    for (const alt of alternatives) {
      results.alternatives[alt.id] = {
        predictive: this.evaluatePredictive(alt.mapping, dataset),
        generative: this.evaluateGenerative(alt.mapping, compositionTests),
        transformConsistency: this.evaluateTransformConsistency(alt.mapping, transformTests),
      };
    }

    results.deltas = {};
    for (const metric of ['predictive', 'generative', 'transformConsistency']) {
      results.deltas[metric] = {};
      for (const altId of Object.keys(results.alternatives)) {
        results.deltas[metric][altId] = results.candidate[metric] - results.alternatives[altId][metric];
      }
    }

    return results;
  }

  _measureCoherence(dimensions) {
    // Simple coherence: shared properties across dimensions.
    if (dimensions.length < 2) return 1.0;
    const shared = new Set();
    const first = dimensions[0];
    if (!first) return 0;
    for (const key of Object.keys(first)) {
      if (dimensions.every((d) => d && d[key] === first[key])) shared.add(key);
    }
    return shared.size / Object.keys(first).length;
  }

  _inferRelation(dimA, dimB) {
    if (!dimA || !dimB) return 'unknown';
    if (dimA.id === dimB.id) return 'identity';
    if (dimA.macroName === dimB.macroName) return 'same_macro';
    if (dimA.keynote === dimB.keynote) return 'same_keynote';
    return 'unrelated';
  }
}

export const EVALUATOR_PROVENANCE = Object.freeze({
  h3: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/engine/address-evaluator.js (repaired revision; pass3-REPAIRED regresses the empty-query guard — NOT reproduced)' }),
  h4: Object.freeze({ status: 'SOURCE_STATEMENT', source: 'pure-synthia-phase2-REPAIRED/src/engine/dimensional-evaluator.js' }),
  determinism: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'this port — Math.random() replaced by seeded mulberry32 rng throughout' }),
  addressesAsPlainObjects: Object.freeze({ status: 'IMPLEMENTATION_CHOICE', source: 'this port — CanonicalAddress class reduced to its data content; key shape ${dimension}:${gate}:${line} preserved verbatim' }),
});

