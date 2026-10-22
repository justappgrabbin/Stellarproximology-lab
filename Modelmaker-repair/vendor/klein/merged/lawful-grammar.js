// Pure Synthia Automata — merged from synth-ai-integrated-v2.3/src/organism/organism/LawfulGrammarConstructor.mjs (BNF automaton specs with invariants; made fully deterministic — counter ids, no clocks/RNG)

/**
 * A tiny BNF-inspired declarative constructor. It generates automaton SPECS,
 * never executable strings, and every spec carries the four lawfulness
 * invariants.
 */
export const LAWFUL_INVARIANTS = Object.freeze([
  'preserve-local-identity',
  'no-claim-without-evidence',
  'reversible-before-adoption',
  'no-global-boss',
]);

export const AUTOMATON_BNF = '<automaton> → <observer> <choice> <transition> <memory> <expression>';

export const GRAMMAR_RULES = Object.freeze({
  '<automaton>': Object.freeze(['<observer> <choice> <transition> <memory> <expression>']),
  '<observer>': Object.freeze(['self', 'relation', 'world', 'human', 'capability-gap']),
  '<choice>': Object.freeze(['hold', 'question', 'relate', 'act', 'adapt', 'construct']),
  '<transition>': Object.freeze(['evidence-gated', 'pressure-gated', 'relation-gated', 'time-gated']),
  '<memory>': Object.freeze(['episodic', 'state', 'relation', 'outcome']),
  '<expression>': Object.freeze(['silent', 'question', 'action', 'morph', 'tool']),
});

export class LawfulGrammarConstructor {
  constructor() {
    this.grammar = GRAMMAR_RULES;
    this.counter = 0;
  }

  /**
   * automatonSpec({observer, choice, transition, memory, expression}) ->
   * declarative spec {id, structure, invariants, bnf}.
   * Each part must be a legal expansion of its BNF nonterminal.
   */
  automatonSpec({ observer, choice, transition, memory, expression } = {}) {
    const parts = { observer, choice, transition, memory, expression };
    const errors = [];
    for (const [slot, value] of Object.entries(parts)) {
      const legal = this.grammar[`<${slot}>`];
      if (!legal.includes(value)) {
        errors.push(`invalid <${slot}>: ${String(value)} (legal: ${legal.join(', ')})`);
      }
    }
    if (errors.length) throw new Error(`Unlawful automaton spec — ${errors.join('; ')}`);
    this.counter += 1;
    return Object.freeze({
      type: 'declarative-recursive-automaton',
      version: 1,
      id: `constructed:${this.counter}`,
      structure: Object.freeze({ ...parts }),
      bnf: AUTOMATON_BNF,
      invariants: LAWFUL_INVARIANTS,
      state: Object.freeze({ phase: 'proposed', observations: 0, transitions: 0 }),
    });
  }

  /** Validate a spec against grammar + invariants. */
  validate(spec) {
    const errors = [];
    if (spec?.type !== 'declarative-recursive-automaton') errors.push('wrong type');
    if (!spec?.id) errors.push('missing id');
    for (const slot of ['observer', 'choice', 'transition', 'memory', 'expression']) {
      const value = spec?.structure?.[slot];
      if (!value) errors.push(`missing ${slot}`);
      else if (!this.grammar[`<${slot}>`].includes(value)) errors.push(`invalid ${slot}: ${value}`);
    }
    for (const invariant of LAWFUL_INVARIANTS) {
      if (!spec?.invariants?.includes(invariant)) errors.push(`missing invariant: ${invariant}`);
    }
    return { ok: errors.length === 0, errors };
  }

  snapshot() {
    return { grammar: JSON.parse(JSON.stringify(this.grammar)), bnf: AUTOMATON_BNF, invariants: [...LAWFUL_INVARIANTS] };
  }
}

export default LawfulGrammarConstructor;

