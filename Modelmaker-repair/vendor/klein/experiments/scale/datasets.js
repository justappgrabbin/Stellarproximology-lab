// Pure Synthia Automata — experiments/scale: frozen D1/D2/D3 fixture datasets (verbatim) + crosswalk into our state space

/**
 * PORT of pure-synthia-phase1-d1-d2-d31/src/datasets/{d1,d2,d3}.js.
 *
 * DATASET CONTENTS ARE VERBATIM FIXTURES. The 12-item feature inventory, the
 * 9/3 discovery/test splits, the 12 two-phoneme sequences and the 8
 * two-morpheme words are frozen by the source contracts
 * (EXPERIMENT_CONTRACT.md, D2_EXPERIMENT_CONTRACT.md, D3_EXPERIMENT_CONTRACT.md)
 * and MUST NOT be "improved" — the sealed results are defined over them.
 *
 * PROVENANCE:
 *   - inventory + splits: status SOURCE_STATEMENT (the source's own
 *     ASSUMPTIONS.md #2 already frames them as implementation choices:
 *     "The 12-item inventory and 9/3 split are implementation choices, not
 *     linguistic completeness claims."),
 *     source: pure-synthia-phase1-d1-d2-d31/src/datasets/{d1,d2,d3}.js
 *   - FEATURE_CROSSWALK / PHONEME_CROSSWALK: status IMPLEMENTATION_CHOICE
 *     (this port) — maps the fixture feature ids onto our state-space
 *     inventory (src/state-space/features.js) where the datasets overlap.
 *     The benchmark machinery itself keeps the verbatim fixture ids because
 *     the sealed signatures/hashes are defined over them.
 */

import { Primitive } from './core.js';
import { PHONEME_BY_ID, FEATURES } from '../../state-space/features.js';

export const D1_CONTRACT_VERSION = 'D1-contract-1.0.0';
export const D2_CONTRACT_VERSION = 'D2-contract-1.0.0';
export const D3_CONTRACT_VERSION = 'D3-contract-1.0.0';

/* ------------------------------------------------------------------- D1 */

const item = (label, place, manner, voice) => Object.freeze({ label, place, manner, voice });

export const D1_ITEMS = Object.freeze([
  item('p', 'labial', 'stop', 'voiceless'),
  item('b', 'labial', 'stop', 'voiced'),
  item('t', 'alveolar', 'stop', 'voiceless'),
  item('d', 'alveolar', 'stop', 'voiced'),
  item('k', 'velar', 'stop', 'voiceless'),
  item('g', 'velar', 'stop', 'voiced'),
  item('f', 'labial', 'fricative', 'voiceless'),
  item('v', 'labial', 'fricative', 'voiced'),
  item('s', 'alveolar', 'fricative', 'voiceless'),
  item('z', 'alveolar', 'fricative', 'voiced'),
  item('m', 'labial', 'nasal', 'voiced'),
  item('n', 'alveolar', 'nasal', 'voiced'),
]);

export const D1_DISCOVERY_LABELS = Object.freeze(['p', 'b', 't', 'd', 'k', 'f', 's', 'm', 'n']);
export const D1_TEST_LABELS = Object.freeze(['g', 'v', 'z']);

function feature(axis, value) {
  return new Primitive({
    id: `f.${axis}.${value}`,
    identity: `${axis}=${value}`,
    contrast: `[${axis}=${value}]`,
    position: Object.freeze({ axis }),
    operations: ['o_bundle'],
    scale: 'sub-phonemic',
    evidence: ['D1:declared-feature-inventory'],
  });
}

export function createD1PrimitiveRegistry() {
  const primitives = [
    feature('place', 'labial'), feature('place', 'alveolar'), feature('place', 'velar'),
    feature('manner', 'stop'), feature('manner', 'fricative'), feature('manner', 'nasal'),
    feature('voice', 'voiceless'), feature('voice', 'voiced'),
  ];
  return new Map(primitives.map((primitive) => [primitive.id, primitive]));
}

export function featureIdsFor(record) {
  return [`f.place.${record.place}`, `f.manner.${record.manner}`, `f.voice.${record.voice}`];
}

export function getD1Item(label) {
  const found = D1_ITEMS.find((record) => record.label === label);
  if (!found) throw new RangeError(`Unknown D1 item: ${label}`);
  return found;
}

/* ----------------------------------------- crosswalk into our state space */
/* status: IMPLEMENTATION_CHOICE (this port). Every D1 fixture feature has an
 * equivalent in src/state-space/features.js; the benchmark keeps the verbatim
 * fixture ids (sealed signatures embed them), and this crosswalk is the
 * explicit, auditable link between the two vocabularies. */

export const FEATURE_CROSSWALK = Object.freeze({
  'f.place.labial': 'f.place.lab',
  'f.place.alveolar': 'f.place.alv',
  'f.place.velar': 'f.place.vel',
  'f.manner.stop': 'f.manner.stop',
  'f.manner.fricative': 'f.manner.fricative',
  'f.manner.nasal': 'f.manner.nasal',
  'f.voice.voiceless': 'f.voiceless',
  'f.voice.voiced': 'f.voice',
});

// D1 label -> our PHONEMES id (all 12 D1 phonemes exist in our inventory).
export const PHONEME_CROSSWALK = Object.freeze(Object.fromEntries(
  D1_ITEMS.map((record) => [record.label, `p.${record.label}`]),
));

/** Verify every crosswalk target actually exists in our state-space inventory. */
export function validateCrosswalk() {
  const featureIds = new Set(FEATURES.map((f) => f.id));
  const missingFeatures = Object.values(FEATURE_CROSSWALK).filter((id) => !featureIds.has(id));
  const missingPhonemes = Object.values(PHONEME_CROSSWALK).filter((id) => !PHONEME_BY_ID.has(id));
  return Object.freeze({
    ok: missingFeatures.length === 0 && missingPhonemes.length === 0,
    missingFeatures: Object.freeze(missingFeatures),
    missingPhonemes: Object.freeze(missingPhonemes),
  });
}

/* ------------------------------------------------------------------- D2 */

const seq = (id, first, second) => Object.freeze({ id, phonemes: Object.freeze([first, second]) });

export const D2_ITEMS = Object.freeze([
  seq('d2.pt', 'p', 't'),
  seq('d2.tp', 't', 'p'),
  seq('d2.bd', 'b', 'd'),
  seq('d2.db', 'd', 'b'),
  seq('d2.ks', 'k', 's'),
  seq('d2.sk', 's', 'k'),
  seq('d2.mn', 'm', 'n'),
  seq('d2.nm', 'n', 'm'),
  seq('d2.fb', 'f', 'b'),
  seq('d2.gv', 'g', 'v'),
  seq('d2.vz', 'v', 'z'),
  seq('d2.zg', 'z', 'g'),
]);

export const D2_DISCOVERY_IDS = Object.freeze([
  'd2.pt', 'd2.tp', 'd2.bd', 'd2.db', 'd2.ks', 'd2.sk', 'd2.mn', 'd2.nm', 'd2.fb',
]);

export const D2_TEST_IDS = Object.freeze(['d2.gv', 'd2.vz', 'd2.zg']);

export function getD2Item(id) {
  const found = D2_ITEMS.find((record) => record.id === id);
  if (!found) throw new RangeError(`Unknown D2 item: ${id}`);
  return found;
}

/* ------------------------------------------------------------------- D3 */

const word = (id, first, second) => Object.freeze({ id, morphemes: Object.freeze([first, second]) });

export const D3_ITEMS = Object.freeze([
  word('d3.w1', 'd2.pt', 'd2.bd'),
  word('d3.w2', 'd2.bd', 'd2.pt'),
  word('d3.w3', 'd2.ks', 'd2.mn'),
  word('d3.w4', 'd2.mn', 'd2.ks'),
  word('d3.w5', 'd2.sk', 'd2.fb'),
  word('d3.w6', 'd2.fb', 'd2.sk'),
  word('d3.w7', 'd2.gv', 'd2.vz'),
  word('d3.w8', 'd2.vz', 'd2.zg'),
]);

export const D3_DISCOVERY_IDS = Object.freeze(['d3.w1', 'd3.w2', 'd3.w3', 'd3.w4', 'd3.w5', 'd3.w6']);
export const D3_TEST_IDS = Object.freeze(['d3.w7', 'd3.w8']);

export function getD3Item(id) {
  const found = D3_ITEMS.find((record) => record.id === id);
  if (!found) throw new RangeError(`Unknown D3 item: ${id}`);
  return found;
}

