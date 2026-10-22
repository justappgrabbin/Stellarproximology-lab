// Pure Synthia Automata — merged from isohuman-complete-v5-repaired/isohuman-merged/src/topology/FuxiEncoder.ts (dependency-free port)

/**
 * Fu Xi binary state encoder: 6 binary lines -> 64 states.
 * Patterns are 6-char MSB-first strings (encodeIndex(1) === '000001').
 * flipLine / getOpposite / getInverse are involutions.
 * createNode/initializeAllNodes are deterministic (no clocks, no randomness).
 */

const LINE_COUNT = 6;
const STATE_COUNT = 64;

/** Index 0..63 -> 6-bit MSB-first pattern string. */
export function encodeIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= STATE_COUNT) {
    throw new Error(`Index ${index} out of range [0, ${STATE_COUNT})`);
  }
  return index.toString(2).padStart(LINE_COUNT, '0');
}

/** 6-bit pattern string -> index 0..63. */
export function decodePattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length !== LINE_COUNT || !/^[01]+$/.test(pattern)) {
    throw new Error(`Invalid pattern: ${pattern}`);
  }
  return parseInt(pattern, 2);
}

/** Flip one line (position 0..5, MSB-first) of a pattern. Involution. */
export function flipLine(pattern, lineIndex) {
  const chars = decodePattern(pattern) >= 0 ? pattern.split('') : null;
  if (lineIndex < 0 || lineIndex >= LINE_COUNT) throw new Error(`Invalid line index: ${lineIndex}`);
  chars[lineIndex] = chars[lineIndex] === '0' ? '1' : '0';
  return chars.join('');
}

/** Hamming distance between two equal-length patterns (0..6). */
export function hammingDistance(a, b) {
  if (String(a).length !== String(b).length) throw new Error('Pattern length mismatch');
  let dist = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++;
  return dist;
}

/** All patterns at exactly the given Hamming distance (default 1 -> the 6 hypercube neighbors). */
export function getNeighbors(pattern, distance = 1) {
  decodePattern(pattern); // validates
  const results = [];
  for (let i = 0; i < STATE_COUNT; i++) {
    const other = encodeIndex(i);
    if (other !== pattern && hammingDistance(pattern, other) === distance) results.push(other);
  }
  return results;
}

/** Complement (yin<->yang inversion, o_inverse/shadow). Involution. */
export function getOpposite(pattern) {
  decodePattern(pattern); // validates
  return pattern.split('').map(c => (c === '0' ? '1' : '0')).join('');
}

/** Reverse bit order (Fu Xi reverse variation, o_reverse/mirror). Involution. */
export function getInverse(pattern) {
  decodePattern(pattern); // validates
  return pattern.split('').reverse().join('');
}

/** All 64 patterns in index order. */
export function getAllStates() {
  return Array.from({ length: STATE_COUNT }, (_, i) => encodeIndex(i));
}

/**
 * Deterministic resonance node for a state index (adapted from the source's
 * ResonanceNode shape; no models import, no timestamps — replay-safe).
 */
export function createNode(index, { circuitFamily = null, channelModes = [] } = {}) {
  const pattern = encodeIndex(index);
  const lines = pattern.split('').map(c => (c === '1' ? 1 : 0));
  return {
    id: `node-${index}`,
    binaryPattern: pattern,
    operators: { being: 0.5, design: 0.5, movement: 0.5, evolution: 0.5, space: 0.5 },
    binaryState: lines[5],
    lines,
    activeLine: 1,
    regime: 'latent',
    tension: 0,
    activation: 0,
    attractorWeight: 0,
    memoryGravity: 0,
    recursionDepth: 0,
    circuitFamily,
    channelModes: [...channelModes],
    observerContext: {
      id: `ctx-${index}`,
      perspective: 'default',
      scale: 1,
      dimensions: ['binary', 'gate'],
    },
    activationHistory: [],
    semanticState: {
      center: [], central: [], peripheral: [], rejected: [],
      examples: [], revisionHistory: [], coherenceScore: 0,
    },
    provenance: [{
      id: `prov-node-${index}`,
      category: 'native',
      source: 'FuxiEncoder',
      description: `Auto-generated from binary index ${index}`,
    }],
  };
}

/** Map of all 64 deterministic nodes keyed by node id. */
export function initializeAllNodes() {
  const map = new Map();
  for (let i = 0; i < STATE_COUNT; i++) {
    const node = createNode(i);
    map.set(node.id, node);
  }
  return map;
}

/** Class-shaped facade matching the source's static API. */
export class FuxiEncoder {
  static get LINE_COUNT() { return LINE_COUNT; }
  static get STATE_COUNT() { return STATE_COUNT; }
  static encodeIndex(i) { return encodeIndex(i); }
  static decodePattern(p) { return decodePattern(p); }
  static flipLine(p, i) { return flipLine(p, i); }
  static hammingDistance(a, b) { return hammingDistance(a, b); }
  static getNeighbors(p, d = 1) { return getNeighbors(p, d); }
  static getOpposite(p) { return getOpposite(p); }
  static getInverse(p) { return getInverse(p); }
  static getAllStates() { return getAllStates(); }
  static createNode(i, opts) { return createNode(i, opts); }
  static initializeAllNodes() { return initializeAllNodes(); }
}

export default FuxiEncoder;

