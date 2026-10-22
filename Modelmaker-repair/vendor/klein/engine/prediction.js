// Pure Synthia Automata — prediction mechanism foundation: lawful next-state
// enumeration (FRAGMENT_ALGEBRA_SPEC §5, tables T17/T19/T26-PL9).
//
// This is MECHANISM, NOT ORACLE: enumeration is provably complete over the
// formal system (E1-E6); any correlation between enumerated successors and
// real-world outcomes is hypothesis H-F7. See PREDICTION_DISCLAIMER.
//
// State representation (spec §5): state = {ben: gate, lines: [v1..v6] each in
// {6,7,8,9}, context?}. A static hexagram (all lines 7/8) is the degenerate
// case k = 0. Every function here is pure and deterministic.

import { gateBits, gateFromBits } from '../state-space/addressing.js';
import { operatorById } from '../state-space/operators.js';
import { TRIGRAMS } from '../state-space/constants.js';

const freeze = (x) => Object.freeze(x);

// ---------------------------------------------------------------------------
// Defensive fragments.js integration (parallel-owned module). Feature-detect
// every export; fallbacks keep this module green when fragments.js is absent
// or unfinished.

import * as fragmentsNamespace from '../state-space/fragments.js';
const fragmentsModule = fragmentsNamespace;

export const FRAGMENTS = freeze({
  available: Object.keys(fragmentsModule).length > 0,
  hasEvaluateReading: typeof fragmentsModule.evaluateReading === 'function',
  hasOSwap: typeof fragmentsModule.o_swap === 'function' || typeof fragmentsModule.oSwap === 'function'
    || typeof fragmentsModule.swapTrigrams === 'function',
  hasTrigramMatrix: fragmentsModule.TRIGRAM_MATRIX != null,
  hasCastingDistributions: fragmentsModule.CASTING != null || fragmentsModule.CASTING_DISTRIBUTIONS != null,
});

// P4c — jiao gua: upper<->lower trigram exchange [b1..b6] -> [b4,b5,b6,b1,b2,b3].
// Local reference implementation; if fragments.js ships an o_swap that agrees
// on the probe, the fragments version is used instead.
function localSwapBits(bits) {
  return [bits[3], bits[4], bits[5], bits[0], bits[1], bits[2]];
}

function resolveSwap() {
  const cand = fragmentsModule.o_swap ?? fragmentsModule.oSwap ?? fragmentsModule.swapTrigrams ?? null;
  if (typeof cand === 'function') {
    try {
      const probeIn = [1, 0, 0, 0, 1, 0]; // gate 3 bits
      const probe = cand(probeIn);
      const probeBits = Array.isArray(probe) ? probe : (probe && Array.isArray(probe.bits) ? probe.bits : null);
      if (probeBits && probeBits.length === 6 && probeBits.join(',') === localSwapBits(probeIn).join(',')) {
        return { fn: (bits) => { const r = cand(bits); return Array.isArray(r) ? r : r.bits; }, source: 'fragments.js' };
      }
    } catch { /* fall through to local */ }
  }
  return { fn: localSwapBits, source: 'local (P4c reference)' };
}

const SWAP = resolveSwap();
export const SWAP_SOURCE = SWAP.source;

// ---------------------------------------------------------------------------
// PREDICTION_DISCLAIMER — quoted from FRAGMENT_ALGEBRA_SPEC §5 / T19 H-F7.

export const PREDICTION_DISCLAIMER =
  'This is mechanism, not oracle: enumeration is provably complete over the formal system; ' +
  'any correlation between enumerated successors and real-world outcomes is hypothesis (H-F7). ' +
  '"The corpus itself mostly refuses this claim (Adler p.73 \'tending\', not fate; Moog G2 ' +
  '\'warnings not predictions\'; D\'Aoust R2 against predictive divination). The mechanism ' +
  '(E1-E6) stands regardless." — FRAGMENT_ALGEBRA_SPEC §5, T19';

// ---------------------------------------------------------------------------
// State normalization. Accepts a gate number (static cast, k=0) or
// {ben, lines:[v1..v6 in 6/7/8/9]}. Parity: 7/9 -> yang bit 1, 6/8 -> yin 0.

export function normalizeState(state) {
  if (Number.isInteger(state)) {
    if (state < 1 || state > 64) throw new RangeError(`gate must be 1-64, got ${state}`);
    return freeze({ ben: state, lines: freeze(gateBits(state).map((b) => (b ? 7 : 8))), context: null });
  }
  if (!state || !Number.isInteger(state.ben)) {
    throw new TypeError('state must be a gate number or {ben: gate 1-64, lines: [6 values in {6,7,8,9}]}');
  }
  const lines = state.lines ? state.lines.slice() : gateBits(state.ben).map((b) => (b ? 7 : 8));
  if (lines.length !== 6 || lines.some((v) => ![6, 7, 8, 9].includes(v))) {
    throw new RangeError('state.lines must be 6 casting values in {6,7,8,9}');
  }
  return freeze({ ben: state.ben, lines: freeze(lines), context: state.context ?? null });
}

export function movingLinesOf(state) {
  const s = normalizeState(state);
  return freeze(s.lines.map((v, i) => ((v === 6 || v === 9) ? i + 1 : 0)).filter(Boolean));
}

// A resulting gate as a fresh static state (all lines 7/8 carrying the bits).
const staticState = (gate, from, via) => freeze({
  ben: gate,
  lines: freeze(gateBits(gate).map((b) => (b ? 7 : 8))),
  context: freeze({ from, via }),
});

// ---------------------------------------------------------------------------
// T7 King Wen pair sequence (32 pairs) for E6 pair-axis navigation.

export const KING_WEN_PAIRS = freeze([
  [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
  [33, 34], [35, 36], [37, 38], [39, 40], [41, 42], [43, 44], [45, 46], [47, 48],
  [49, 50], [51, 52], [53, 54], [55, 56], [57, 58], [59, 60], [61, 62], [63, 64],
].map((p) => freeze(p)));

export function pairPartner(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError(`gate must be 1-64, got ${gate}`);
  for (const [a, b] of KING_WEN_PAIRS) {
    if (a === gate) return b;
    if (b === gate) return a;
  }
  return null; // unreachable for 1-64
}

// ---------------------------------------------------------------------------
// E1 — change closure: the 2^k Boolean lattice over the k moving lines.
// enumerateLattice(bits|gate, changingLines|count, {maxDepth}) — lowest lines
// first when only a count is given (spec E1: the traditional path is the
// lowest-line-first chain). Nodes are subsets with popcount <= maxDepth.

export function enumerateLattice(bitsOrGate, changing, { maxDepth = null } = {}) {
  const bits = Array.isArray(bitsOrGate) ? bitsOrGate.slice() : gateBits(bitsOrGate);
  if (bits.length !== 6) throw new RangeError('enumerateLattice expects 6 bits or a gate 1-64');
  const lines = Array.isArray(changing)
    ? changing.slice().sort((a, b) => a - b)
    : Array.from({ length: changing }, (_, i) => i + 1); // count -> lowest-line-first
  if (lines.some((l) => !Number.isInteger(l) || l < 1 || l > 6)) {
    throw new RangeError('changing lines must be positions 1-6');
  }
  const k = lines.length;
  const depth = maxDepth == null ? k : Math.min(maxDepth, k);
  const nodes = [];
  const edges = [];
  const byMask = new Map();
  for (let m = 0; m < (1 << k); m++) {
    const popcount = m.toString(2).split('1').length - 1;
    if (popcount > depth) continue;
    const mask = [0, 0, 0, 0, 0, 0];
    for (let j = 0; j < k; j++) if ((m >> j) & 1) mask[lines[j] - 1] = 1;
    const targetBits = bits.map((b, i) => b ^ mask[i]);
    const gate = gateFromBits(targetBits);
    const node = freeze({ mask: freeze(mask), depth: popcount, bits: freeze(targetBits), gate });
    byMask.set(m, node);
    nodes.push(node);
  }
  for (const [m, node] of byMask) {
    for (let j = 0; j < k; j++) {
      if (!((m >> j) & 1)) {
        const up = byMask.get(m | (1 << j));
        if (up) edges.push(freeze({ from: node.gate, to: up.gate, line: lines[j] }));
      }
    }
  }
  return freeze({
    k, maxDepth: depth,
    changingLines: freeze(lines),
    nodes: freeze(nodes),
    edges: freeze(edges),
    bottom: byMask.get(0).gate,           // Ben Gua (no flip)
    top: byMask.get((1 << k) - 1)?.gate ?? byMask.get(0).gate, // Zhi Gua (all flips)
  });
}

// ---------------------------------------------------------------------------
// successors(state, {rules}) — the full lawful-successor inventory (T19):
//   E1: 2^k change-lattice subsets of the moving lines (incl. Ben Gua itself)
//   E2: operator images — o_reverse, o_inverse, o_swap (P4c), o_converse,
//       o_nuclear, o_change over the 6 single-line masks
//   E6: pair-axis navigation — the King Wen pair partner
// Dedup: the successor SET is the quotient of these images (spec E2 note).
// Returns a frozen array of frozen {state, via, rule}.

export const SUCCESSOR_RULES = freeze(['E1', 'E2', 'E6']);

export function successors(state, { rules = SUCCESSOR_RULES } = {}) {
  const s = normalizeState(state);
  const bits = gateBits(s.ben);
  const moving = s.lines.map((v, i) => ((v === 6 || v === 9) ? i + 1 : 0)).filter(Boolean);
  const wanted = new Set(rules);
  const seen = new Set();
  const out = [];
  const push = (gate, via, rule) => {
    if (seen.has(gate)) return;
    seen.add(gate);
    out.push(freeze({ state: staticState(gate, s.ben, via), via, rule }));
  };

  if (wanted.has('E1')) {
    const lattice = enumerateLattice(bits, moving);
    for (const node of lattice.nodes) push(node.gate, 'change-lattice', 'E1');
  }

  if (wanted.has('E2')) {
    const reverse = operatorById('o_reverse').transform(bits);
    push(gateFromBits(reverse), 'operator:o_reverse (qian gua)', 'E2');
    const inverse = operatorById('o_inverse').transform(bits);
    push(gateFromBits(inverse), 'operator:o_inverse (pang tong)', 'E2');
    push(gateFromBits(SWAP.fn(bits)), 'operator:o_swap (jiao gua)', 'E2');
    const converse = operatorById('o_converse').transform(bits);
    push(gateFromBits(converse), 'operator:o_converse (antipode)', 'E2');
    push(operatorById('o_nuclear').transform(bits).gate, 'operator:o_nuclear (hu gua)', 'E2');
    for (let line = 1; line <= 6; line++) {
      push(operatorById('o_change').transform([bits, [line]]).gate, `operator:o_change (zhi gua, line ${line})`, 'E2');
    }
  }

  if (wanted.has('E6')) {
    push(pairPartner(s.ben), 'pair:king-wen', 'E6');
  }

  return freeze(out);
}

// ---------------------------------------------------------------------------
// E4 / T17 — Zhu Xi 8-case evaluation selection. Uses fragments'
// evaluateReading when available; otherwise the local deterministic table.

const ZHU_XI_CASES = freeze([
  freeze({ k: 0, answer: 'Tuan (Judgement) of the original hexagram; inner trigram = zhen (question), outer = hui (prognostication)', ruling: 'judgement of ben gua' }),
  freeze({ k: 1, answer: "the changing line's own statement (yaoci) of the original hexagram", ruling: 'the moving line' }),
  freeze({ k: 2, answer: 'both changing-line statements of the original hexagram; the UPPER one rules', ruling: 'upper moving line' }),
  freeze({ k: 3, answer: "Tuan of BOTH original and resulting hexagrams; original = zhen, resulting = hui ('first ten hexagrams zhen rules; latter ten hui rules')", ruling: 'both judgements' }),
  freeze({ k: 4, answer: 'the two UNCHANGED line statements of the RESULTING hexagram; the LOWER one rules', ruling: 'lower unchanged line of zhi gua' }),
  freeze({ k: 5, answer: 'the one unchanged line statement of the RESULTING hexagram', ruling: 'the unchanged line of zhi gua' }),
  freeze({ k: 6, answer: "if Qian or Kun: the 'Using all' (yong) text; otherwise the Tuan of the RESULTING hexagram", ruling: 'yong text (Qian/Kun) or judgement of zhi gua' }),
]);

export function readingPath(changingLines, { ben = null, zhi = null } = {}) {
  if (!Array.isArray(changingLines)) throw new TypeError('readingPath expects an array of changing line positions');
  const lines = changingLines.slice().sort((a, b) => a - b);
  const k = lines.length;
  if (FRAGMENTS.hasEvaluateReading) {
    try {
      // fragments.js signature: evaluateReading({benGua, zhiGua, changingLines})
      // -> {k, layer, lines, ruling, description}
      const r = fragmentsModule.evaluateReading({ benGua: ben, zhiGua: zhi, changingLines: lines });
      if (r && typeof r === 'object' && Number.isInteger(r.k)) {
        return freeze({
          via: 'fragments.evaluateReading',
          k: r.k,
          case: `K${r.k}`,
          movingLines: freeze((r.lines && r.lines.length ? r.lines : lines).slice()),
          answer: r.description,
          ruling: r.ruling,
          layer: r.layer,
          ben, zhi,
          sources: ['Adler pp.70-71', 'Hatcher vol.2 pp.33-34', 'Rutt pp.100,137'],
        });
      }
    } catch { /* fall through to the local T17 table */ }
  }
  const entry = ZHU_XI_CASES[Math.min(k, 6)];
  const yong = k === 6 && (ben === 1 || ben === 2); // Qian all-nines / Kun all-sixes always read yong
  return freeze({
    via: 'local T17 table',
    k,
    case: `K${k}`,
    movingLines: freeze(lines),
    answer: yong ? "the 'Using all' (yong) text (Qian/Kun special case)" : entry.answer,
    ruling: yong ? 'yong text' : entry.ruling,
    ben, zhi,
    sources: ['Adler pp.70-71', 'Hatcher vol.2 pp.33-34', 'Rutt pp.100,137'],
  });
}

// ---------------------------------------------------------------------------
// PL9 — Ban Xiang subject/object trigram grid (GGM §6f.9 [L3746-3765,
// L4179-4262]). Zhen (lower) = Subject/Agent; Hui (upper) = Object/
// Environment. Composes with E2/E6 pair-axis machinery.

const trigramByValue = (v) => TRIGRAMS.find((t) => t.value === v);

export function banXiangGrid(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError(`gate must be 1-64, got ${gate}`);
  const bits = gateBits(gate);
  const lower = trigramByValue(bits[0] | (bits[1] << 1) | (bits[2] << 2));
  const upper = trigramByValue(bits[3] | (bits[4] << 1) | (bits[5] << 2));
  const inverseBits = bits.map((b) => 1 - b);
  const reverseBits = [...bits].reverse();
  const swapBits = SWAP.fn(bits);
  const nuclear = operatorById('o_nuclear').transform(bits).gate;
  const same = (a, b) => a.join(',') === b.join(',');
  return freeze({
    gate,
    subject: freeze({ trigram: lower.id, name: lower.name, position: 'zhen (lower)',
      role: 'Subject/Agent — who acts; personal momentum, bases, motives, hopes' }),
    object: freeze({ trigram: upper.id, name: upper.name, position: 'hui (upper)',
      role: 'Object/Environment — what is acted upon; growth potential, tools, raw materials' }),
    changeTypes: freeze({
      Derivation: 'ben gua -> zhi gua (o_change)',
      Combination: 'o_bundle', Sequence: 'o_sequence', Cycle: 'twelve sovereign gua (P8)',
      Substitution: 'line substitution (o_change masks)',
      Transposition: 'o_swap (jiao gua, P4c)', Permutation: 'shi er (12-sovereign permutation)',
    }),
    pairs: freeze({
      inverse: freeze({ gate: gateFromBits(inverseBits), relation: 'pang tong (radial symmetry)' }),
      reverse: freeze({ gate: gateFromBits(reverseBits), relation: 'qian gua' }),
      swap: freeze({ gate: gateFromBits(swapBits), relation: 'jiao gua (triangular symmetry)' }),
      nuclear: freeze({ gate: nuclear, relation: 'hu gua (lines 2-3-4 / 3-4-5)' }),
      kingWen: freeze({ gate: pairPartner(gate), relation: 'received-sequence partner' }),
    }),
    symmetry: freeze({
      selfInverse: same(inverseBits, bits),
      selfReverse: same(reverseBits, bits),
      selfSwap: same(swapBits, bits), // chong gua
    }),
    convergence: 'line-relationship conditionals: changing lines = temporal dynamics (if/then branches)',
    sourceRef: 'GGM §6f.9 [L3746-3765, L4179-4262]',
  });
}

// ---------------------------------------------------------------------------
// class Predictor — wraps an engine (optional, lazy). Tools call
// predictor.next(state); the engine is only referenced if a caller supplied
// one (kept for provenance/wiring), never required.

export class Predictor {
  constructor({ engine = null, rules = SUCCESSOR_RULES } = {}) {
    this.engine = engine;
    this.rules = rules;
  }

  /** All lawful successors of a state (T19 E1/E2/E6), frozen. */
  next(state, options = {}) {
    return successors(state, { rules: this.rules, ...options });
  }

  /** The 2^k change lattice of a state (or of explicit bits + changing set). */
  lattice(stateOrBits, changing = null, options = {}) {
    if (changing == null) {
      const s = normalizeState(stateOrBits);
      return enumerateLattice(gateBits(s.ben), movingLinesOf(s), options);
    }
    return enumerateLattice(stateOrBits, changing, options);
  }

  /** T17/E4 evaluation selection for a cast's changing lines. */
  readingPath(changingLines, context = {}) {
    return readingPath(changingLines, context);
  }

  /** PL9 Ban Xiang grid for a gate. */
  grid(gate) {
    return banXiangGrid(gate);
  }

  get disclaimer() {
    return PREDICTION_DISCLAIMER;
  }
}

