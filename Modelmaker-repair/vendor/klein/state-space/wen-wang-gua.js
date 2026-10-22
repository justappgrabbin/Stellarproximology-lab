// Pure Synthia Automata — state-space: Wen Wang Gua / Najia ("Super I Ching") symbols
//
// Ported from COHERENT donor ports/hexagram/SuperIChingSymbols.mjs
// (ranked PORT #3 in docs/corpus/unique-pieces-survey-2.md — "Super I Ching
// should absolutely be integrated").
// Fix-then-integrate changes vs the donor:
//   1. DONOR DEFECT — dangling import: `gateFromLines` from
//      './HexagramStateEngine.mjs' is not part of this port and does not
//      exist in our tree. Replaced with our canonical
//      addressing.js gateFromBits() (6 bits, line 1 first, yang=1 ->
//      King Wen gate number) — same bit convention as the donor's
//      statusToBit, verified by the tests.
//   2. Provenance tags added per table (SUP = attested in
//      docs/corpus/super-iching.md, the corpus mining of Alex Chiu's
//      "Super I Ching" Wen Wang Gua course; IMPLEMENTATION_CHOICE = donor
//      engineering decision not attested there). See PROVENANCE below.
//      Cross-check results vs super-iching.md:
//        - 12 branches t..h with elements     — SUP §1.4 (exact match;
//          donor writes 'earth', doc writes 'soil' — same element)
//        - 5 stars P/B/K/G/R + Alex/Jack glosses — SUP §1.3 (exact match)
//        - bounding pairs (六合)               — SUP §1.6 (exact match)
//        - strike pairs (六沖)                 — SUP §1.6 (exact match)
//        - coin->status casting grammar        — SUP §1.1 (exact match)
//        - O -> becomes yin, X -> becomes yang — SUP §1.1/R2 (exact match)
//        - roles J/U (世爻/應爻)               — SUP §1.2 (attested as a
//          per-hexagram fixed pair; the concrete J/U line assignment per
//          hexagram is NOT in the donor — flagged in alphabetExport's
//          continuousFillSlots, kept unfilled here)
//
// Pure JS ESM, zero deps, browser file://-safe, deterministic.

import { gateFromBits } from './addressing.js';

export const PROVENANCE = Object.freeze({
  branches: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.4 (12 lower dates, elements)' }),
  boundingPairs: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.6 bondages (六合)' }),
  strikePairs: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.6 strikes (六沖)' }),
  stars: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.3 (5 stars / six relations, Alex+Jack Chiu glosses)' }),
  roles: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.2 (J=世爻 self, U=應爻 opponent)' }),
  coinToStatus: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.1 (3-coin grammar, O/X moving lines)' }),
  statusAfterMove: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.1/R2 (second hexagram by flipping moving lines)' }),
  branchAbbreviations: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.4 letter codes t c y m cn e w wa s yo sh h' }),
  lineCellShape: Object.freeze({ tag: 'IMPLEMENTATION_CHOICE', source: 'donor engineering: per-line {star, branch, role, hider, notes} cell record' }),
  temporalFlags: Object.freeze({ tag: 'SUP', source: 'docs/corpus/super-iching.md §1.6 (bound/strike/empty temporal conditions); flag computation mechanics are donor code' }),
  gateDerivation: Object.freeze({ tag: 'IMPLEMENTATION_CHOICE', source: 'gate number derived via our canonical addressing.js gateFromBits (donor used its own HexagramStateEngine)' }),
});

export const BRANCHES = Object.freeze([
  ['t', 'zi', 0, 'water'], ['c', 'chou', 1, 'earth'], ['y', 'yin', 2, 'wood'], ['m', 'mao', 3, 'wood'],
  ['cn', 'chen', 4, 'earth'], ['e', 'si', 5, 'fire'], ['w', 'wu', 6, 'fire'], ['wa', 'wei', 7, 'earth'],
  ['s', 'shen', 8, 'metal'], ['yo', 'you', 9, 'metal'], ['sh', 'xu', 10, 'earth'], ['h', 'hai', 11, 'water'],
]);
export const BRANCH_BY_ABBR = Object.freeze(Object.fromEntries(BRANCHES.map(([abbr, pinyin, index, element]) => [abbr, Object.freeze({ abbr, pinyin, index, element })])));
export const BRANCH_BY_PINYIN = Object.freeze(Object.fromEntries(BRANCHES.map(([abbr, pinyin]) => [pinyin, BRANCH_BY_ABBR[abbr]])));
export const BRANCH_ORDER = Object.freeze(BRANCHES.map(([abbr]) => abbr));

const pairKey = (a, b) => [a, b].sort().join('|');
const BOUNDING = new Set([['t', 'c'], ['y', 'h'], ['m', 'sh'], ['cn', 'yo'], ['e', 's'], ['w', 'wa']].map(([a, b]) => pairKey(a, b)));
const STRIKE = new Set([['t', 'w'], ['c', 'wa'], ['y', 's'], ['m', 'yo'], ['cn', 'sh'], ['e', 'h']].map(([a, b]) => pairKey(a, b)));

export const Star = Object.freeze({ P: 'P', B: 'B', K: 'K', G: 'G', R: 'R' });
export const STAR_META = Object.freeze({
  P: Object.freeze({ alex: 'Parent', jack: 'Parent', gloss: 'set up / parent / foundation' }),
  B: Object.freeze({ alex: 'Brother', jack: 'Sibling', gloss: 'action / sibling / competition' }),
  K: Object.freeze({ alex: 'Kid', jack: 'Child', gloss: 'child / descendant / got nothing' }),
  G: Object.freeze({ alex: 'Girl/Gold', jack: 'Asset', gloss: 'wealth / money / gain / asset' }),
  R: Object.freeze({ alex: 'Officer/Judge', jack: 'Officer', gloss: 'officer / power / fame / authority' }),
});
export const Role = Object.freeze({ J: 'J', U: 'U', NONE: '' });
export const LineStatus = Object.freeze({ QUIET_YANG: 'solid', QUIET_YIN: 'broken', MOVE_O: 'O', MOVE_X: 'X' });

export function branchesBound(a, b) { return BOUNDING.has(pairKey(a, b)); }
export function branchesStrike(a, b) { return STRIKE.has(pairKey(a, b)); }

export function coinToStatus(tails, heads) {
  if (tails === 3 && heads === 0) return LineStatus.MOVE_O;
  if (heads === 3 && tails === 0) return LineStatus.MOVE_X;
  if (tails === 1 && heads === 2) return LineStatus.QUIET_YANG;
  if (tails === 2 && heads === 1) return LineStatus.QUIET_YIN;
  throw new Error(`invalid coin result tails=${tails} heads=${heads}`);
}

export function statusToBit(status) {
  return [LineStatus.QUIET_YANG, LineStatus.MOVE_O].includes(status) ? 1 : 0;
}
export function statusAfterMove(status) {
  if (status === LineStatus.MOVE_O) return 0;
  if (status === LineStatus.MOVE_X) return 1;
  return statusToBit(status);
}
export function isMoving(status) {
  return [LineStatus.MOVE_O, LineStatus.MOVE_X].includes(status);
}

export class LineCell {
  constructor({ line, status, star = null, branch = null, role = Role.NONE, hider = null, notes = [] } = {}) {
    if (!Number.isInteger(line) || line < 1 || line > 6) throw new Error('line must be 1..6');
    if (!Object.values(LineStatus).includes(status)) throw new Error(`unknown line status: ${status}`);
    if (star != null && !Object.values(Star).includes(star)) throw new Error(`unknown star: ${star}`);
    if (branch != null && !BRANCH_BY_ABBR[branch]) throw new Error(`unknown branch ${branch}`);
    if (!Object.values(Role).includes(role)) throw new Error(`unknown role: ${role}`);
    this.line = line; this.status = status; this.star = star; this.branch = branch;
    this.role = role; this.hider = hider; this.notes = [...notes];
  }
  get bit() { return statusToBit(this.status); }
  get moving() { return isMoving(this.status); }
  toJSON() {
    return {
      line: this.line, status: this.status, bit: this.bit, moving: this.moving,
      star: this.star, branch: this.branch, role: this.role || null,
      hider: this.hider, notes: [...this.notes],
    };
  }
}

export class AnnotatedHexagram {
  constructor({ gate = null, lines = [], monthBranch = null, dateBranch = null, emptyBranches = [], question = '', tags = [] } = {}) {
    if (lines.length !== 6) throw new Error('AnnotatedHexagram requires six lines');
    this.gate = gate;
    this.lines = lines.map((line) => (line instanceof LineCell ? line : new LineCell(line)));
    this.monthBranch = monthBranch; this.dateBranch = dateBranch;
    this.emptyBranches = [...emptyBranches]; this.question = String(question); this.tags = [...tags];
  }
  bits() { return this.lines.map((cell) => cell.bit); }
  movingLines() { return this.lines.filter((cell) => cell.moving).map((cell) => cell.line); }
  selfLine() { return this.lines.find((cell) => cell.role === Role.J) || null; }
  opponentLine() { return this.lines.filter((cell) => cell.role === Role.U)[0] || null; }
  secondHexagramBits() { return this.lines.map((cell) => statusAfterMove(cell.status)); }
  needsSecondHexagram() { return this.lines.some((cell) => cell.moving); }
  /* The King Wen gate of the changed hexagram, or null when nothing moves. */
  secondGate() {
    return this.needsSecondHexagram() ? gateFromBits(this.secondHexagramBits()) : null;
  }
  temporalFlags() {
    const lineFlags = [];
    for (const cell of this.lines) {
      if (!cell.branch) continue;
      const entry = { line: cell.line, branch: cell.branch, star: cell.star };
      if (this.monthBranch && branchesBound(cell.branch, this.monthBranch)) entry.boundMonth = true;
      if (this.dateBranch && branchesBound(cell.branch, this.dateBranch)) entry.boundDate = true;
      if (this.monthBranch && branchesStrike(cell.branch, this.monthBranch)) entry.strikeMonth = true;
      if (this.dateBranch && branchesStrike(cell.branch, this.dateBranch)) entry.strikeDate = true;
      if (this.emptyBranches.includes(cell.branch)) entry.empty = true;
      if (Object.keys(entry).length > 3) lineFlags.push(entry);
    }
    return { month: this.monthBranch, date: this.dateBranch, empty: [...this.emptyBranches], lineFlags };
  }
  toJSON() {
    return {
      gate: this.gate, bits: this.bits(), movingLines: this.movingLines(),
      needsSecond: this.needsSecondHexagram(),
      secondBits: this.needsSecondHexagram() ? this.secondHexagramBits() : null,
      secondGate: this.secondGate(),
      lines: this.lines.map((cell) => cell.toJSON()),
      selfLine: this.selfLine()?.line ?? null, opponentLine: this.opponentLine()?.line ?? null,
      temporal: this.temporalFlags(), question: this.question, tags: [...this.tags],
    };
  }
}

/* Cast from six 3-coin tosses, bottom line first (SUP §1.1 R1). Gate
 * resolution uses our canonical gateFromBits; an unresolvable bit pattern is
 * impossible for 6x{0,1} so the donor's blanket try/catch is replaced by a
 * direct call that fails loudly if the contract is ever violated. */
export function fromCoinTosses(tosses, { stars = null, branches = null, selfLine = null, opponentLine = null, hiders = null, month = null, date = null, empty = [], question = '' } = {}) {
  if (!Array.isArray(tosses) || tosses.length !== 6) throw new Error('need 6 tosses, bottom first');
  const cells = tosses.map(([tails, heads], index) => {
    const line = index + 1;
    return new LineCell({
      line, status: coinToStatus(tails, heads), star: stars?.[index] || null, branch: branches?.[index] || null,
      role: selfLine === line ? Role.J : opponentLine === line ? Role.U : Role.NONE, hider: hiders?.[index] || null,
    });
  });
  const gate = gateFromBits(cells.map((cell) => cell.bit));
  return new AnnotatedHexagram({ gate, lines: cells, monthBranch: month, dateBranch: date, emptyBranches: empty, question });
}

export function alphabetExport() {
  return {
    version: '1.0.0',
    source: 'Super I-Ching (Chiu lineage) + classical earthly branches — attested in docs/corpus/super-iching.md',
    provenance: PROVENANCE,
    branches: BRANCHES.map(([abbr, pinyin, index, element]) => ({ abbr, pinyin, index, element })),
    boundingPairs: [...BOUNDING].map((key) => key.split('|')),
    strikePairs: [...STRIKE].map((key) => key.split('|')),
    stars: Object.fromEntries(Object.values(Star).map((star) => [star, STAR_META[star]])),
    roles: { J: 'self/querent', U: 'opponent/counterpart' },
    lineStatus: { solid: 'quiet yang', broken: 'quiet yin', O: 'moving yang (old yang → yin in second hexagram)', X: 'moving yin (old yin → yang in second hexagram)' },
    architecture: ['64-state geometry (King Wen / Fu Xi)', '12 contextual branch symbols', '5 relational stars', 'roles J/U', 'moving/quiet status O/X/solid/broken', 'hiders (latent)', 'temporal conditions (month/date/empty/bound/strike)'],
    continuousFillSlots: ['star_element_tables_per_hexagram', 'self_opponent_line_pairs_per_hexagram', 'hider_tables', 'activation_conditions', 'emptiness_fulfillment_rules', 'judgment_patterns'],
  };
}

export default AnnotatedHexagram;

