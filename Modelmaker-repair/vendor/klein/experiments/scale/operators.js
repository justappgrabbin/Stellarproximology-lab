// Pure Synthia Automata — experiments/scale: benchmark operators o_bundle / o_sequence (sealed representation shapes)

/**
 * PORT of pure-synthia-phase1-d1-d2-d31/src/operators/{bundle,sequence}.js.
 *
 * These are the SEALED benchmark operators. Their representation shapes
 * (members carry {axis, stateId} / {position, stateId}) are reproduced
 * verbatim because the sealed signatures and derivation hashes are defined
 * over exactly these shapes. Our general-purpose state-space operators
 * (src/state-space/operators.js: o_bundle 'Fusion', o_sequence 'Chain') use
 * richer representation shapes ({slot, member} / {position, member}) and
 * remain the production operators; this module is the frozen benchmark
 * dialect of the same two ideas.
 *   status: SOURCE_STATEMENT (behavior), IMPLEMENTATION_CHOICE (keeping the
 *   benchmark dialect separate from src/state-space/operators.js)
 *   source: pure-synthia-phase1-d1-d2-d31/src/operators/{bundle,sequence}.js
 */

import { ScaleOperator } from './core.js';

export function createBundleOperator() {
  return new ScaleOperator({
    id: 'o_bundle',
    arity: 'variadic',
    accepts(operands) {
      const axes = operands.map((operand) => operand.position?.axis);
      return axes.every(Boolean) && new Set(axes).size === axes.length;
    },
    transform(operands) {
      return Object.freeze({
        operator: 'o_bundle',
        members: Object.freeze(
          operands.map((operand) => ({ axis: operand.position.axis, stateId: operand.id }))
            .sort((a, b) => a.axis.localeCompare(b.axis)),
        ),
      });
    },
    invariants: ['constituent-identity', 'one-value-per-axis'],
    scales: ['sub-phonemic', 'phoneme'],
  });
}

export function canonicalBundleSignature(representation) {
  if (representation.operator !== 'o_bundle') throw new TypeError('Expected o_bundle.');
  return representation.members.map(({ axis, stateId }) => `${axis}:${stateId}`).sort().join('|');
}

export function createSequenceOperator() {
  return new ScaleOperator({
    id: 'o_sequence',
    arity: 'variadic',
    accepts: (operands) => operands.every((operand) => operand?.id),
    transform(operands) {
      return Object.freeze({
        operator: 'o_sequence',
        members: Object.freeze(operands.map((operand, position) => Object.freeze({ position, stateId: operand.id }))),
      });
    },
    positionalRule: 'index-preserving',
    invariants: ['constituent-identity', 'order'],
  });
}

export function canonicalSequenceSignature(representation) {
  if (representation.operator !== 'o_sequence') throw new TypeError('Expected o_sequence.');
  return representation.members.map(({ position, stateId }) => `${position}:${stateId}`).join('|');
}

