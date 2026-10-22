// Pure Synthia Automata — experiments/scale: core records for the ported scale-ladder benchmarks

/**
 * PORT of pure-synthia-phase1-d1-d2-d31 src/core/{primitive,composite,operator}.js,
 * src/derivation/{derivation,ledger,replay}.js and src/utils/stable.js.
 *
 * ASSUMPTIONS (frozen — ported verbatim from the source package's ASSUMPTIONS.md
 * and contract files; see d1.js/d2.js/d3.js headers for the per-benchmark lists):
 *   - Equality is exact structural equality.            [SOURCE: ASSUMPTIONS.md #4]
 *   - Test labels never enter generation.               [SOURCE: ASSUMPTIONS.md #3]
 *
 * PROVENANCE (frame-reset discipline — every adapted decision is tagged):
 *   - stableStringify/fnv1a32: REUSED from src/engine/derivation.js instead of
 *     the source's src/utils/stable.js. The source's stableStringify is
 *     JSON.stringify(sortDeep(x)); ours is a hand-rolled canonical encoder with
 *     identical output for JSON-like data. The source's fnv1a32 hashes UTF-16
 *     code units; ours hashes UTF-8 bytes — identical for the all-ASCII
 *     payloads these benchmarks produce. Verified: the ported D1 derivation
 *     hash for held-out item "g" equals the sealed "64a30c93".
 *       status: IMPLEMENTATION_CHOICE (module reuse), behavior: SOURCE_STATEMENT
 *       source: pure-synthia-phase1-d1-d2-d31/src/utils/stable.js
 *   - ComplexityLedger: REUSED from src/engine/ledger.js. The source's ledger
 *     constructor initializes activeAutomata = 1 and record() never touches it;
 *     ours initializes 0 with activeAutomata as a high-water field.
 *     newBenchmarkLedger() below records {activeAutomata: 1} once to restore
 *     the source semantics exactly (sealed ledgers all show activeAutomata: 1).
 *       status: IMPLEMENTATION_CHOICE, source: pure-synthia-phase1-d1-d2-d31/src/derivation/ledger.js
 *   - ScaleDerivation.hash: hashes the source's hashPayload() fields
 *     (engine/grammar/operator versions, input, context, steps, output,
 *     ledger) — the source's Derivation excludes `id` from the hash by
 *     construction (id is derived FROM the signature, never hashed). This
 *     matches the phase-1 repair-log defect class "id/timestamp must not
 *     enter the replay-equivalence hash" — already respected here.
 *       status: SOURCE_STATEMENT, source: pure-synthia-phase1-d1-d2-d31/src/derivation/derivation.js
 *   - Operator arity: 'variadic' OR integer-minimum semantics (apply throws
 *     only when operands.length < arity). This is the REPAIRED semantics from
 *     the phase-1/phase-2 REPAIR_LOGs (defect class: strict-equality arity
 *     enforcement contradicting documented n-ary o_bundle). The sealed
 *     d1-d2-d31 package already ships the repaired form; preserved here.
 *     Our src/state-space/operators.js uses arity:'variadic' the same way.
 *       status: SOURCE_STATEMENT, source: pure-synthia-phase1-d1-d2-d31/src/core/operator.js
 */

import { stableStringify, fnv1a32 } from '../../engine/derivation.js';
import { ComplexityLedger } from '../../engine/ledger.js';

export { stableStringify, fnv1a32 };

/* ------------------------------------------------------------- Primitive */

export class Primitive {
  constructor({ id, identity, contrast = null, position = null, operations = [], dependencies = [], scale, candidateDimension = null, candidateAddress = null, evidence = [] }) {
    if (!id || !identity || !scale) throw new TypeError('Primitive requires id, identity, and scale.');
    this.id = id;
    this.identity = identity;
    this.contrast = contrast;
    this.position = position;
    this.operations = Object.freeze([...operations]);
    this.dependencies = Object.freeze([...dependencies]);
    this.scale = scale;
    this.candidateDimension = candidateDimension;
    this.candidateAddress = candidateAddress;
    this.evidence = Object.freeze([...evidence]);
    Object.freeze(this);
  }
}

/* ------------------------------------------------------------- Composite */

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export class Composite {
  constructor({ id, scale, children, operatorId, representation, context = {}, derivationId }) {
    if (!id || !scale || !operatorId || !derivationId) throw new TypeError('Composite requires id, scale, operatorId, and derivationId.');
    if (!Array.isArray(children) || children.length === 0) throw new TypeError('Composite requires children.');
    this.id = id;
    this.scale = scale;
    this.children = Object.freeze([...children]);
    this.operatorId = operatorId;
    this.representation = deepFreeze(representation);
    this.context = deepFreeze({ ...context });
    this.derivationId = derivationId;
    Object.freeze(this);
  }
}

/* -------------------------------------------------------------- Operator */

// Repaired arity semantics (see header): integer arity is a MINIMUM;
// 'variadic' requires at least one operand. Exact-count constraints belong
// in the operator's own accepts() (as o_sequence does in the source package).
export class ScaleOperator {
  constructor({ id, arity, accepts, transform, positionalRule = null, invariants = [], inverseId = null, scales = [], evidence = [] }) {
    if (!id) throw new TypeError('Operator requires id.');
    if (!((Number.isInteger(arity) && arity >= 1) || arity === 'variadic')) throw new TypeError('Invalid arity.');
    if (typeof accepts !== 'function' || typeof transform !== 'function') throw new TypeError('Operator requires accepts and transform.');
    this.id = id;
    this.arity = arity;
    this.accepts = accepts;
    this.transform = transform;
    this.positionalRule = positionalRule;
    this.invariants = Object.freeze([...invariants]);
    this.inverseId = inverseId;
    this.scales = Object.freeze([...scales]);
    this.evidence = Object.freeze([...evidence]);
  }

  apply(operands, context = {}) {
    if (!Array.isArray(operands)) throw new TypeError('Operands must be an array.');
    if (this.arity !== 'variadic' && operands.length < this.arity) throw new RangeError(`${this.id} requires at least ${this.arity} operands.`);
    if (this.arity === 'variadic' && operands.length < 1) throw new RangeError(`${this.id} requires operands.`);
    if (!this.accepts(operands, context)) throw new TypeError(`Operands rejected by ${this.id}.`);
    return this.transform(operands, context);
  }
}

/* ---------------------------------------------------- ledger (adapted) */

// Source semantics: a fresh benchmark ledger starts with one active automaton.
// status: IMPLEMENTATION_CHOICE, source: phase1-d1-d2-d31/src/derivation/ledger.js
export function newBenchmarkLedger() {
  const ledger = new ComplexityLedger();
  ledger.record({ activeAutomata: 1 });
  return ledger;
}

/* ------------------------------------------------ Derivation + replay */

function clone(value) { return JSON.parse(JSON.stringify(value)); }

export class ScaleDerivation {
  constructor({ id, engineVersion, grammarVersion, operatorVersion, input, context, steps, output, ledger }) {
    this.id = id;
    this.engineVersion = engineVersion;
    this.grammarVersion = grammarVersion;
    this.operatorVersion = operatorVersion;
    this.input = deepFreeze(clone(input));
    this.context = deepFreeze(clone(context));
    this.steps = deepFreeze(clone(steps));
    this.output = deepFreeze(clone(output));
    this.ledger = deepFreeze(clone(ledger));
    this.hash = fnv1a32(stableStringify(this.hashPayload()));
    Object.freeze(this);
  }

  hashPayload() {
    return {
      engineVersion: this.engineVersion,
      grammarVersion: this.grammarVersion,
      operatorVersion: this.operatorVersion,
      input: this.input,
      context: this.context,
      steps: this.steps,
      output: this.output,
      ledger: this.ledger,
    };
  }
}

export function replayDerivation(derivation) {
  const payload = {
    engineVersion: derivation.engineVersion,
    grammarVersion: derivation.grammarVersion,
    operatorVersion: derivation.operatorVersion,
    input: derivation.input,
    context: derivation.context,
    steps: derivation.steps,
    output: derivation.output,
    ledger: derivation.ledger,
  };
  const serialization = stableStringify(payload);
  return Object.freeze({ serialization, hash: fnv1a32(serialization) });
}

export function replayMatches(derivation) {
  return replayDerivation(derivation).hash === derivation.hash;
}

