// Pure Synthia Automata — experiments/scale: automata composition + the
// automaton/discourse-scale operators. Ported from pure-synthia-pass3.zip
// src/automata/composition.js, src/operators/automaton.js, src/operators/discourse.js
// (ORIGINAL pre-repair variants; the automaton/discourse scale was dropped by
// the repaired lineages).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. The donor operators imported the phase-lineage core/operator.js class
//       (an engine shape this tree does not have — the "assumed engine shapes"
//       repair-log class of defect). Ported as plain {id, arity, accepts,
//       transform, apply} objects — same contract surface, no external core.
//   F2. (examined, NOT a defect — kept verbatim) o_discourse's result-scale
//       ladder: sentence-only compositions -> paragraph; any paragraph or
//       discourse operand -> discourse. This is the donor's intended
//       higher-order-unit semantics, preserved as-is.
//   F3. composeKleene marked ALL states accepting (the donor comment says so
//       deliberately, but it makes A* accept every prefix, not just repeated
//       ones — plus the empty string only if the initial state was accepting).
//       Fixed: original accepting states stay accepting and the initial state
//       becomes accepting (empty string), per standard Kleene star.
//   Composed machines are runnable here because fsm.js run() follows epsilon
//       transitions (see fsm.js F1) — in the donor they dead-ended.

import { FiniteStateMachine, FSMState, FSMTransition, EPSILON } from './fsm.js';

export class AutomataComposer {
  constructor() {
    this._fsmCounter = 0;
  }

  // Sequential composition: A then B (A's accepting states epsilon-connect to B's initial).
  composeSequential(fsmA, fsmB, options = {}) {
    const newId = `fsm:seq:${++this._fsmCounter}`;
    const result = new FiniteStateMachine({ id: newId, name: `${fsmA.name}_then_${fsmB.name}` });

    const aMap = new Map();
    for (const s of fsmA.states.values()) {
      const newState = new FSMState({ id: `${newId}:A:${s.id}`, name: s.name, accepting: false, initial: s.initial });
      aMap.set(s.id, newState.id);
      result.addState(newState);
    }
    const bMap = new Map();
    for (const s of fsmB.states.values()) {
      const newState = new FSMState({ id: `${newId}:B:${s.id}`, name: s.name, accepting: s.accepting, initial: false });
      bMap.set(s.id, newState.id);
      result.addState(newState);
    }
    for (const t of fsmA.transitions.values()) {
      result.addTransition(new FSMTransition({ from: aMap.get(t.from), to: aMap.get(t.to), input: t.input, output: t.output }));
    }
    for (const t of fsmB.transitions.values()) {
      result.addTransition(new FSMTransition({ from: bMap.get(t.from), to: bMap.get(t.to), input: t.input, output: t.output }));
    }
    const bInitial = fsmB.getInitialState();
    if (bInitial) {
      const bInitialNew = bMap.get(bInitial.id);
      for (const s of fsmA.getAcceptingStates()) {
        result.addTransition(new FSMTransition({
          from: aMap.get(s.id), to: bInitialNew, input: options.epsilon || EPSILON,
          metadata: { type: 'epsilon', composition: 'sequential' },
        }));
      }
    }
    return result;
  }

  // Parallel composition: product of states, transitions synchronized on equal input.
  composeParallel(fsmA, fsmB, options = {}) {
    const newId = `fsm:par:${++this._fsmCounter}`;
    const result = new FiniteStateMachine({ id: newId, name: `${fsmA.name}_par_${fsmB.name}` });

    const stateMap = new Map();
    for (const sa of fsmA.states.values()) {
      for (const sb of fsmB.states.values()) {
        const pairId = `${newId}:${sa.id}:${sb.id}`;
        stateMap.set(`${sa.id}:${sb.id}`, pairId);
        result.addState(new FSMState({
          id: pairId, name: `(${sa.name},${sb.name})`,
          accepting: sa.accepting && sb.accepting, initial: sa.initial && sb.initial,
        }));
      }
    }
    for (const ta of fsmA.transitions.values()) {
      for (const tb of fsmB.transitions.values()) {
        if (ta.input === tb.input || options.synchronize === false) {
          const fromPair = stateMap.get(`${ta.from}:${tb.from}`);
          const toPair = stateMap.get(`${ta.to}:${tb.to}`);
          if (fromPair && toPair) {
            result.addTransition(new FSMTransition({
              from: fromPair, to: toPair,
              input: ta.input === tb.input ? ta.input : `${ta.input}/${tb.input}`,
              metadata: { composition: 'parallel' },
            }));
          }
        }
      }
    }
    return result;
  }

  // Kleene star: A* (zero or more repetitions). F3: accepting = original
  // accepting states + initial state (empty string); epsilon loops back.
  composeKleene(fsmA, options = {}) {
    const newId = `fsm:kleene:${++this._fsmCounter}`;
    const result = new FiniteStateMachine({ id: newId, name: `${fsmA.name}*` });

    const stateMap = new Map();
    for (const s of fsmA.states.values()) {
      const newState = new FSMState({
        id: `${newId}:${s.id}`, name: s.name,
        accepting: s.accepting || Boolean(s.initial), // F3 fix (donor: all states accepting)
        initial: s.initial,
      });
      stateMap.set(s.id, newState.id);
      result.addState(newState);
    }
    for (const t of fsmA.transitions.values()) {
      result.addTransition(new FSMTransition({
        from: stateMap.get(t.from), to: stateMap.get(t.to), input: t.input, output: t.output,
      }));
    }
    const initial = fsmA.getInitialState();
    if (initial) {
      for (const s of fsmA.getAcceptingStates()) {
        result.addTransition(new FSMTransition({
          from: stateMap.get(s.id), to: stateMap.get(initial.id), input: options.epsilon || EPSILON,
          metadata: { type: 'epsilon', composition: 'kleene' },
        }));
      }
    }
    return result;
  }
}

// ─── plain-object operator contract (F1: no phase-lineage core dependency) ───
function makeOperator({ id, arity, accepts, transform, positionalRule = null, invariants = [], scales = [] }) {
  const apply = (operands, context = {}) => {
    if (!Array.isArray(operands) || operands.length < arity) {
      throw new RangeError(`${id} requires at least ${arity} operands.`);
    }
    if (!accepts(operands, context)) throw new TypeError(`Operands rejected by ${id}.`);
    return transform(operands, context);
  };
  return Object.freeze({ id, arity, accepts, transform, apply, positionalRule, invariants: Object.freeze(invariants), scales: Object.freeze(scales) });
}

/**
 * o_automaton: compose automata via sequential/parallel/Kleene composition.
 * context.mode: 'sequential' (default) | 'parallel' | 'kleene'.
 * (Donor: pass3_orig/src/operators/automaton.js.)
 */
export function createAutomatonOperator(composer = new AutomataComposer()) {
  const isFSM = (op) => op && (op.states || op.type === 'fsm' || op.scale === 'automaton');
  return makeOperator({
    id: 'o_automaton',
    arity: 2,
    accepts: (operands) => operands.length >= 2 && isFSM(operands[0]) && isFSM(operands[1]),
    transform: (operands, context = {}) => {
      const mode = context.mode || 'sequential';
      const fsmA = operands[0]._fsm || operands[0];
      const fsmB = operands[1]._fsm || operands[1];
      let result;
      switch (mode) {
        case 'parallel': result = composer.composeParallel(fsmA, fsmB, context); break;
        case 'kleene': result = composer.composeKleene(fsmA, context); break;
        case 'sequential':
        default: result = composer.composeSequential(fsmA, fsmB, context); break;
      }
      return {
        operator: 'o_automaton',
        mode,
        fsmA: fsmA.id || fsmA.name,
        fsmB: fsmB.id || fsmB.name,
        result: result.toPrimitive(),
        fsm: result, // live machine (runnable via fsm.js run(), incl. epsilon fixes)
        stateCount: result.states.size,
        transitionCount: result.transitions.size,
        scale: 'automaton',
      };
    },
    invariants: ['state_preservation', 'transition_completeness'],
    scales: ['automaton'],
  });
}

/**
 * o_discourse: compose tokens at the paragraph/discourse level — the
 * higher-order analogue of o_sequence. (Donor: pass3_orig/src/operators/discourse.js;
 * F2 scale-ladder fix.)
 */
export function createDiscourseOperator() {
  const DISCOURSE_SCALES = ['sentence', 'paragraph', 'discourse'];
  return makeOperator({
    id: 'o_discourse',
    arity: 2,
    accepts: (operands) =>
      operands.length >= 2 && operands.every((op) => op && DISCOURSE_SCALES.includes(op.scale)),
    transform: (operands, context = {}) => {
      const members = operands.map((op, idx) => ({
        position: idx,
        stateId: op.id,
        scale: op.scale,
        text: op.text ? op.text.substring(0, 50) : op.id,
      }));
      // Donor ladder, verbatim (F2 examined, not a defect): sentence-only ->
      // paragraph; any paragraph/discourse operand -> discourse.
      const scales = new Set(operands.map((o) => o.scale));
      const resultScale = scales.has('discourse') ? 'discourse'
        : scales.has('paragraph') ? 'discourse'
        : 'paragraph';
      return {
        operator: 'o_discourse',
        members,
        scale: resultScale,
        unitCount: operands.length,
        context: { ...context },
      };
    },
    positionalRule: 'order_preserving',
    invariants: ['unit-identity-preserved', 'order-sensitive'],
    scales: DISCOURSE_SCALES,
  });
}

export const AUTOMATA_COMPOSITION_PROVENANCE = Object.freeze({
  source: 'pure-synthia-pass3.zip/src/{automata/composition.js,operators/automaton.js,operators/discourse.js} (ORIGINAL pre-repair variants)',
  composition: 'SOURCE_STATEMENT (sequential/parallel/Kleene wiring, verbatim; counter ids kept)',
  f1: 'operators ported as plain objects — donor assumed the phase-lineage core/operator.js engine shape',
  f2: 'o_discourse scale ladder examined and kept verbatim (donor higher-order-unit semantics; not a defect)',
  f3: 'composeKleene accepting set fixed (donor marked every state accepting)',
});

export default AutomataComposer;
