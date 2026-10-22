// Pure Synthia Automata — merged from ato-drawing-engine.html (strong-equivalence-ato.mjs operators) + synthia-recursive-media-field-v1.9/src/vendor/boolean-operator-bank.mjs

/**
 * Unified analogy calculus.
 *
 * String form (Klein Table 4, byte-identical to the drawing engine):
 *   strongEquivalence(a,b) — '1' where characters agree, '0' where they differ.
 *   solveAnalogy(X,Y,Z) = strongEquivalence(Z, strongEquivalence(X,Y)).
 *
 * Numeric form (6-bit, from the Boolean operator bank):
 *   completeAnalogy(a,b,c) = c XNOR (a XNOR b) over 6-bit values.
 * Numbers 0..63 are treated as 6-bit vectors (bit 5 first / MSB-first, matching
 * the standard binary reading of the value); bit arrays are also accepted.
 */

const WIDTH = 6;

function toBits(value, width = WIDTH) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** width) {
      throw new RangeError(`Expected integer 0..${2 ** width - 1}, received ${value}`);
    }
    return value.toString(2).padStart(width, '0').split('').map(Number);
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const bits = [...value].map(bit => {
      if (bit === true || bit === 1 || bit === '1') return 1;
      if (bit === false || bit === 0 || bit === '0') return 0;
      throw new TypeError(`Expected bit, received ${String(bit)}`);
    });
    if (bits.length !== width) throw new RangeError(`Expected ${width} bits, received ${bits.length}`);
    return bits;
  }
  if (typeof value === 'string') return toBits(value.split('').map(Number), width);
  throw new TypeError('Expected number, bit string, or bit array');
}

function bitsToNumber(bits) {
  return bits.reduce((n, bit) => (n << 1) | bit, 0);
}

/** Elementwise XNOR over equal-length bit vectors (0/1 arrays). */
export function xnorBits(a, b) {
  const aa = toBits(a, a.length ?? WIDTH);
  const bb = toBits(b, aa.length);
  return Object.freeze(aa.map((bit, i) => (bit ^ bb[i]) ^ 1));
}

/** Elementwise XOR over equal-length bit vectors (0/1 arrays). */
export function xorBits(a, b) {
  const aa = toBits(a, a.length ?? WIDTH);
  const bb = toBits(b, aa.length);
  return Object.freeze(aa.map((bit, i) => bit ^ bb[i]));
}

/**
 * Numeric analogy completion over 6-bit values: c XNOR (a XNOR b).
 * Accepts numbers 0..63 or 6-bit arrays/strings; returns the same kind
 * (number if all numeric, frozen bit array otherwise).
 */
export function completeAnalogy(a, b, c) {
  const allNumeric = [a, b, c].every(v => typeof v === 'number');
  const relation = xnorBits(toBits(a), toBits(b));
  const result = xnorBits(toBits(c), relation);
  return allNumeric ? bitsToNumber(result) : result;
}

/**
 * String-form strong equivalence (verbatim semantics from ato-drawing-engine.html):
 * '1' at every position where the two strings agree, '0' where they differ.
 */
export function strongEquivalence(strA, strB) {
  const a = String(strA); const b = String(strB);
  if (a.length !== b.length) throw new Error('length mismatch');
  let out = '';
  for (let i = 0; i < a.length; i++) out += a[i] === b[i] ? '1' : '0';
  return out;
}

/** X : Y :: Z : ? — the answer string. */
export function solveAnalogy(X, Y, Z) {
  return strongEquivalence(Z, strongEquivalence(X, Y));
}

/** Hamming distance between two equal-length bit strings. */
export function hammingStr(a, b) {
  const aa = String(a); const bb = String(b);
  if (aa.length !== bb.length) throw new Error('length mismatch');
  let dist = 0;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) dist++;
  return dist;
}

/**
 * Self-test: reproduces Klein's published Table 4 case from the drawing engine.
 * Features: [male, female, young, adult, love, hate, light, dark].
 *   "boy loves light"   = 10101010
 *   "girl hates light"  = 01100110
 *   "woman hates dark"  = 01010101
 *   solveAnalogy(...) must equal "man loves dark" = 10011001.
 * Also checks numeric/string agreement and hammingStr.
 * @returns {boolean}
 */
export function selfTest() {
  const X = '10101010'; // boy loves light
  const Y = '01100110'; // girl hates light
  const Z = '01010101'; // woman hates dark
  const solved = solveAnalogy(X, Y, Z);
  if (solved !== '10011001') return false; // man loves dark
  // Numeric form must agree with the string form over the low 6 bits.
  const numeric = completeAnalogy(
    parseInt(X.slice(2), 2),
    parseInt(Y.slice(2), 2),
    parseInt(Z.slice(2), 2),
  );
  if (numeric !== parseInt(solved.slice(2), 2)) return false;
  // 6-bit numeric sanity: full-width XNOR involution property a XNOR b XNOR b === a.
  if (completeAnalogy(0b101010, 0b011001, 0b011001) !== 0b101010) return false;
  if (hammingStr(X, Y) !== 4) return false;
  if (hammingStr(solved, '10011001') !== 0) return false;
  const xn = xnorBits([1, 0, 1], [1, 1, 0]);
  if (xn.join('') !== '100') return false;
  const xr = xorBits([1, 0, 1], [1, 1, 0]);
  if (xr.join('') !== '011') return false;
  return true;
}

export default Object.freeze({
  xnorBits, xorBits, completeAnalogy, strongEquivalence, solveAnalogy, hammingStr, selfTest,
});

