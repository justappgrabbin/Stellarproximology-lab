// Pure Synthia Automata — engine/v2: 13-layer Coordinate Engine
//
// Ported from handoff 02_safe_namespaced_additions/complete_v2_engine/coordinate_engine.js
// (donor synthia_os_complete_v2, ranked PORT #4 in docs/corpus/unique-pieces-survey-2.md;
// filename kept per port contract). Reconciled with our canonical
// src/state-space/addressing.js: that module remains the DMS/GLCTB codec of
// record (arc-second exact, gate/line/color/tone/base); THIS engine is the
// donor's mixed-radix multi-layer address space (13 layers incl.
// planet/zodiac/house/season) — a coarser, larger addressing scheme kept
// intact under its own namespace.
//
// Fix-then-integrate changes vs the donor:
//   1. DONOR DEFECT — CommonJS (`module.exports`/`window.*`): converted to
//      ESM exports.
//   2. DONOR DEFECT — integer overflow: the full 13-layer address space is
//      241,477,720,473,600,000 ≈ 2.4e17 and even "Side A" is
//      60,369,430,118,400,000 ≈ 6.0e16 — both exceed Number.MAX_SAFE_INTEGER
//      (9.007e15), so the donor's toAddress/fromAddress/toSideA/toSideB
//      silently lost precision and fromAddress(toAddress(x)) did NOT round
//      -trip. Address arithmetic is now BigInt throughout; addresses are
//      returned as BigInt (exact) and getStats() reports decimal strings.
//   3. DONOR DEFECT — the header's own arithmetic was wrong: it claimed
//      Side A = 3,881,779,200, Side B = 862,617,600 and "Combined: 3.35
//      quintillion". Corrected (see TOTALS below); the honest numbers are
//      computed from the layer ranges, not asserted.
//   4. Kept: mixed-radix codec, labels, computeResonance (Number-safe,
//      weighted similarity), computeEmergent (Number-safe modulo math).
//
// Pure JS ESM, zero deps, browser file://-safe, deterministic (no wall-clock).

const LAYER_DEFS = [
  { name: 'planet', range: 13, labels: ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node', 'South Node', 'Earth'] },
  { name: 'gate', range: 64, labels: null }, // Gate 1..64 generated in constructor
  { name: 'line', range: 6, labels: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6'] },
  { name: 'color', range: 6, labels: ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Violet'] },
  { name: 'tone', range: 6, labels: ['C', 'D', 'E', 'F', 'G', 'A'] },
  { name: 'base', range: 5, labels: ['Root', 'Sacral', 'Solar Plexus', 'Heart', 'Throat'] },
  { name: 'degree', range: 360, labels: null },
  { name: 'minute', range: 60, labels: null },
  { name: 'second', range: 60, labels: null },
  { name: 'arc', range: 360, labels: null },
  { name: 'zodiac', range: 12, labels: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'] },
  { name: 'house', range: 12, labels: ['1st House', '2nd House', '3rd House', '4th House', '5th House', '6th House', '7th House', '8th House', '9th House', '10th House', '11th House', '12th House'] },
  { name: 'season', range: 4, labels: ['Spring', 'Summer', 'Autumn', 'Winter'] },
];

const SIDE_A_LAYERS = Object.freeze(['planet', 'gate', 'line', 'color', 'tone', 'base', 'degree', 'minute', 'second', 'arc', 'zodiac', 'house']);
const SIDE_B_LAYERS = Object.freeze(['planet', 'gate', 'line', 'color', 'tone', 'base', 'season', 'house']);

/* Honest totals, computed from the layer ranges (donor header numbers were
 * wrong — defect #3):
 *   Side A (12 layers) = 60,369,430,118,400,000        (≈ 6.04e16)
 *   Side B (8 layers)  = 43,130,880                    (≈ 4.31e7)
 *   Full 13-layer      = 241,477,720,473,600,000       (≈ 2.41e17)
 * All exceed or approach 2^53 — hence BigInt addressing. */
function productOf(ranges) {
  return ranges.reduce((total, r) => total * BigInt(r), 1n);
}
export const TOTALS = Object.freeze({
  sideA: productOf(LAYER_DEFS.filter((l) => SIDE_A_LAYERS.includes(l.name)).map((l) => l.range)),
  sideB: productOf(LAYER_DEFS.filter((l) => SIDE_B_LAYERS.includes(l.name)).map((l) => l.range)),
  full: productOf(LAYER_DEFS.map((l) => l.range)),
});

export class CoordinateEngine {
  constructor() {
    this.layers = LAYER_DEFS.map((def) => ({
      ...def,
      labels: def.name === 'gate' ? this._generateGateLabels() : def.labels,
    }));
    this._byName = new Map(this.layers.map((l) => [l.name, l]));

    // Mixed-radix multipliers (BigInt — exact at full 13-layer scale).
    this.multipliers = this._computeMultipliers();
    this.totalAddressSpace = this._computeTotalSpace();
  }

  _generateGateLabels() {
    const labels = [];
    for (let i = 1; i <= 64; i++) labels.push(`Gate ${i}`);
    return labels;
  }

  _computeMultipliers() {
    const mults = [1n];
    for (let i = this.layers.length - 1; i > 0; i--) {
      mults.unshift(mults[0] * BigInt(this.layers[i].range));
    }
    return mults;
  }

  _computeTotalSpace() {
    return this.layers.reduce((total, layer) => total * BigInt(layer.range), 1n);
  }

  _value(coords, name) {
    const v = coords[name] || 0;
    const layer = this._byName.get(name);
    if (!Number.isInteger(v) || v < 0 || v >= layer.range) {
      throw new RangeError(`coordinate '${name}' must be an integer in 0..${layer.range - 1} (got ${v})`);
    }
    return BigInt(v);
  }

  /* coordinates -> exact BigInt address (full 13-layer mixed radix). */
  toAddress(coords) {
    let address = 0n;
    for (let i = 0; i < this.layers.length; i++) {
      address += this._value(coords, this.layers[i].name) * this.multipliers[i];
    }
    return address;
  }

  /* exact BigInt address -> coordinates; inverse of toAddress. */
  fromAddress(address) {
    const a = BigInt(address);
    if (a < 0n || a >= this.totalAddressSpace) {
      throw new RangeError(`address out of range 0..${this.totalAddressSpace - 1n} (got ${a})`);
    }
    const coords = {};
    let remaining = a;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      coords[layer.name] = Number((remaining / this.multipliers[i]) % BigInt(layer.range));
      remaining %= this.multipliers[i];
    }
    return coords;
  }

  getLabel(layerName, value) {
    const layer = this._byName.get(layerName);
    if (!layer || !layer.labels) return `${value}`;
    return layer.labels[value] || `${value}`;
  }

  _sideAddress(coords, layerNames) {
    let address = 0n;
    let multiplier = 1n;
    for (let i = layerNames.length - 1; i >= 0; i--) {
      const layer = this._byName.get(layerNames[i]);
      address += this._value(coords, layerNames[i]) * multiplier;
      multiplier *= BigInt(layer.range);
    }
    return address;
  }

  /* "Side A" address (planet..arc + zodiac + house) — exact BigInt. */
  toSideA(coords) {
    return this._sideAddress(coords, SIDE_A_LAYERS);
  }

  /* "Side B" address (planet..base + season + house) — exact BigInt. */
  toSideB(coords) {
    return this._sideAddress(coords, SIDE_B_LAYERS);
  }

  /* Weighted per-layer similarity in [0,1]; gate x3, zodiac/house x2.
   * Number-safe (each layer's diff is small by construction). */
  computeResonance(coordsA, coordsB) {
    let resonance = 0;
    let totalWeight = 0;
    for (const layer of this.layers) {
      const a = coordsA[layer.name] || 0;
      const b = coordsB[layer.name] || 0;
      const diff = Math.abs(a - b);
      const maxDiff = layer.range / 2;
      const similarity = 1 - Math.min(diff, maxDiff) / maxDiff;
      const weight = layer.name === 'gate' ? 3
        : layer.name === 'zodiac' ? 2
          : layer.name === 'house' ? 2 : 1;
      resonance += similarity * weight;
      totalWeight += weight;
    }
    return resonance / totalWeight;
  }

  /* Emergent degree/minute/second/arc from the primary coordinates. */
  computeEmergent(coords) {
    const degree = ((coords.gate || 0) * 6 + (coords.line || 0)) % 360;
    const minute = ((coords.color || 0) * 6 + (coords.tone || 0)) % 60;
    const second = ((coords.base || 0) * 13 + (coords.planet || 0)) % 60;
    const arc = ((coords.zodiac || 0) * 12 + (coords.house || 0)) * 30 % 360;
    return { degree, minute, second, arc };
  }

  getStats() {
    return {
      totalLayers: this.layers.length,
      // BigInt exact values serialized as decimal strings (they exceed 2^53).
      totalAddressSpace: this.totalAddressSpace.toString(),
      sideASpace: this.toSideA(this._maxCoords()).toString(),
      sideBSpace: this.toSideB(this._maxCoords()).toString(),
      layerBreakdown: this.layers.map((l) => ({
        name: l.name, range: l.range, hasLabels: !!l.labels,
      })),
    };
  }

  _maxCoords() {
    const coords = {};
    for (const layer of this.layers) coords[layer.name] = layer.range - 1;
    return coords;
  }
}

export default CoordinateEngine;

