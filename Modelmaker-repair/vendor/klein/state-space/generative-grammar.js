// Pure Synthia Automata — the author's generative sentence grammar
// (FRAGMENT_ALGEBRA_SPEC §4.5 tables T23/T24, §4.6 table T25, §5.1 table T26).
//
// Deep structure = the DMS address decomposition (the waveform substrate,
// GGM §5); surface structure = the collapsed sentence string (T25). Slot
// grammar and canon order are CANON (GGM §6a–6b); production rules P9–P14
// are CANON slots + derived productions in the author's own rewrite notation
// (GGM §6g). Sentence templates are the four canonical forms of GGM §6d
// [L1912-1914, L2411-2414, L3470-3473, L3614-3617].
//
// Everything here is pure and deterministic: same address -> same sentence.
// No wall-clock, no randomness.

import { DIMENSIONS } from './constants.js';
import { addressForArcSec, arcSecForAddress, gateBits, gateFromBits } from './addressing.js';
import { hexagramName } from '../merged/kingwen.js';
import { centerForGate } from '../merged/centers-channels.js';

const freeze = (x) => Object.freeze(x);

// ---------------------------------------------------------------------------
// T23 — SLOT_GRAMMAR: the 12 slots in canon order (GGM §6a-6b [L2698-2711]).
// The emergent closure is NOT a slot — "no single layer dictates it"
// [L1900-1903]; it is exported separately as EMERGENT_CLOSURE.

export const SLOT_ORDER = freeze([
  'Dimension', 'Sign', 'Gate', 'Line', 'Planet', 'Color',
  'Tone', 'Base', 'Center+Biology', 'House', 'Axis', 'YijingWrapper',
]);

export const SLOT_GRAMMAR = freeze([
  freeze({ slot: 1, name: 'Dimension', grammaticalRole: 'sentence type (keynote: I Am / I Define / I Remember / I Design / I Think)',
    definition: '5 macro layers; maps to crystal/center binary; sets what kind of sentence it is',
    sources: ['GGM §6b [L2699]', 'GGM §6a [L2667-2669]'] }),
  freeze({ slot: 2, name: 'Sign', grammaticalRole: 'subject noun / agent; voice/subject flavor; 12 archetypal subject forces',
    definition: 'supplies the agent plus its modality verb flavor (P10)',
    sources: ['GGM §6b [L2701, L2289, L1865]', 'GGM §6a [L2688]'] }),
  freeze({ slot: 3, name: 'Gate', grammaticalRole: 'predicate verb / action (the archetype)',
    definition: 'one of 64 hexagrams; supplies archetypal verb/action',
    sources: ['GGM §6b [L2703, L1872, L2316-2320]', 'GGM §6a [L2671]'] }),
  freeze({ slot: 4, name: 'Line', grammaticalRole: 'clause style; binary container (exaltation vs detriment); adjective/adverb clause',
    definition: 'sixfold subdivision with binary polarity; style of expression',
    sources: ['GGM §6b [L2705, L1874, L2347]', 'GGM §6a [L2673-2674]'] }),
  freeze({ slot: 5, name: 'Planet', grammaticalRole: 'adjectives/adverbs filling the exalt/detriment poles of the Line container',
    definition: 'planet keywords modify the line phrase; slot formula: Line phrase + planet keyword (exalted/detriment) + sign modality verb-flavor',
    sources: ['GGM §6b [L1879-1880, L1943-1944, L2235]'] }),
  freeze({ slot: 6, name: 'Color', grammaticalRole: "motivation - the 'why' (subtext)",
    definition: 'motivation filter; six archetypal motives',
    sources: ['GGM §6b [L2676, L1876, L2373]'] }),
  freeze({ slot: 7, name: 'Tone', grammaticalRole: "resonance - the 'how'",
    definition: 'resonance filter; frequency modulation below Color',
    sources: ['GGM §6b [L2678, L1876]'] }),
  freeze({ slot: 8, name: 'Base', grammaticalRole: 'root seed',
    definition: 'root archetypal seed; most fundamental binary code beneath Tone',
    sources: ['GGM §6b [L2680, L1876, L2369]'] }),
  freeze({ slot: 9, name: 'Center+Biology', grammaticalRole: 'grammatical voice/modality + somatic anchor (throat = declarative, sacral = imperative, ajna = reflective)',
    definition: 'the voice the sentence is spoken in',
    sources: ['GGM §6b [L1887-1888, L2298-2307, L2711]'] }),
  freeze({ slot: 10, name: 'House', grammaticalRole: 'context clause (life domain)',
    definition: 'context of life expression',
    sources: ['GGM §6b [L1930, L2690]'] }),
  freeze({ slot: 11, name: 'Axis', grammaticalRole: 'polarity/contrast clause (mirror)',
    definition: 'every Gate has opposite polarity (e.g. Gate 1 <-> Gate 2); contrast/mirror logic',
    sources: ['GGM §6b [L2709, L2685]'] }),
  freeze({ slot: 12, name: 'YijingWrapper', grammaticalRole: "tense/aspect/conjunction ('Already complete', 'Not yet complete', 'while its opposite…')",
    definition: 'temporal frame wrapping the whole sentence',
    sources: ['GGM §6b [L1850-1855, L2385-2392]'] }),
]);

export const EMERGENT_CLOSURE = freeze({
  name: 'EmergentClosure',
  grammaticalRole: "final clause - no single layer dictates it (interference 'beat note')",
  definition: 'optional closure clause from cross-term interference (P13); OFF by default for predictable sentences (PL2 step 6)',
  sources: ['GGM §6b [L1900-1903, L2399-2404]'],
});

// ---------------------------------------------------------------------------
// T24 — PRODUCTIONS P9..P14 in {lhs, rhs, conditions} form (author's rewrite
// notation, GGM §6g). `codeStatus` records what this module implements.

export const PRODUCTIONS = freeze([
  freeze({ id: 'P9', name: 'dimension_keynote_prefix',
    lhs: 'Dimension', rhs: "'I ___' keynote clause (sentence-type prefix)",
    conditions: ["Movement -> 'I Define'", "Evolution -> 'I Remember'", "Being -> 'I Am'", "Design -> 'I Design'", "Space -> 'I Think'",
      "crystal layer alternates: Movement 'I Create' / Space 'I Communicate' (Conflicts C13/C14)"],
    inputs: 'Dimension (1-5)', outputs: 'sentence-type prefix / keynote clause',
    codeStatus: 'implemented: DIMENSION_KEYNOTES lookup',
    sources: ['GGM §1a [L20, L35, L46, L56, L68]', 'GGM §6b [L2699]', 'GGM §6f [L922-933]'] }),
  freeze({ id: 'P10', name: 'sign_subject_modality',
    lhs: 'Sign', rhs: 'subject noun + modality verb flavor',
    conditions: ["Cardinal (Aries/Cancer/Libra/Capricorn) -> initiating ('begin, initiate, push')",
      "Fixed (Taurus/Leo/Scorpio/Aquarius) -> stabilizing ('hold, maintain, embody')",
      "Mutable (Gemini/Virgo/Sagittarius/Pisces) -> adapting ('shift, adapt, blend')"],
    inputs: 'Zodiac sign', outputs: 'subject agent + modality',
    codeStatus: 'implemented: SIGN_MODALITY + MODALITY_VERBS static lookups',
    sources: ['GGM §6c [L2218-2246]'] }),
  freeze({ id: 'P11', name: 'gate_line_planet_predicate',
    lhs: 'Gate + Line + Planet', rhs: 'predicate phrase with modifiers',
    conditions: ['Gate supplies the archetypal verb', 'Line supplies clause style and the exalt/detriment binary container',
      'Planet keyword fills the pole as adjective/adverb',
      'slot formula: Line phrase + planet keyword (exalted/detriment) + sign modality verb-flavor'],
    inputs: 'Gate + Line + Planet', outputs: 'predicate phrase with modifiers',
    codeStatus: 'implemented with generic line/planet fixtures; the 384 gate-line name lexicon [L1245-1708] and planetary keyword lexicon [L2182-2211] are caller-supplied via lexicon overrides',
    sources: ['GGM §6b [L2703-2705, L1879-1880]', 'GGM §6c [L2251-2253]'] }),
  freeze({ id: 'P12', name: 'motivation_resonance_seed',
    lhs: 'Color + Tone + Base', rhs: 'why/how/seed modifier chain',
    conditions: ["Color -> motivation clause ('why', subtext)", "Tone -> resonance clause ('how')", 'Base -> root seed (deepest binary code)',
      'composed right-to-left in O_{k,l,c,t,b} = B_b ∘ T_t ∘ M_c ∘ L_l ∘ G_k'],
    inputs: 'Color + Tone + Base', outputs: 'why/how/seed modifier chain',
    codeStatus: 'implemented: lookup + composeAddress fixes the composition order',
    sources: ['GGM §6a [L2676-2680]', 'GGM §6g [L5786-5790]'] }),
  freeze({ id: 'P13', name: 'voice_context_polarity_wrapper_assembly',
    lhs: 'Center+Biology + House + Axis + YijingWrapper (+ optional interference closure)',
    rhs: 'full surface sentence',
    conditions: ['Center+Biology -> grammatical voice (throat=declarative, sacral=imperative, ajna=reflective) + somatic anchor',
      'House -> context clause', 'Axis -> polarity/mirror clause',
      "Yijing wrapper -> tense/aspect frame ('Already complete' / 'Not yet complete')",
      'Emergent closure optional from cross-term interference above threshold'],
    inputs: 'Center+Biology + House + Axis + Yijing wrapper', outputs: 'full surface sentence',
    codeStatus: 'implemented: TEMPLATES (minimal / final / consciousness / dimensional)',
    sources: ['GGM §6b [L1887-1888, L1930, L2709, L1850-1855]', 'GGM §6d'] }),
  freeze({ id: 'P14', name: 'verb_field_triad',
    lhs: 'marks =, –, → (T12 marks 18/7/19)', rhs: 'the verbs of being',
    conditions: ["= (Mirror) -> Recognition, defines what a thing is ('the') [L185]",
      "– (Current) -> Continuity, sustains that it is ('is') [L187]",
      "→ (Vector) -> Transformation, moves what is into what becomes ('is becoming') [L189]",
      'ontological circuit: = → – → Recognition → Transformation → Continuity [L192-193]'],
    inputs: 'marks =, –, →', outputs: 'the verbs of being',
    codeStatus: 'implemented: VERB_FIELD_TRIAD as the verb lexicon core',
    sources: ['GGM §4 [L181-206]'] }),
]);

// P14 — the Verb-Field Triad (T12 marks 18/7/19). "The verbs of being all
// arise from these three operators." [L181-193]
export const VERB_FIELD_TRIAD = freeze({
  '=': 'Recognition',    // Mirror: defines what a thing is ('the')
  '–': 'Continuity',     // Current: sustains that it is ('is') — en dash, T12 mark 7
  '→': 'Transformation', // Vector: moves what is into what becomes ('is becoming')
});

export const VERBS_OF_BEING_NOTE =
  "The verbs of being all arise from these three operators: = (Mirror) -> Recognition " +
  "('the'), – (Current) -> Continuity ('is'), → (Vector) -> Transformation " +
  "('is becoming'). Ontological circuit: = → – → Recognition → Transformation → " +
  "Continuity. Example derivation: '• → \"idea\" = real' reads 'A potential becomes " +
  "the idea that is real.' [GGM §4, L181-206]";

// ---------------------------------------------------------------------------
// P9 keynote tables (dimensional layer; crystal alternates per C13/C14).

export const DIMENSION_KEYNOTES = freeze({
  Movement: 'I Define', Evolution: 'I Remember', Being: 'I Am', Design: 'I Design', Space: 'I Think',
});
export const CRYSTAL_KEYNOTES = freeze({ Movement: 'I Create', Space: 'I Communicate' }); // C13/C14 alternates
// Engine-L2 grammatical functions [L922-933]
export const KEYNOTE_FUNCTIONS = freeze({
  'I Define': 'subject initiator', 'I Remember': 'reflective modifier', 'I Design': 'structural phrase',
  'I Am': 'embodiment/action', 'I Think': 'illusory/rhythmic layer',
});

// P10 — sign modality (GGM §6c [L2218-2246]).
export const ZODIAC_SIGNS = freeze([
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]);
export const SIGN_MODALITY = freeze({
  Aries: 'Cardinal', Cancer: 'Cardinal', Libra: 'Cardinal', Capricorn: 'Cardinal',
  Taurus: 'Fixed', Leo: 'Fixed', Scorpio: 'Fixed', Aquarius: 'Fixed',
  Gemini: 'Mutable', Virgo: 'Mutable', Sagittarius: 'Mutable', Pisces: 'Mutable',
});
export const MODALITY_VERBS = freeze({
  Cardinal: freeze(['begin', 'initiate', 'push']),
  Fixed: freeze(['hold', 'maintain', 'embody']),
  Mutable: freeze(['shift', 'adapt', 'blend']),
});

export function signModality(sign) {
  const m = SIGN_MODALITY[sign];
  if (!m) throw new RangeError(`unknown zodiac sign '${sign}'`);
  return m;
}

// ---------------------------------------------------------------------------
// The author's rewrite-rule notation (Output Mode 7, GGM §6g [L1089-1091]):
//   F:Body → Gate:Innocence° → Line:'Survival → Color:'Innocence → Tone:"Taste → Base:"Geometry → G:{Identity → Virgo → 5th}
// Unified Syntax Field marks doing the work (T12): '°' Collapse anchors a
// value (suffix); '′'/`'` Pulse and '"'/`"` Container prefix values; the
// G:{…} group carries Axis → Sign → House.

const SLOT_ALIASES = freeze({
  F: 'dimension', Field: 'dimension', Dimension: 'dimension',
  Gate: 'gate', Line: 'line', Color: 'color', Tone: 'tone', Base: 'base',
  Planet: 'planet', Sign: 'sign', Zodiac: 'sign', House: 'house', Axis: 'axis',
  Center: 'center', G: 'group', AxisGroup: 'group',
});
const MARK_PREFIXES = ['′', "'", '"', '“'];
const MARK_SUFFIXES = ['°'];

function splitTopLevel(str, sep = '→') {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of str) {
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    if (ch === '}' || ch === ')' || ch === ']') depth--;
    if (ch === sep && depth === 0) { parts.push(current); current = ''; } else { current += ch; }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// parseRewrite(string) -> {steps, assignments}. Each step keeps its literal
// slot label and marks so formatRewrite(parseRewrite(s)) === s round-trips.
export function parseRewrite(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new TypeError('parseRewrite expects a non-empty rewrite string');
  }
  const steps = [];
  const assignments = {};
  for (const rawStep of splitTopLevel(input)) {
    const m = rawStep.match(/^([A-Za-z+]+)\s*:\s*(.*)$/);
    if (!m) throw new SyntaxError(`rewrite step has no 'Slot:value' head: '${rawStep}'`);
    const slot = m[1];
    let value = m[2].trim();
    let group = null;
    if (value.startsWith('{') && value.endsWith('}')) {
      group = splitTopLevel(value.slice(1, -1));
      value = group.join(' → ');
    }
    const marks = { prefix: '', suffix: '' };
    if (!group) {
      while (value.length && MARK_SUFFIXES.includes(value[value.length - 1])) {
        marks.suffix = value[value.length - 1] + marks.suffix;
        value = value.slice(0, -1);
      }
      while (value.length && MARK_PREFIXES.includes(value[0])) {
        marks.prefix += value[0];
        value = value.slice(1);
      }
      value = value.trim();
    }
    steps.push(freeze({ slot, value, marks: freeze(marks), group: group ? freeze(group) : null }));
    const key = SLOT_ALIASES[slot];
    if (key === 'group') {
      // G:{Axis → Sign → House} [L1089-1091]
      const [axis, sign, house] = group || [];
      if (axis != null) assignments.axis = axis;
      if (sign != null) assignments.sign = sign;
      if (house != null) assignments.house = house;
    } else if (key) {
      assignments[key] = value;
    }
  }
  return freeze({ steps: freeze(steps), assignments: freeze(assignments) });
}

export function formatRewrite(parsed) {
  const renderStep = (s) => {
    if (s.group) return `${s.slot}:{${s.group.join(' → ')}}`;
    return `${s.slot}:${s.marks.prefix}${s.value}${s.marks.suffix}`;
  };
  return parsed.steps.map(renderStep).join(' → ');
}

// ---------------------------------------------------------------------------
// The composed sentence operator (GGM §6g [L5786-5790]):
//   O_{k,l,c,t,b} = B_b ∘ T_t ∘ M_c ∘ L_l ∘ G_k
// The Gate.Line.Color.Tone.Base chain as function composition, applied
// right-to-left (G first, B last), producing a valid DMS address via
// addressing.js.

export function composeAddress({ gate, line = 1, color = 1, tone = 1, base = 1 }) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) {
    throw new RangeError(`composeAddress: gate must be 1-64, got ${gate}`);
  }
  const parts = freeze({ gate, line, color, tone, base });
  const arcSecond = arcSecForAddress(parts);
  const address = addressForArcSec(arcSecond);
  return freeze({
    operator: `O_{${gate},${line},${color},${tone},${base}}`,
    composition: `B_${base}∘T_${tone}∘M_${color}∘L_${line}∘G_${gate}`,
    applicationOrder: freeze(['G', 'L', 'M', 'T', 'B']), // right-to-left
    parts,
    arcSecond,
    address: freeze(address),
  });
}

// ---------------------------------------------------------------------------
// Default lexicon fixtures (deterministic). The 384 gate-line names and the
// planetary keyword lexicon (P11 code_status) are not in the corpus as data;
// these generic per-slot words are the stand-in fixtures, overridable through
// generateSentence(address, {lexicon}).

const LINE_NAMES = freeze(['Foundation', 'Communion', 'Adaptation', 'Survival', 'Authority', 'Completion']);
const COLOR_MOTIVES = freeze(['survival', 'pleasure', 'security', 'connection', 'expression', 'clarity']);
const TONE_WORDS = freeze(['groundedly', 'cyclically', 'harmonically', 'mysteriously', 'resonantly', 'finitely']);
const BASE_SEEDS = freeze(['unity', 'duality', 'relation', 'geometry', 'potential']);
const PLANET_KEYWORDS = freeze({
  Sun: 'radiantly', Moon: 'reflectively', Mars: 'forcefully', Mercury: 'communicatively',
  Venus: 'harmoniously', Jupiter: 'expansively', Saturn: 'disciplinedly',
});
const PLANETS = freeze(Object.keys(PLANET_KEYWORDS));
const CENTER_VOICES = freeze({
  Throat: freeze({ voice: 'declarative', anchor: 'my throat declares it' }),
  Sacral: freeze({ voice: 'imperative', anchor: 'my sacral commands it' }),
  Ajna: freeze({ voice: 'reflective', anchor: 'my ajna reflects on it' }),
});
const ORDINALS = freeze(['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']);

// gate name without the Wilhelm parenthetical: 'Innocence (The Unexpected)' -> 'Innocence'
const gateArchetype = (gate) => hexagramName(gate).split(' (')[0];

// Default dimension: D3 Being, the hinge of the five (spec §2/T9) — the
// author leaves gate->dimension partially specified (only Hexagram 1 ->
// Movement is attested [L3016-3017]); callers pass address.dimension.
const DEFAULT_DIMENSION = 'Being';

// Deep structure (T25): the address decomposition — the waveform substrate
// from which the surface sentence collapses. Pure addressing.js math.
export function deepStructure(address) {
  if (!address || !Number.isInteger(address.gate)) {
    throw new TypeError('deepStructure expects an address with integer gate 1-64');
  }
  const arcSecond = arcSecForAddress(address);
  const canonical = addressForArcSec(arcSecond);
  const bits = gateBits(canonical.gate);
  const changingLines = (address.changingLines || []).slice().sort((a, b) => a - b);
  return freeze({
    kind: 'waveform-substrate',
    note: 'deep structure = fields of probability; the sentence syntax is the act of observation [L2555-2562, L5710-5714]',
    arcSecond,
    address: freeze(canonical),
    bits: freeze(bits),
    changingLines: freeze(changingLines),
    dimension: address.dimension || DEFAULT_DIMENSION,
  });
}

function buildSlots(address, lexicon, options) {
  const deep = deepStructure(address);
  const a = deep.address;
  const line = address.line ?? a.line;
  const color = address.color ?? a.color;
  const tone = address.tone ?? a.tone;
  const base = address.base ?? a.base;
  const zodiac = address.zodiac ?? a.zodiac;
  const house = address.house ?? a.house;
  const sign = address.sign || ZODIAC_SIGNS[zodiac - 1];
  const modality = signModality(sign);
  const verbs = (lexicon.modalityVerbs && lexicon.modalityVerbs[modality]) || MODALITY_VERBS[modality];
  const modalityVerb = verbs[(line - 1) % verbs.length]; // P10/P11 slot formula tie-in
  const gateName = (lexicon.gateArchetype && lexicon.gateArchetype(a.gate)) || gateArchetype(a.gate);
  const lineName = (lexicon.lineName && lexicon.lineName(a.gate, line)) || LINE_NAMES[line - 1];
  const planet = address.planet || PLANETS[(a.gate + line - 2) % PLANETS.length];
  const planetKeyword = (lexicon.planetKeyword && lexicon.planetKeyword(planet, line)) || PLANET_KEYWORDS[planet] || String(planet).toLowerCase();
  const colorMotive = (lexicon.colorMotive && lexicon.colorMotive(color)) || COLOR_MOTIVES[color - 1];
  const toneWord = (lexicon.toneResonance && lexicon.toneResonance(tone)) || TONE_WORDS[tone - 1];
  const baseSeed = (lexicon.baseSeed && lexicon.baseSeed(base)) || BASE_SEEDS[base - 1];
  const dimension = deep.dimension;
  const keynote = (lexicon.keynote && lexicon.keynote(dimension)) || DIMENSION_KEYNOTES[dimension];
  const center = address.center || centerForGate(a.gate) || 'G';
  const cv = CENTER_VOICES[center] || { voice: 'modulating', anchor: `my ${String(center).toLowerCase()} anchors it` };
  const perspective = address.perspective || 'I';
  const wrapper = address.wrapper || (deep.changingLines.length > 0 ? 'Not yet complete' : 'Already complete');
  const axisGate = gateFromBits(deep.bits.map((b) => 1 - b)); // Axis = complement polarity (Gate 1 <-> Gate 2)
  const axisName = gateArchetype(axisGate);
  // PL2 step 6: optional interference closure — OFF by default. Deterministic
  // beat-note score from the address product; threshold parameter explicit.
  let closure = address.closure || '';
  const interference = options.interference || null;
  if (!closure && interference && interference.enabled) {
    const threshold = interference.threshold ?? 0.9;
    const beat = ((a.gate * line * color * tone * base) % 100) / 100;
    if (beat >= threshold) closure = 'the unexpected echo remains';
  }
  return {
    deep, wrapper, dimension, keynote, sign, modality, modalityVerb,
    gate: a.gate, gateName, line, lineName, planet, planetKeyword,
    colorMotive, toneWord, baseSeed, center, voice: cv.voice, somaticAnchor: cv.anchor,
    perspective, house, houseOrdinal: ORDINALS[house - 1], axisGate, axisName, closure,
  };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const finish = (clauses, closure) =>
  `${clauses.filter(Boolean).join(', ')}.${closure ? ` ${cap(closure)}.` : ''}`;

// The four canonical sentence templates (GGM §6d). Each is a pure function
// from slots to surface string.
export const TEMPLATES = freeze({
  // 1. Minimal plug-and-play [L1912-1914]
  minimal: (s) => finish([
    s.wrapper,
    `${s.sign} ${s.modalityVerb}s the field as ${s.gateName} through ${s.lineName}, ${s.planetKeyword}`,
    s.houseOrdinal ? `in the realm of the ${s.houseOrdinal} House` : null,
    `${s.perspective} speak in a ${s.voice} register — ${s.somaticAnchor}`,
  ], s.closure),
  // 2. Final form [L2411-2414]
  final: (s) => finish([
    s.wrapper,
    `${s.sign} (${s.modality}) ${s.modalityVerb}s through ${s.gateName}, ${s.lineName} line ${s.line}, ${s.planet} ${s.planetKeyword}`,
    `resonating ${s.toneWord} on the ${s.center} channel`,
    `${s.perspective} hold a ${s.voice} voice — ${s.somaticAnchor}`,
    `motivated by ${s.colorMotive}, resonating ${s.toneWord}, rooted in ${s.baseSeed}`,
  ], s.closure),
  // 3. Consciousness Sentence Framework [L3470-3473]
  consciousness: (s) => finish([
    s.wrapper,
    `${s.sign} acts through ${s.gateName} ${s.planetKeyword} (${s.planet})`,
    `motivated by ${s.colorMotive}`,
    `${s.voice} through the ${s.center}`,
    `in the realm of the ${s.houseOrdinal} House`,
    `while its opposite, Gate ${s.axisGate} (${s.axisName}), mirrors it`,
  ], s.closure),
  // 4. 5-Dimensional template [L3614-3617]
  dimensional: (s) => finish([
    `${s.keynote} through ${s.gateName}`,
    `${s.center} anchor, ${s.lineName} expression`,
    `motivated by ${s.colorMotive}, resonating ${s.toneWord}, rooted in ${s.baseSeed}`,
    `under ${s.sign} ${s.modalityVerb}ing in the ${s.houseOrdinal} House`,
    `while Gate ${s.axisGate} creates tension`,
  ], s.closure),
});

export const TEMPLATE_NAMES = freeze(Object.keys(TEMPLATES));

// generateSentence(address, {template, lexicon, interference}) — deterministic
// deep->surface collapse (T25): deep structure = address decomposition,
// surface = one collapsed sentence string. Same address -> same sentence.
export function generateSentence(address, { template = 'minimal', lexicon = {}, interference = null } = {}) {
  const render = TEMPLATES[template];
  if (!render) throw new RangeError(`unknown template '${template}'; expected one of ${TEMPLATE_NAMES.join(', ')}`);
  return render(buildSlots(address, lexicon, { interference }));
}

// All four canonical renderings of the same deep structure.
export function generateSentences(address, options = {}) {
  return freeze(Object.fromEntries(TEMPLATE_NAMES.map((t) => [t, generateSentence(address, { ...options, template: t })])));
}

// ---------------------------------------------------------------------------
// T25 — BINARY_OVERLAY: the binary grammar overlay (GGM §6h [L1745-1777]).
// Line states map to sentence structures; gate/line states map to sentence
// forms. The overlay picks the FORM, T23 fills the slots.

export const BINARY_OVERLAY = freeze([
  freeze({ lineState: 'yin (broken)', sentenceStructure: 'subject/object split' }),
  freeze({ lineState: 'yang (solid)', sentenceStructure: 'subject–verb unity' }),
  freeze({ lineState: 'changing line', sentenceStructure: 'mirror structure (subject ↔ object swap)' }),
  freeze({ lineState: 'stable line', sentenceStructure: 'nested clause (sentence inside a sentence)' }),
  freeze({ lineState: 'multiple moving lines', sentenceStructure: 'echo structure (sentence repeats across slots)' }),
]);

export const SENTENCE_FORMS = freeze({
  'yin-stable': freeze({ id: 'yin-stable', form: 'simple linear sentence (S-V-O)' }),
  'yin-changing': freeze({ id: 'yin-changing', form: 'mirror sentence (S ↔ O)' }),
  'yang-stable': freeze({ id: 'yang-stable', form: 'nested sentence (clause inside clause)' }),
  'yang-changing': freeze({ id: 'yang-changing', form: 'binary split sentence (two parallel options)' }),
  'multiple-movers': freeze({ id: 'multiple-movers', form: 'echo sentence (repeated or reframed)' }),
});

// sentenceFormFor({gate|bits, line, changingLines}) -> SENTENCE_FORMS entry.
// Conversion chain: DMS -> gate/line -> binary -> changing lines -> form [L1735-1794].
export function sentenceFormFor({ gate, bits, line = 1, changingLines = [] } = {}) {
  const b = bits || (gate ? gateBits(gate) : null);
  if (!b) throw new TypeError('sentenceFormFor expects {gate} or {bits}');
  const movers = changingLines.length;
  if (movers > 1) return SENTENCE_FORMS['multiple-movers'];
  if (movers === 1) {
    const yang = b[changingLines[0] - 1] === 1;
    return SENTENCE_FORMS[yang ? 'yang-changing' : 'yin-changing'];
  }
  const yang = b[line - 1] === 1;
  return SENTENCE_FORMS[yang ? 'yang-stable' : 'yin-stable'];
}

// Sentence-form modifiers: deterministic pure transforms on a surface string.
export function overlaySentence(sentence, formId) {
  if (!SENTENCE_FORMS[formId]) throw new RangeError(`unknown sentence form '${formId}'`);
  const clauses = String(sentence).replace(/\.$/, '').split(', ');
  const first = clauses[0];
  switch (formId) {
    case 'yin-stable': return String(sentence);                       // simple linear: unchanged
    case 'yin-changing': return `${[...clauses].reverse().join(', ')}.`; // mirror: clause order swapped
    case 'yang-stable':                                               // nested: tail clauses cocooned
      return clauses.length > 1 ? `${first} (${clauses.slice(1).join(', ')}).` : String(sentence);
    case 'yang-changing': return `${first}, or else ${clauses.slice(1).join(', ') || first}.`; // binary split
    case 'multiple-movers': return `${clauses.join(', ')} — ${first}.`; // echo: first clause repeats
    default: return String(sentence);
  }
}

// ---------------------------------------------------------------------------
// T26 — prediction/generation pipelines (GGM §6f, §7b-7d). Only the
// mechanism-implementable ones have executors here; needs-definition parts
// are named, never faked.

export const PIPELINES = freeze([
  freeze({ id: 'PL1', name: '5-layer routing engine', classification: 'MECHANISM-IMPLEMENTABLE (L1/L2/L4/L5)',
    needsDefinition: ['L3 particle mapping (no numeric codon/isotope tables in source)'],
    implemented: freeze(['fieldParse', 'crystallineTranslate', 'authorityResolve', 'pipelineRoute']),
    sourceRef: 'GGM §6f.1 [L903-1001, L5797-5798]' }),
  freeze({ id: 'PL2', name: 'deterministic 7-step generator', classification: 'MECHANISM-IMPLEMENTABLE',
    needsDefinition: ['step-3 attention weight tables (static defaults used)', 'step-6 interference threshold (off by default)'],
    implemented: freeze(['generateSentence']),
    sourceRef: 'GGM §6f.2 [L1950-1974]' }),
  freeze({ id: 'PL3', name: '5-phase Yijing sentence-generation algorithm', classification: 'MECHANISM-IMPLEMENTABLE (phases 1-4)',
    needsDefinition: ['phase 5 interference arithmetic unspecified'],
    implemented: freeze(['yijingPhases']),
    sourceRef: 'GGM §6f.3 [L4348-4378]' }),
  freeze({ id: 'PL4', name: 'conversion-chart pipeline (DMS -> binary -> sentence)', classification: 'MECHANISM-IMPLEMENTABLE (except CI params)',
    needsDefinition: ['CI collapse threshold: alpha/beta/D/G/C/tau have no values in source'],
    implemented: freeze(['dmsToSentenceForm']),
    sourceRef: 'GGM §6f.4/§6h [L1735-1794]' }),
  freeze({ id: 'PL5', name: 'SSV resonance vector pipeline', classification: 'NEEDS-DEFINITION',
    needsDefinition: ['weights w1..w4 unspecified', 'embedding model external'], implemented: freeze([]),
    sourceRef: 'GGM §6f.5 [L6558-6601]' }),
  freeze({ id: 'PL6', name: 'SynthAI recursive loop', classification: 'NEEDS-DEFINITION',
    needsDefinition: ['weight-update rule, state schema, convergence criteria unspecified'], implemented: freeze([]),
    sourceRef: 'GGM §6f.6 [L7086-7098, L6503-6508]' }),
  freeze({ id: 'PL7', name: 'multimodal encoder', classification: 'NEEDS-DEFINITION',
    needsDefinition: ["numeric symbolic->frequency/color mapping explicitly undefined [L11520-11522]"], implemented: freeze([]),
    sourceRef: 'GGM §6f.7 [L11498-11522]' }),
  freeze({ id: 'PL8', name: 'interpretation layers', classification: 'NEEDS-DEFINITION',
    needsDefinition: ['per-layer operators unspecified; only ordering and names are canon'], implemented: freeze([]),
    sourceRef: 'GGM §6f.8 [L6437-6439]' }),
  freeze({ id: 'PL9', name: 'Ban Xiang subject/object trigram grid', classification: 'MECHANISM-IMPLEMENTABLE',
    needsDefinition: [], implemented: freeze(['banXiangGrid (src/engine/prediction.js)']),
    sourceRef: 'GGM §6f.9 [L3746-3765, L4179-4262]' }),
]);

// PL1-L1 Field Parsing [L903-917]: metadata -> field vectors, pressure
// scores, Personality/Design/Monopole tags. Deterministic lookups only.
export function fieldParse(address) {
  const deep = deepStructure(address);
  const a = deep.address;
  return freeze({
    layer: 'L1',
    fields: freeze({ gate: a.gate, line: address.line ?? a.line, color: address.color ?? a.color,
      tone: address.tone ?? a.tone, base: address.base ?? a.base, degree: a.degree }),
    fieldVectors: freeze({ bits: deep.bits, dimension: deep.dimension }),
    // pressure scores: normalized slot intensities (line/color/tone/base over their maxima)
    pressureScores: freeze({
      line: (address.line ?? a.line) / 6, color: (address.color ?? a.color) / 6,
      tone: (address.tone ?? a.tone) / 6, base: (address.base ?? a.base) / 5,
    }),
    tags: freeze({
      Personality: address.sign != null || address.zodiac != null,
      Design: true, // the address structure itself is the Design layer
      Monopole: address.axis != null, // axis present = monopole tag
    }),
  });
}

// PL1-L2 Crystalline Field Translator [L922-933]: dimension -> 'I ___'
// keynote + grammatical function per field.
export function crystallineTranslate(dimension) {
  if (!DIMENSIONS.includes(dimension)) {
    throw new RangeError(`unknown dimension '${dimension}'; expected one of ${DIMENSIONS.join(', ')}`);
  }
  const keynote = DIMENSION_KEYNOTES[dimension];
  return freeze({
    layer: 'L2', dimension, keynote,
    grammaticalFunction: KEYNOTE_FUNCTIONS[keynote],
    crystalAlternate: CRYSTAL_KEYNOTES[dimension] || null, // C13/C14
  });
}

// PL1-L4 Sentence Authority Resolver [L958-972]: deterministic tie-break
// tree — Crystalline Priority (Monopole > Design > Personality) -> Gate Line
// hierarchy (higher line outranks) -> planetary rulership (Sun > Moon >
// Venus) -> polarity (Yang dominates in expression, Yin in modulation).
const CRYSTALLINE_PRIORITY = freeze({ Monopole: 3, Design: 2, Personality: 1 });
const PLANETARY_RULERSHIP = freeze(['Sun', 'Moon', 'Venus']);

export function authorityResolve(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new TypeError('authorityResolve expects a non-empty candidate list');
  }
  const ranked = candidates.map((c, i) => ({ ...c, _i: i }));
  ranked.sort((x, y) =>
    (CRYSTALLINE_PRIORITY[y.layer] || 0) - (CRYSTALLINE_PRIORITY[x.layer] || 0)
    || (y.line || 0) - (x.line || 0)
    || (PLANETARY_RULERSHIP.indexOf(x.planet) < 0 ? 99 : PLANETARY_RULERSHIP.indexOf(x.planet))
      - (PLANETARY_RULERSHIP.indexOf(y.planet) < 0 ? 99 : PLANETARY_RULERSHIP.indexOf(y.planet))
    || ((x.polarity === 'yang' ? 0 : 1) - (y.polarity === 'yang' ? 0 : 1))
    || (x._i - y._i));
  const [winner, ...rest] = ranked;
  return freeze({
    layer: 'L4',
    initiator: freeze({ agent: winner.agent ?? null, layer: winner.layer ?? null, line: winner.line ?? null }),
    modifiers: freeze(rest.map((c) => freeze({ agent: c.agent ?? null, layer: c.layer ?? null, line: c.line ?? null }))),
    rule: 'Crystalline Priority -> Gate Line hierarchy -> planetary rulership -> polarity (Yang dominates expression)',
  });
}

// PL1 composed: L1 -> L2 -> L4 -> L5 (L3 needs-definition, passed through).
export function pipelineRoute(address, { candidates = null, template = 'minimal', lexicon = {} } = {}) {
  const L1 = fieldParse(address);
  const L2 = crystallineTranslate(L1.fieldVectors.dimension);
  const L4 = candidates ? authorityResolve(candidates) : null;
  const L5 = generateSentence({ ...address, dimension: L1.fieldVectors.dimension }, { template, lexicon });
  return freeze({ L1, L2, L3: 'NEEDS-DEFINITION (no numeric codon/isotope tables in source)', L4, L5 });
}

// PL2 — the 7 deterministic generator steps [L1950-1974]; generateSentence
// above is the executor (steps 1-2 addressing/lookups, 3 static attention
// defaults, 4-5 assembly/voice, 6 interference OFF by default, 7 wrapper).
export const GENERATOR_STEPS = freeze([
  'planet position -> gate+line via degree/min/sec (addressing.js)',
  'lookups: Gate->phrase, Line->descriptor, Planet->keyword, Sign->subject+modality, Center->biology+voice',
  'attention weights (static defaults; weight tables NEEDS-DEFINITION)',
  'core clause assembly',
  'voice + somatic tag',
  'optional interference step for emergent closure (thresholded; OFF by default)',
  'Yijing aspect wrapper, output',
]);

// PL3 phases 1-4 [L4348-4378] — T9/T16/T17/T7 machinery restated.
// Phase 5 (interference resolution) is NEEDS-DEFINITION and not executed.
export function yijingPhases(state) {
  const gate = typeof state === 'number' ? state : state && state.ben;
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) {
    throw new TypeError('yijingPhases expects a gate number or {ben, lines} state');
  }
  const lines = (state && state.lines) || gateBits(gate).map((b) => (b ? 7 : 8));
  const changing = lines.map((v, i) => ((v === 6 || v === 9) ? i + 1 : 0)).filter(Boolean);
  const bits = gateBits(gate);
  const dimension = (state && state.dimension) || DEFAULT_DIMENSION;
  const inverseGate = gateFromBits(bits.map((b) => 1 - b));
  const reverseGate = gateFromBits([...bits].reverse());
  return freeze({
    phase1: freeze({ dimension, keynote: DIMENSION_KEYNOTES[dimension], note: 'dimensional selection; keynote set' }),
    phase2: freeze({
      lower: freeze({ bits: freeze(bits.slice(0, 3)), role: 'zhen (subject/agent: who acts; personal momentum, motives, hopes)' }),
      upper: freeze({ bits: freeze(bits.slice(3, 6)), role: 'hui (object/environment: what is acted upon; tools, raw materials)' }),
    }),
    phase3: freeze({
      changingLines: freeze(changing), stableLines: freeze([1, 2, 3, 4, 5, 6].filter((l) => !changing.includes(l))),
      branch: changing.length > 0 ? `if lines ${changing.join(',')} change -> zhi-gua path` : 'static: judgement-only path',
    }),
    phase4: freeze({
      inversePair: freeze({ gate: inverseGate, role: 'hidden meaning (pang tong)' }),
      reversePair: freeze({ gate: reverseGate, role: 'structural tension (qian gua)' }),
      axisClause: `while its opposite, Gate ${inverseGate}, mirrors it`,
    }),
    phase5: 'NEEDS-DEFINITION (interference arithmetic unspecified)',
  });
}

// PL4 — conversion chart [L1735-1794]: DMS position -> gate/line -> binary
// -> changing lines -> sentence form. CI collapse timing is NEEDS-DEFINITION.
export function dmsToSentenceForm(arcSecond, { changingLines = [] } = {}) {
  const address = addressForArcSec(arcSecond);
  const bits = gateBits(address.gate);
  const formEntry = sentenceFormFor({ bits, line: address.line, changingLines });
  return freeze({
    address: freeze(address),
    binary: freeze(bits.map((b) => (b ? '-' : '--'))), // yang=- / yin=-- [L1735-1794]
    changingLines: freeze(changingLines.slice()),
    form: formEntry.form,
    formId: formEntry.id,
    collapseTrigger: 'NEEDS-DEFINITION: CI = alpha*D*G*C*(1 - e^(-beta*tau)); parameters have no values in source [L1779-1786]',
  });
}

