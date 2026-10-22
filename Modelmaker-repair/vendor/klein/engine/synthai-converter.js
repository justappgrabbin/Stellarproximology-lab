// Pure Synthia Automata — engine: SynthAi converter (HD entry -> YiJing binary +
// waveform + per-dimension sentence). Ported from -SYNTHAI--main(1)(1).zip
// /synthai_converter_stub.py (Python -> pure JS, ~60 lines, schema value:
// GLCTB + zodiac + waveform carrier).
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. HEXAGRAM_BIN was a 2-entry stub map ("placeholder: fill with true
//       1..64 mapping") whose .get default silently returned "000000" (gate 2,
//       all-yin) for the other 62 gates — a silent-wrong-answer defect. Here
//       the full verified 64-gate table comes from src/merged/kingwen.js
//       (gateToFuXiDecimal), and out-of-range gates throw instead of
//       impersonating gate 2.
//   F2. sentence_for_dimension referenced an undefined name `l` in the Python
//       (NameError on EVERY call — the stub could never have run). Fixed to
//       `line`.
//
// Bit-orientation note: the stub's two filled entries (1->111111, 2->000000)
// are orientation-agnostic. yijiBinaryForGate returns TOP-line-first bits
// (MSB = line 6), matching the YiSphere.csv Bits column convention;
// yijiBinaryBottomFirst gives our gatePattern (line 1 first) orientation.
// Both are exported so neither reading is privileged silently.
//
// Determinism: pure functions, no wall-clock, no randomness.

import { gateToFuXiDecimal, gatePattern } from '../merged/kingwen.js';

/**
 * Full 64-gate hexagram binary table, TOP-line-first (MSB = line 6), derived
 * from our verified kingwen.js table (replaces the donor's 2-entry stub, F1).
 */
export const HEXAGRAM_BIN = Object.freeze(
  Object.fromEntries(
    Array.from({ length: 64 }, (_, i) => i + 1)
      .map((g) => [g, gateToFuXiDecimal(g).toString(2).padStart(6, '0')]),
  ),
);

/** gate (1..64) -> 6-bit hexagram string, top line first. Throws out of range (F1). */
export function yijiBinaryForGate(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) {
    throw new RangeError(`gate must be 1..64 (got ${JSON.stringify(gate)}) — the donor stub silently returned gate 2's all-yin pattern`);
  }
  return HEXAGRAM_BIN[gate];
}

/** gate (1..64) -> 6-bit string, line 1 (bottom) first (our gatePattern orientation). */
export function yijiBinaryBottomFirst(gate) {
  return gatePattern(gate).join('');
}

/**
 * Waveform params from GLCTB substructure (SOURCE_STATEMENT, donor formulas):
 *   freq = 0.5 + tone/6   (0.5..1.5)
 *   amp  = 0.5 + color/6  (0.5..1.5)
 *   phase = (line - 1) * 0.4
 *   carrier = +1 for odd base (yang), -1 for even (yin)
 */
export function waveformFromSubstructure(line, color, tone, base) {
  return {
    freq: 0.5 + tone / 6.0,
    amp: 0.5 + color / 6.0,
    phase: (line - 1) * 0.4,
    carrier: base % 2 === 1 ? 1 : -1,
  };
}

const SENTENCE_TEMPLATES = Object.freeze({
  Body: (g, l, c, t, b) => `Body speaks Gate ${g}.${l}, motivated by Color ${c}, resonating at Tone ${t}, Base ${b}.`,
  Mind: (g, l, c, t, b) => `Mind speaks Gate ${g}.${l}, motivated by Color ${c}, resonating at Tone ${t}, Base ${b}.`,
  Heart: (g, l, c, t, b) => `Heart speaks Gate ${g}.${l}, motivated by Color ${c}, resonating at Tone ${t}, Base ${b}.`,
  Ego: (g, l, c, t, b) => `Ego speaks Gate ${g}.${l}, motivated by Color ${c}, resonating at Tone ${t}, Base ${b}.`,
  Personality: (g, l, c, t, b) => `Personality speaks Gate ${g}.${l}, motivated by Color ${c}, resonating at Tone ${t}, Base ${b}.`,
});

/** Per-dimension templated sentence (SOURCE_STATEMENT, donor templates; F2 fix). */
export function sentenceForDimension(dimension, gate, line, color, tone, base) {
  const template = SENTENCE_TEMPLATES[dimension] || SENTENCE_TEMPLATES.Body;
  return template(gate, line, color, tone, base);
}

/**
 * Convert one HD entry:
 *   { dimension, center, gate, line, color, tone, base,
 *     degree, minute, second, axis, house, planet? }
 * -> { yijiBinary, yijiBinaryBottomFirst, waveform, sentence, zodiac, center }
 */
export function convertEntry(entry) {
  return {
    yijiBinary: yijiBinaryForGate(entry.gate),
    yijiBinaryBottomFirst: yijiBinaryBottomFirst(entry.gate),
    waveform: waveformFromSubstructure(entry.line, entry.color, entry.tone, entry.base),
    sentence: sentenceForDimension(entry.dimension, entry.gate, entry.line, entry.color, entry.tone, entry.base),
    zodiac: {
      degree: entry.degree, minute: entry.minute, second: entry.second,
      house: entry.house, axis: entry.axis, planet: entry.planet ?? '',
    },
    center: entry.center,
  };
}

export const SYNTHAI_CONVERTER_PROVENANCE = Object.freeze({
  source: '-SYNTHAI--main(1)(1).zip/synthai_converter_stub.py',
  gateTable: 'F1 fix: full 64-gate table from src/merged/kingwen.js (donor map was a 2-entry stub with a silent all-yin fallback)',
  sentenceFix: 'F2 fix: donor referenced undefined `l` (NameError on every call)',
  waveform: 'SOURCE_STATEMENT (donor placeholder formulas, kept verbatim)',
  templates: 'SOURCE_STATEMENT (donor fixed strings: Body/Mind/Heart/Ego/Personality)',
});

export default Object.freeze({
  HEXAGRAM_BIN, yijiBinaryForGate, yijiBinaryBottomFirst,
  waveformFromSubstructure, sentenceForDimension, convertEntry,
});

