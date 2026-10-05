// Pure Synthia Automata — experiments/scale: Finite State Machine as a first-class
// primitive at the "automaton" scale. Ported from pure-synthia-pass3.zip
// src/automata/fsm.js (original, pre-repair variant; the repaired lineages dropped
// the automaton scale entirely).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Epsilon blindness: AutomataComposer (automata-composition.js) connects
//       composed machines with epsilon transitions (input "ε"), but the
//       original run() matched transitions by exact input symbol only — every
//       sequentially/Kleene-composed machine got stuck at its composition
//       boundary ("no_transition"). run() now takes epsilon closures before
//       and after each symbol (visited-set guarded, so epsilon cycles
//       terminate). Un-composed machines behave exactly as before.
//   F2. Non-deterministic "take first match" when several transitions match a
//       symbol: run() now explores ALL matches (breadth-first, insertion
//       order — deterministic) and reports the first accepting path, instead
//       of silently committing to the first transition.
//
// The original was already deterministic (counter ids `trans:...`, no
// Date.now/Math.random) — kept verbatim.

export const EPSILON = 'ε';

export class FSMState {
  constructor({ id, name, accepting = false, initial = false, metadata = {} }) {
    this.id = id;
    this.name = name;
    this.accepting = accepting;
    this.initial = initial;
    this.metadata = { ...metadata };
    Object.freeze(this);
  }

  toJSON() {
    return { id: this.id, name: this.name, accepting: this.accepting, initial: this.initial, metadata: this.metadata };
  }
}

export class FSMTransition {
  constructor({ from, to, input, output = null, metadata = {} }) {
    this.from = from;
    this.to = to;
    this.input = input;
    this.output = output;
    this.metadata = { ...metadata };
    Object.freeze(this);
  }

  toJSON() {
    return { from: this.from, to: this.to, input: this.input, output: this.output, metadata: this.metadata };
  }
}

export class FiniteStateMachine {
  constructor({ id, name, states = [], transitions = [], alphabet = [] }) {
    this.id = id;
    this.name = name;
    this.states = new Map(states.map((s) => [s.id, s]));
    this.transitions = new Map();
    this.alphabet = new Set(alphabet);
    this._transitionCounter = 0;
    for (const t of transitions) this.addTransition(t);
  }

  addState(state) {
    this.states.set(state.id, state);
    return this;
  }

  addTransition(transition) {
    const tid = `trans:${this.id}:${++this._transitionCounter}`;
    this.transitions.set(tid, transition);
    if (transition.input) this.alphabet.add(transition.input);
    return tid;
  }

  getInitialState() {
    for (const s of this.states.values()) {
      if (s.initial) return s;
    }
    return this.states.values().next().value || null;
  }

  getAcceptingStates() {
    return [...this.states.values()].filter((s) => s.accepting);
  }

  // Transitions leaving stateId on exactly this input symbol.
  step(stateId, input) {
    const matches = [];
    for (const t of this.transitions.values()) {
      if (t.from === stateId && t.input === input) matches.push(t);
    }
    return matches;
  }

  // F1: epsilon closure of a state set (epsilon cycles terminate via visited set).
  epsilonClosure(stateIds) {
    const seen = new Set(stateIds);
    const queue = [...stateIds];
    while (queue.length > 0) {
      const id = queue.shift();
      for (const t of this.transitions.values()) {
        if (t.from === id && t.input === EPSILON && !seen.has(t.to)) {
          seen.add(t.to);
          queue.push(t.to);
        }
      }
    }
    return seen;
  }

  /**
   * Run the machine on an input string (iterable of symbols).
   * F1+F2: epsilon-closed, breadth-first over all matching transitions
   * (insertion order = deterministic); returns the first accepting path, or
   * the failure of the longest-lived branch.
   */
  run(inputString) {
    const initial = this.getInitialState();
    if (!initial) return { accepted: false, path: [], reason: 'no_initial_state' };

    const symbols = [...inputString];
    const startClosure = this.epsilonClosure([initial.id]);
    // Frontier of live branches: { stateId, path }.
    let frontier = [...startClosure].map((stateId) => ({ stateId, path: [{ state: stateId, input: null }] }));
    let lastFailure = null;

    for (const symbol of symbols) {
      const next = [];
      for (const branch of frontier) {
        const matches = this.step(branch.stateId, symbol);
        if (matches.length === 0) {
          lastFailure = { accepted: false, path: branch.path, reason: 'no_transition', stuckAt: symbol };
          continue;
        }
        for (const t of matches) {
          for (const closedId of this.epsilonClosure([t.to])) {
            next.push({
              stateId: closedId,
              path: [...branch.path, { state: closedId, input: symbol, transition: t.toJSON() }],
            });
          }
        }
      }
      frontier = next;
      if (frontier.length === 0) return lastFailure || { accepted: false, path: [], reason: 'no_transition', stuckAt: symbol };
    }

    const accepting = frontier.find((b) => this.states.get(b.stateId)?.accepting);
    const best = accepting || frontier[0];
    return {
      accepted: Boolean(accepting),
      path: best.path,
      finalState: best.stateId,
      branchesExplored: frontier.length,
    };
  }

  // Convert to a primitive-compatible structure (automaton scale).
  toPrimitive() {
    return {
      id: this.id,
      identity: this.name,
      scale: 'automaton',
      type: 'fsm',
      stateCount: this.states.size,
      transitionCount: this.transitions.size,
      alphabet: [...this.alphabet],
      states: [...this.states.values()].map((s) => s.toJSON()),
      transitions: [...this.transitions.values()].map((t) => t.toJSON()),
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      states: [...this.states.values()].map((s) => s.toJSON()),
      transitions: [...this.transitions.values()].map((t) => t.toJSON()),
      alphabet: [...this.alphabet],
    };
  }

  static fromJSON(data) {
    return new FiniteStateMachine({
      id: data.id,
      name: data.name,
      states: data.states.map((s) => new FSMState(s)),
      transitions: data.transitions.map((t) => new FSMTransition(t)),
      alphabet: data.alphabet,
    });
  }
}

export const FSM_PROVENANCE = Object.freeze({
  source: 'pure-synthia-pass3.zip/src/automata/fsm.js (ORIGINAL pre-repair variant; automaton scale dropped by the repaired lineages)',
  f1: 'epsilon closure added — composed machines were unrunnable (epsilon transitions never followed)',
  f2: 'all-match breadth-first run replaces silent first-match commit',
});

export default FiniteStateMachine;
