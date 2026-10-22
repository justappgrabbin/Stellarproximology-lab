// Pure Synthia Automata — experiments/scale: the phase-2 raw corpora
// (Appendix H.3.1-H.3.3). Ported from pure-synthia-phase2.zip src/datasets/
// {linguistic,computational,synthetic}.js (ORIGINAL pre-repair variants; the
// repaired lineages kept only the D1/D2/D3 contract items — see
// src/experiments/scale/datasets.js — and dropped these raw corpora).
//
//   - LinguisticDataset: minimal pairs, word families, controlled sentences.
//   - ComputationalDataset: FSM transition tables, expression trees, automata
//     compositions.
//   - SyntheticDataset: generated-from-known-grammar ground-truth controls
//     (balanced delimiters, nested arithmetic, dependency chains).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Math.random() in SyntheticDataset generators and every split() ->
//       seeded mulberry32 (state-space/constants.js); generators take
//       {seed} (default 0) and produce identical output for identical seed.
//   F2. split()'s `sort(() => Math.random() - 0.5)` is not even a valid
//       shuffle (comparator instability) — replaced with Fisher-Yates over
//       the seeded RNG.
//
// Data rows are verbatim donor content (SOURCE_STATEMENT, Appendix H corpora).

import { mulberry32 } from '../../state-space/constants.js';

// ─── linguistic corpus (donor rows verbatim) ───

export const MINIMAL_PAIRS = Object.freeze([
  Object.freeze({ word1: 'bat', word2: 'pat', contrast: 'voice', feature: 'f.voice' }),
  Object.freeze({ word1: 'din', word2: 'tin', contrast: 'voice', feature: 'f.voice' }),
  Object.freeze({ word1: 'mat', word2: 'bat', contrast: 'manner', feature: 'f.manner.nas' }),
  Object.freeze({ word1: 'pat', word2: 'tat', contrast: 'place', feature: 'f.place.lab' }),
  Object.freeze({ word1: 'tin', word2: 'kin', contrast: 'place', feature: 'f.place.alv' }),
]);

export const WORD_FAMILIES = Object.freeze([
  Object.freeze({ root: 'act', forms: Object.freeze(['act', 'acting', 'acted', 'actor', 'action']) }),
  Object.freeze({ root: 'love', forms: Object.freeze(['love', 'loving', 'loved', 'lover', 'lovely']) }),
  Object.freeze({ root: 'read', forms: Object.freeze(['read', 'reading', 'reader', 'readable']) }),
]);

export const CONTROLLED_SENTENCES = Object.freeze([
  Object.freeze({ text: 'The cat sleeps.', structure: 'DET NOUN VERB', tokens: Object.freeze(['The', 'cat', 'sleeps']) }),
  Object.freeze({ text: 'A dog runs fast.', structure: 'DET NOUN VERB ADV', tokens: Object.freeze(['A', 'dog', 'runs', 'fast']) }),
  Object.freeze({ text: 'The big cat sleeps.', structure: 'DET ADJ NOUN VERB', tokens: Object.freeze(['The', 'big', 'cat', 'sleeps']) }),
]);

// ─── computational corpus (donor rows verbatim) ───

export const FSM_TABLES = Object.freeze([
  Object.freeze({
    states: Object.freeze(['q0', 'q1', 'q2']),
    alphabet: Object.freeze(['0', '1']),
    transitions: Object.freeze([
      Object.freeze({ from: 'q0', input: '0', to: 'q0' }),
      Object.freeze({ from: 'q0', input: '1', to: 'q1' }),
      Object.freeze({ from: 'q1', input: '0', to: 'q2' }),
      Object.freeze({ from: 'q1', input: '1', to: 'q0' }),
      Object.freeze({ from: 'q2', input: '0', to: 'q1' }),
      Object.freeze({ from: 'q2', input: '1', to: 'q2' }),
    ]),
    initial: 'q0',
    accepting: Object.freeze(['q0']),
  }),
]);

export const EXPRESSION_TREES = Object.freeze([
  Object.freeze({ op: '+', left: Object.freeze({ op: '*', left: 'a', right: 'b' }), right: 'c' }),
  Object.freeze({ op: '-', left: Object.freeze({ op: '+', left: 'x', right: 'y' }), right: 'z' }),
]);

export const AUTOMATA_COMPOSITIONS = Object.freeze([
  Object.freeze({
    components: Object.freeze(['counter', 'detector']),
    wiring: Object.freeze([Object.freeze({ from: 'counter.out', to: 'detector.in' })]),
    expected: Object.freeze({ componentCount: 2, connectionCount: 1 }),
  }),
]);

// ─── corpus classes (donor API kept; deterministic split) ───

/** Deterministic Fisher-Yates (F1/F2: donor used Math.random sort()). */
export function seededShuffle(items, seed = 0) {
  const rng = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function splitItems(items, ratios = { discovery: 0.6, validation: 0.2, test: 0.2 }, seed = 0, name = 'corpus') {
  const shuffled = seededShuffle(items, seed);
  const dEnd = Math.floor(shuffled.length * ratios.discovery);
  const vEnd = dEnd + Math.floor(shuffled.length * ratios.validation);
  return {
    discovery: shuffled.slice(0, dEnd),
    validation: shuffled.slice(dEnd, vEnd),
    test: shuffled.slice(vEnd),
    name,
  };
}

export class LinguisticDataset {
  constructor() {
    this.name = 'linguistic-phase2';
    this.items = [];
  }

  minimalPairs() {
    const items = MINIMAL_PAIRS.map((p) => ({ input: [p.word1, p.word2], expected: { contrast: p.contrast, feature: p.feature }, type: 'minimal_pair' }));
    this.items.push(...items);
    return items;
  }

  wordFamilies() {
    const items = WORD_FAMILIES.map((f) => ({ input: [...f.forms], expected: { root: f.root, familySize: f.forms.length }, type: 'word_family' }));
    this.items.push(...items);
    return items;
  }

  controlledSentences() {
    const items = CONTROLLED_SENTENCES.map((s) => ({ input: s.text, expected: { structure: s.structure, tokens: [...s.tokens] }, type: 'sentence' }));
    this.items.push(...items);
    return items;
  }

  split(ratios, seed = 0) { return splitItems(this.items, ratios, seed, this.name); }

  toJSON() { return { name: this.name, items: this.items }; }
}

export class ComputationalDataset {
  constructor() {
    this.name = 'computational-phase2';
    this.items = [];
  }

  finiteStateMachines() {
    const items = FSM_TABLES.map((fsm) => ({ input: fsm, expected: { type: 'fsm', stateCount: fsm.states.length }, type: 'finite_state_machine' }));
    this.items.push(...items);
    return items;
  }

  expressionTrees() {
    const items = EXPRESSION_TREES.map((t) => ({ input: t, expected: { operators: ['+', '*'], leaves: ['a', 'b', 'c'] }, type: 'expression_tree' }));
    this.items.push(...items);
    return items;
  }

  automataCompositions() {
    const items = AUTOMATA_COMPOSITIONS.map((c) => ({ input: c, expected: c.expected, type: 'automata_composition' }));
    this.items.push(...items);
    return items;
  }

  split(ratios, seed = 0) { return splitItems(this.items, ratios, seed, this.name); }

  toJSON() { return { name: this.name, items: this.items }; }
}

export class SyntheticDataset {
  constructor(name = 'synthetic-phase2', { seed = 0 } = {}) {
    this.name = name;
    this.items = [];
    this._rng = mulberry32(seed); // F1
  }

  // Balanced delimiters: (), [], {} (donor algorithm, seeded).
  generateBalancedDelimiters(count = 100, maxDepth = 5) {
    const delims = { '(': ')', '[': ']', '{': '}' };
    const openers = Object.keys(delims);
    const items = [];
    for (let i = 0; i < count; i++) {
      let str = '';
      const stack = [];
      const length = 4 + Math.floor(this._rng() * 12);
      for (let j = 0; j < length; j++) {
        if (stack.length === 0 || (this._rng() > 0.5 && stack.length < maxDepth)) {
          const opener = openers[Math.floor(this._rng() * openers.length)];
          str += opener;
          stack.push(opener);
        } else if (stack.length > 0) {
          str += delims[stack.pop()];
        }
      }
      while (stack.length > 0) str += delims[stack.pop()];
      items.push({ input: str, expected: 'balanced', grammar: 'delimiter' });
    }
    this.items.push(...items);
    return items;
  }

  // Recursively nested arithmetic expressions (donor algorithm, seeded).
  generateNestedExpressions(count = 100, maxDepth = 4) {
    const ops = ['+', '-', '*', '/'];
    const items = [];
    const build = (depth) => {
      if (depth <= 0) return String(Math.floor(this._rng() * 100));
      const left = build(depth - 1);
      const right = build(depth - 1);
      const op = ops[Math.floor(this._rng() * ops.length)];
      return `(${left}${op}${right})`;
    };
    for (let i = 0; i < count; i++) {
      const depth = 1 + Math.floor(this._rng() * maxDepth);
      items.push({ input: build(depth), expected: 'expression', grammar: 'arithmetic' });
    }
    this.items.push(...items);
    return items;
  }

  // Dependency chains: A -> B -> C implies A ~~> C (deterministic already).
  generateDependencyChains(count = 50, chainLength = 5) {
    const items = [];
    for (let i = 0; i < count; i++) {
      const chain = [];
      for (let j = 0; j < chainLength; j++) chain.push(`node_${i}_${j}`);
      items.push({ input: chain, expected: { transitive: [`${chain[0]}~~>${chain[chain.length - 1]}`] }, grammar: 'dependency' });
    }
    this.items.push(...items);
    return items;
  }

  split(ratios, seed = 0) { return splitItems(this.items, ratios, seed, this.name); }

  toJSON() { return { name: this.name, items: this.items }; }
}

export const PHASE_CORPORA_PROVENANCE = Object.freeze({
  source: 'pure-synthia-phase2.zip/src/datasets/{linguistic,computational,synthetic}.js (ORIGINAL pre-repair variants)',
  data: 'SOURCE_STATEMENT (Appendix H.3.1-H.3.3 rows verbatim)',
  f1: 'Math.random generators/split -> seeded mulberry32 (identical output per seed)',
  f2: 'split() used comparator-shuffle (invalid); now seeded Fisher-Yates',
});

export default LinguisticDataset;

