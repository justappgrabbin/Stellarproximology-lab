// Pure Synthia Automata — state-space: cross-system correspondence tables
// Ported from -SYNTHAI--main(1)(1).zip / SynthAi.CompleteSuite (C# + CSV -> JS data).
//   - SynthAi.YiJing/Metadata/KingWen.csv   -> KINGWEN_CODON_RINGS (64 rows)
//   - SynthAi.YiJing/Metadata/YiSphere.csv  -> YISPHERE_MANDALA (64 rows)
//   - SynthAi.YiJing/Metadata/YiSphereAlt.csv -> YISPHERE_MANDALA_ALT (64 rows, variant layout)
//   - SynthAi.HumanDesign/MandalaGeometry.cs -> deriveMandalaWheel()/gateStartAngle()/lineStartAngle()
//
// Provenance discipline (state-space/claim-status.js):
//   - CSV rows are SOURCE_STATEMENT data (the donor's own tables). The CodonRing
//     column is the Gene Keys codon-ring correspondence — donor-attributed, not
//     independently attested here.
//   - MandalaGeometry is an ALGORITHMIC derivation of the HD wheel from Fuxi
//     complements: tagged DERIVED (DERIVED_RESULT in audit vocabulary).
//   - Cross-checks against src/merged/kingwen.js run at load; disagreements are
//     exported as first-class CONFLICT records, never silently overwritten.
//   - The GeneKeys JSON scaffolds in SynthAiSuite_skeleton are EMPTY and were
//     NOT ported (nothing to preserve); the CSV column is the only real data.
//
// Defect fix applied during the port:
//   F1. MandalaGeometry.cs BitArray.Append shifts by the LEFT operand's length
//       ((Value << Length) + other.Value) — only correct because both trigram
//       operands are 3 bits. Ported with the correct general form
//       (upper << lowerLength) | lower; identical results for the 3+3 case.

import { claim, CLAIM_STATUS } from './claim-status.js';
import { KING_WEN_TO_FUXI_DECIMAL, gateToFuXiDecimal } from '../merged/kingwen.js';

const KW_SRC = 'SynthAi.CompleteSuite/SynthAi.YiJing/Metadata/KingWen.csv';
const YS_SRC = 'SynthAi.CompleteSuite/SynthAi.YiJing/Metadata/YiSphere.csv';
const YSA_SRC = 'SynthAi.CompleteSuite/SynthAi.YiJing/Metadata/YiSphereAlt.csv';
const MG_SRC = 'SynthAi.CompleteSuite/SynthAi.HumanDesign/MandalaGeometry.cs';

/**
 * King Wen sequence with the donor's CodonRing (Gene Keys codon-ring)
 * correspondence, trigram composition and title. 64 rows, number = gate.
 * SOURCE_STATEMENT (KingWen.csv). youTubeId kept verbatim (empty -> null).
 */
export const KINGWEN_CODON_RINGS = Object.freeze([
  Object.freeze({ number: 1, title: "The Creative Heaven", upperTrigram: "Heaven", lowerTrigram: "Heaven", codonRing: "Fire", youTubeId: "npvjPiEvvcs" }),
  Object.freeze({ number: 2, title: "The Receptive Earth", upperTrigram: "Earth", lowerTrigram: "Earth", codonRing: "Water", youTubeId: "iN7f6lQajZY" }),
  Object.freeze({ number: 3, title: "Difficulty at the Beginning", upperTrigram: "Water", lowerTrigram: "Thunder", codonRing: "LifeAndDeath", youTubeId: "v63UMnC7D6g" }),
  Object.freeze({ number: 4, title: "Youthful Folly", upperTrigram: "Mountain", lowerTrigram: "Water", codonRing: "Union", youTubeId: "zGp_WN89FFU" }),
  Object.freeze({ number: 5, title: "Waiting", upperTrigram: "Water", lowerTrigram: "Heaven", codonRing: "Light", youTubeId: "oFtt7NMWfgo" }),
  Object.freeze({ number: 6, title: "Conflict", upperTrigram: "Heaven", lowerTrigram: "Water", codonRing: "Light", youTubeId: "ekpwjpSROVk" }),
  Object.freeze({ number: 7, title: "The Army", upperTrigram: "Earth", lowerTrigram: "Water", codonRing: "Union", youTubeId: "OIDDxFuqeL4" }),
  Object.freeze({ number: 8, title: "Holding Together", upperTrigram: "Water", lowerTrigram: "Earth", codonRing: "Water", youTubeId: "kCB5mGHDlRs" }),
  Object.freeze({ number: 9, title: "Small Taming", upperTrigram: "Wind", lowerTrigram: "Heaven", codonRing: "Light", youTubeId: "LA60_CsA-Xk" }),
  Object.freeze({ number: 10, title: "Treading", upperTrigram: "Heaven", lowerTrigram: "Lake", codonRing: "Light", youTubeId: "W-6iwskLXE8" }),
  Object.freeze({ number: 11, title: "Peace", upperTrigram: "Earth", lowerTrigram: "Heaven", codonRing: "Light", youTubeId: "nqwTCyG-Wuc" }),
  Object.freeze({ number: 12, title: "Stand Still", upperTrigram: "Heaven", lowerTrigram: "Earth", codonRing: "Trials", youTubeId: "KkXUa05MwpI" }),
  Object.freeze({ number: 13, title: "Fellowship", upperTrigram: "Heaven", lowerTrigram: "Fire", codonRing: "Purification", youTubeId: "xO48ZzJu4R8" }),
  Object.freeze({ number: 14, title: "Great Possession", upperTrigram: "Fire", lowerTrigram: "Heaven", codonRing: "Fire", youTubeId: "vQe-6TvFyRI" }),
  Object.freeze({ number: 15, title: "Modesty", upperTrigram: "Earth", lowerTrigram: "Mountain", codonRing: "Seeking", youTubeId: "zRD-lc6A5d0" }),
  Object.freeze({ number: 16, title: "Enthusiasm", upperTrigram: "Thunder", lowerTrigram: "Earth", codonRing: "Prosperity", youTubeId: "KiH4GFNMNeU" }),
  Object.freeze({ number: 17, title: "Following", upperTrigram: "Lake", lowerTrigram: "Thunder", codonRing: "Light", youTubeId: "bFssypHhJMk" }),
  Object.freeze({ number: 18, title: "Work on the Decayed", upperTrigram: "Mountain", lowerTrigram: "Wind", codonRing: "Matter", youTubeId: "XnohBPq7MKw" }),
  Object.freeze({ number: 19, title: "Approach", upperTrigram: "Earth", lowerTrigram: "Lake", codonRing: "Gaia", youTubeId: "yHuq-0Pcd7Y" }),
  Object.freeze({ number: 20, title: "Contemplation", upperTrigram: "Wind", lowerTrigram: "Earth", codonRing: "LifeAndDeath", youTubeId: null }),
  Object.freeze({ number: 21, title: "Biting Through", upperTrigram: "Fire", lowerTrigram: "Thunder", codonRing: "Light", youTubeId: "IxmU-P3jD8I" }),
  Object.freeze({ number: 22, title: "Grace", upperTrigram: "Mountain", lowerTrigram: "Fire", codonRing: "Divinity", youTubeId: "LO4lOOWyl_Y" }),
  Object.freeze({ number: 23, title: "Splitting Apart", upperTrigram: "Mountain", lowerTrigram: "Earth", codonRing: "LifeAndDeath", youTubeId: "0Y-NlxsWRns" }),
  Object.freeze({ number: 24, title: "Return", upperTrigram: "Earth", lowerTrigram: "Thunder", codonRing: "LifeAndDeath", youTubeId: "mwiQ3AkL9tM" }),
  Object.freeze({ number: 25, title: "Innocence", upperTrigram: "Heaven", lowerTrigram: "Thunder", codonRing: "Light", youTubeId: "sduji1ttAU8" }),
  Object.freeze({ number: 26, title: "Great Taming", upperTrigram: "Mountain", lowerTrigram: "Heaven", codonRing: "Light", youTubeId: "yPat_q9lJzA" }),
  Object.freeze({ number: 27, title: "Mouth Corners", upperTrigram: "Mountain", lowerTrigram: "Thunder", codonRing: "LifeAndDeath", youTubeId: "dSoueNgQFrU" }),
  Object.freeze({ number: 28, title: "Great Preponderance", upperTrigram: "Lake", lowerTrigram: "Wind", codonRing: "Illusion", youTubeId: "0wA371Rtzg8" }),
  Object.freeze({ number: 29, title: "The Abysmal Water", upperTrigram: "Water", lowerTrigram: "Water", codonRing: "Union", youTubeId: "Md8n7q2r4Ls" }),
  Object.freeze({ number: 30, title: "The Clinging Fire", upperTrigram: "Fire", lowerTrigram: "Fire", codonRing: "Purification", youTubeId: "oBWXafmFFP0" }),
  Object.freeze({ number: 31, title: "Influence", upperTrigram: "Lake", lowerTrigram: "Mountain", codonRing: "NoReturn", youTubeId: "L3IyoGgmVeM" }),
  Object.freeze({ number: 32, title: "Duration", upperTrigram: "Thunder", lowerTrigram: "Wind", codonRing: "Illusion", youTubeId: "SWBrMrhmc8s" }),
  Object.freeze({ number: 33, title: "Retreat", upperTrigram: "Heaven", lowerTrigram: "Mountain", codonRing: "Trials", youTubeId: "cCrrRv2-iFE" }),
  Object.freeze({ number: 34, title: "Great Power", upperTrigram: "Thunder", lowerTrigram: "Heaven", codonRing: "Destiny", youTubeId: "uTYHUnFUw1g" }),
  Object.freeze({ number: 35, title: "Progress", upperTrigram: "Fire", lowerTrigram: "Earth", codonRing: "Miracles", youTubeId: "wMZXAGhL6CI" }),
  Object.freeze({ number: 36, title: "Darkening of the Light", upperTrigram: "Earth", lowerTrigram: "Fire", codonRing: "Divinity", youTubeId: "ScWBcMPu-JY" }),
  Object.freeze({ number: 37, title: "The Family", upperTrigram: "Wind", lowerTrigram: "Fire", codonRing: "Divinity", youTubeId: "EIlYGy576mo" }),
  Object.freeze({ number: 38, title: "Opposition", upperTrigram: "Fire", lowerTrigram: "Lake", codonRing: "Light", youTubeId: "I6qeMRjR87c" }),
  Object.freeze({ number: 39, title: "Obstruction", upperTrigram: "Water", lowerTrigram: "Mountain", codonRing: "Seeking", youTubeId: "yOAZVnF4PUQ" }),
  Object.freeze({ number: 40, title: "Deliverance", upperTrigram: "Thunder", lowerTrigram: "Water", codonRing: "Light", youTubeId: "cliwUNU55-g" }),
  Object.freeze({ number: 41, title: "Decrease", upperTrigram: "Mountain", lowerTrigram: "Lake", codonRing: "Origin", youTubeId: "YIn5ctl6e8Y" }),
  Object.freeze({ number: 42, title: "Increase", upperTrigram: "Wind", lowerTrigram: "Thunder", codonRing: "LifeAndDeath", youTubeId: "U5v0w0RRjME" }),
  Object.freeze({ number: 43, title: "Breakthrough", upperTrigram: "Lake", lowerTrigram: "Heaven", codonRing: "Destiny", youTubeId: "9LoryrTdGU8" }),
  Object.freeze({ number: 44, title: "Coming to Meet", upperTrigram: "Heaven", lowerTrigram: "Wind", codonRing: "Illuminati", youTubeId: "E3cboRzwgVE" }),
  Object.freeze({ number: 45, title: "Gathering Together", upperTrigram: "Lake", lowerTrigram: "Earth", codonRing: "Prosperity", youTubeId: "hpHblGNN1CE" }),
  Object.freeze({ number: 46, title: "Pushing Upward", upperTrigram: "Earth", lowerTrigram: "Wind", codonRing: "Matter", youTubeId: "RjYFOF2-by8" }),
  Object.freeze({ number: 47, title: "Oppression", upperTrigram: "Lake", lowerTrigram: "Water", codonRing: "Light", youTubeId: "A5mmFE0sfb8" }),
  Object.freeze({ number: 48, title: "The Well", upperTrigram: "Water", lowerTrigram: "Wind", codonRing: "Matter", youTubeId: "pD66ywW7_S0" }),
  Object.freeze({ number: 49, title: "Revolution", upperTrigram: "Lake", lowerTrigram: "Fire", codonRing: "TheWhirlwind", youTubeId: "ZUCipigNvpQ" }),
  Object.freeze({ number: 50, title: "The Cauldron", upperTrigram: "Fire", lowerTrigram: "Wind", codonRing: "Illuminati", youTubeId: "htUJWkdlcdk" }),
  Object.freeze({ number: 51, title: "The Arousing Thunder", upperTrigram: "Thunder", lowerTrigram: "Thunder", codonRing: "Light", youTubeId: "HHwbQObcx8U" }),
  Object.freeze({ number: 52, title: "The Keeping Still Mountain", upperTrigram: "Mountain", lowerTrigram: "Mountain", codonRing: "Seeking", youTubeId: "p1pC-0Jdhtk" }),
  Object.freeze({ number: 53, title: "Development", upperTrigram: "Wind", lowerTrigram: "Mountain", codonRing: "Seeking", youTubeId: "wAKIjty3Pmk" }),
  Object.freeze({ number: 54, title: "The Marrying Maiden", upperTrigram: "Thunder", lowerTrigram: "Lake", codonRing: "Seeking", youTubeId: "bCcUZFWJYZo" }),
  Object.freeze({ number: 55, title: "Abundance", upperTrigram: "Thunder", lowerTrigram: "Fire", codonRing: "TheWhirlwind", youTubeId: "mxK_Np49uyU" }),
  Object.freeze({ number: 56, title: "The Wanderer", upperTrigram: "Fire", lowerTrigram: "Mountain", codonRing: "Trials", youTubeId: "G-2mSD8C_8o" }),
  Object.freeze({ number: 57, title: "The Gentle Wind", upperTrigram: "Wind", lowerTrigram: "Wind", codonRing: "Matter", youTubeId: "GofQMQkRH5Y" }),
  Object.freeze({ number: 58, title: "The Joyous Lake", upperTrigram: "Lake", lowerTrigram: "Lake", codonRing: "Seeking", youTubeId: "Jn68DXVA1tI" }),
  Object.freeze({ number: 59, title: "Dispersion", upperTrigram: "Wind", lowerTrigram: "Water", codonRing: "Union", youTubeId: "9SyIxEhTwM0" }),
  Object.freeze({ number: 60, title: "Limitation", upperTrigram: "Water", lowerTrigram: "Lake", codonRing: "Gaia", youTubeId: "sopG7S8HbB4" }),
  Object.freeze({ number: 61, title: "Inner Truth", upperTrigram: "Wind", lowerTrigram: "Lake", codonRing: "Gaia", youTubeId: "OyWeHT6gIko" }),
  Object.freeze({ number: 62, title: "Small Preponderance", upperTrigram: "Thunder", lowerTrigram: "Mountain", codonRing: "NoReturn", youTubeId: "WXpkutekC2E" }),
  Object.freeze({ number: 63, title: "After Completion", upperTrigram: "Water", lowerTrigram: "Fire", codonRing: "Divinity", youTubeId: "n2UwWIsn_SY" }),
  Object.freeze({ number: 64, title: "Before Completion", upperTrigram: "Fire", lowerTrigram: "Water", codonRing: "Light", youTubeId: "xIjf5Wn2_o8" }),
]);

/** gate (1..64) -> KingWen.csv row, or throws for out-of-range. */
export function codonRingRow(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError('gate must be 1..64.');
  return KINGWEN_CODON_RINGS[gate - 1];
}

/** gate (1..64) -> Gene Keys codon ring name (donor attribution). */
export function codonRing(gate) { return codonRingRow(gate).codonRing; }

/** The 19 distinct codon rings present in the donor table. */
export const CODON_RINGS = Object.freeze([...new Set(KINGWEN_CODON_RINGS.map((r) => r.codonRing))].sort());

/**
 * YiSphere mandala: gate -> FuXi ordinal -> wheel level/angle/inside.
 * SOURCE_STATEMENT (YiSphere.csv). Angle in degrees as given by the donor.
 */
export const YISPHERE_MANDALA = Object.freeze([
  Object.freeze({ gate: 1, ordinal: 63, bits: '111111', level: 0, angle: 180, inside: false }),
  Object.freeze({ gate: 44, ordinal: 62, bits: '111110', level: 1, angle: 210, inside: false }),
  Object.freeze({ gate: 13, ordinal: 61, bits: '111101', level: 1, angle: 270, inside: false }),
  Object.freeze({ gate: 10, ordinal: 59, bits: '111011', level: 1, angle: 330, inside: false }),
  Object.freeze({ gate: 9, ordinal: 55, bits: '110111', level: 1, angle: 30, inside: false }),
  Object.freeze({ gate: 14, ordinal: 47, bits: '101111', level: 1, angle: 90, inside: false }),
  Object.freeze({ gate: 43, ordinal: 31, bits: '011111', level: 1, angle: 150, inside: false }),
  Object.freeze({ gate: 38, ordinal: 43, bits: '101011', level: 2, angle: 30, inside: false }),
  Object.freeze({ gate: 26, ordinal: 39, bits: '100111', level: 2, angle: 60, inside: false }),
  Object.freeze({ gate: 5, ordinal: 23, bits: '010111', level: 2, angle: 90, inside: false }),
  Object.freeze({ gate: 34, ordinal: 15, bits: '001111', level: 2, angle: 120, inside: false }),
  Object.freeze({ gate: 50, ordinal: 46, bits: '101110', level: 2, angle: 150, inside: false }),
  Object.freeze({ gate: 28, ordinal: 30, bits: '011110', level: 2, angle: 180, inside: false }),
  Object.freeze({ gate: 49, ordinal: 29, bits: '011101', level: 2, angle: 210, inside: false }),
  Object.freeze({ gate: 33, ordinal: 60, bits: '111100', level: 2, angle: 240, inside: false }),
  Object.freeze({ gate: 6, ordinal: 58, bits: '111010', level: 2, angle: 270, inside: false }),
  Object.freeze({ gate: 25, ordinal: 57, bits: '111001', level: 2, angle: 300, inside: false }),
  Object.freeze({ gate: 37, ordinal: 53, bits: '110101', level: 2, angle: 330, inside: false }),
  Object.freeze({ gate: 61, ordinal: 51, bits: '110011', level: 2, angle: 0, inside: false }),
  Object.freeze({ gate: 57, ordinal: 54, bits: '110110', level: 2, angle: 60, inside: true }),
  Object.freeze({ gate: 30, ordinal: 45, bits: '101101', level: 2, angle: 180, inside: true }),
  Object.freeze({ gate: 58, ordinal: 27, bits: '011011', level: 2, angle: 300, inside: true }),
  Object.freeze({ gate: 41, ordinal: 35, bits: '100011', level: 3, angle: 30, inside: false }),
  Object.freeze({ gate: 22, ordinal: 37, bits: '100101', level: 3, angle: 45, inside: false }),
  Object.freeze({ gate: 18, ordinal: 38, bits: '100110', level: 3, angle: 75, inside: false }),
  Object.freeze({ gate: 11, ordinal: 7, bits: '000111', level: 3, angle: 90, inside: false }),
  Object.freeze({ gate: 54, ordinal: 11, bits: '001011', level: 3, angle: 105, inside: false }),
  Object.freeze({ gate: 55, ordinal: 13, bits: '001101', level: 3, angle: 135, inside: false }),
  Object.freeze({ gate: 32, ordinal: 14, bits: '001110', level: 3, angle: 150, inside: false }),
  Object.freeze({ gate: 48, ordinal: 22, bits: '010110', level: 3, angle: 165, inside: false }),
  Object.freeze({ gate: 47, ordinal: 26, bits: '011010', level: 3, angle: 195, inside: false }),
  Object.freeze({ gate: 31, ordinal: 28, bits: '011100', level: 3, angle: 210, inside: false }),
  Object.freeze({ gate: 56, ordinal: 44, bits: '101100', level: 3, angle: 225, inside: false }),
  Object.freeze({ gate: 53, ordinal: 52, bits: '110100', level: 3, angle: 255, inside: false }),
  Object.freeze({ gate: 12, ordinal: 56, bits: '111000', level: 3, angle: 270, inside: false }),
  Object.freeze({ gate: 17, ordinal: 25, bits: '011001', level: 3, angle: 285, inside: false }),
  Object.freeze({ gate: 21, ordinal: 41, bits: '101001', level: 3, angle: 315, inside: false }),
  Object.freeze({ gate: 42, ordinal: 49, bits: '110001', level: 3, angle: 330, inside: false }),
  Object.freeze({ gate: 59, ordinal: 50, bits: '110010', level: 3, angle: 345, inside: false }),
  Object.freeze({ gate: 60, ordinal: 19, bits: '010011', level: 3, angle: 15, inside: false }),
  Object.freeze({ gate: 64, ordinal: 42, bits: '101010', level: 3, angle: 210, inside: true }),
  Object.freeze({ gate: 63, ordinal: 21, bits: '010101', level: 3, angle: 30, inside: true }),
  Object.freeze({ gate: 52, ordinal: 36, bits: '100100', level: 4, angle: 120, inside: true }),
  Object.freeze({ gate: 29, ordinal: 18, bits: '010010', level: 4, angle: 0, inside: true }),
  Object.freeze({ gate: 51, ordinal: 9, bits: '001001', level: 4, angle: 240, inside: true }),
  Object.freeze({ gate: 27, ordinal: 33, bits: '100001', level: 4, angle: 0, inside: false }),
  Object.freeze({ gate: 3, ordinal: 17, bits: '010001', level: 4, angle: 330, inside: false }),
  Object.freeze({ gate: 20, ordinal: 48, bits: '110000', level: 4, angle: 300, inside: false }),
  Object.freeze({ gate: 35, ordinal: 40, bits: '101000', level: 4, angle: 270, inside: false }),
  Object.freeze({ gate: 45, ordinal: 24, bits: '011000', level: 4, angle: 240, inside: false }),
  Object.freeze({ gate: 39, ordinal: 20, bits: '010100', level: 4, angle: 210, inside: false }),
  Object.freeze({ gate: 62, ordinal: 12, bits: '001100', level: 4, angle: 180, inside: false }),
  Object.freeze({ gate: 40, ordinal: 10, bits: '001010', level: 4, angle: 150, inside: false }),
  Object.freeze({ gate: 46, ordinal: 6, bits: '000110', level: 4, angle: 120, inside: false }),
  Object.freeze({ gate: 36, ordinal: 5, bits: '000101', level: 4, angle: 90, inside: false }),
  Object.freeze({ gate: 19, ordinal: 3, bits: '000011', level: 4, angle: 60, inside: false }),
  Object.freeze({ gate: 4, ordinal: 34, bits: '100010', level: 4, angle: 30, inside: false }),
  Object.freeze({ gate: 23, ordinal: 32, bits: '100000', level: 5, angle: 330, inside: false }),
  Object.freeze({ gate: 8, ordinal: 16, bits: '010000', level: 5, angle: 270, inside: false }),
  Object.freeze({ gate: 16, ordinal: 8, bits: '001000', level: 5, angle: 210, inside: false }),
  Object.freeze({ gate: 15, ordinal: 4, bits: '000100', level: 5, angle: 150, inside: false }),
  Object.freeze({ gate: 7, ordinal: 2, bits: '000010', level: 5, angle: 90, inside: false }),
  Object.freeze({ gate: 24, ordinal: 1, bits: '000001', level: 5, angle: 30, inside: false }),
  Object.freeze({ gate: 2, ordinal: 0, bits: '000000', level: 6, angle: 0, inside: false }),
]);

/**
 * YiSphereAlt: the same sphere keyed by ordinal with signed angles and a
 * numeric "inside" code (0/1/2). SOURCE_STATEMENT (YiSphereAlt.csv), kept as
 * a VARIANT table — neither YiSphere layout wins silently.
 */
export const YISPHERE_MANDALA_ALT = Object.freeze([
  Object.freeze({ ordinal: 63, level: 0, angle: 0, insideCode: 0 }),
  Object.freeze({ ordinal: 61, level: 1, angle: -150, insideCode: 0 }),
  Object.freeze({ ordinal: 62, level: 1, angle: -90, insideCode: 0 }),
  Object.freeze({ ordinal: 31, level: 1, angle: -30, insideCode: 0 }),
  Object.freeze({ ordinal: 47, level: 1, angle: 30, insideCode: 0 }),
  Object.freeze({ ordinal: 55, level: 1, angle: 90, insideCode: 0 }),
  Object.freeze({ ordinal: 59, level: 1, angle: 150, insideCode: 0 }),
  Object.freeze({ ordinal: 58, level: 2, angle: -150, insideCode: 0 }),
  Object.freeze({ ordinal: 45, level: 2, angle: -150, insideCode: 2 }),
  Object.freeze({ ordinal: 60, level: 2, angle: -120, insideCode: 0 }),
  Object.freeze({ ordinal: 29, level: 2, angle: -90, insideCode: 0 }),
  Object.freeze({ ordinal: 54, level: 2, angle: -30, insideCode: 2 }),
  Object.freeze({ ordinal: 30, level: 2, angle: -60, insideCode: 0 }),
  Object.freeze({ ordinal: 46, level: 2, angle: -30, insideCode: 0 }),
  Object.freeze({ ordinal: 15, level: 2, angle: 0, insideCode: 0 }),
  Object.freeze({ ordinal: 23, level: 2, angle: 30, insideCode: 0 }),
  Object.freeze({ ordinal: 39, level: 2, angle: 60, insideCode: 0 }),
  Object.freeze({ ordinal: 43, level: 2, angle: 90, insideCode: 0 }),
  Object.freeze({ ordinal: 51, level: 2, angle: 120, insideCode: 0 }),
  Object.freeze({ ordinal: 53, level: 2, angle: 150, insideCode: 0 }),
  Object.freeze({ ordinal: 27, level: 2, angle: 90, insideCode: 2 }),
  Object.freeze({ ordinal: 57, level: 2, angle: 180, insideCode: 0 }),
  Object.freeze({ ordinal: 52, level: 3, angle: -169, insideCode: 1 }),
  Object.freeze({ ordinal: 56, level: 3, angle: -150, insideCode: 0 }),
  Object.freeze({ ordinal: 42, level: 3, angle: -150, insideCode: 2 }),
  Object.freeze({ ordinal: 25, level: 3, angle: -131, insideCode: 1 }),
  Object.freeze({ ordinal: 26, level: 3, angle: -109, insideCode: 1 }),
  Object.freeze({ ordinal: 28, level: 3, angle: -90, insideCode: 0 }),
  Object.freeze({ ordinal: 44, level: 3, angle: -71, insideCode: 1 }),
  Object.freeze({ ordinal: 13, level: 3, angle: -49, insideCode: 1 }),
  Object.freeze({ ordinal: 14, level: 3, angle: -30, insideCode: 0 }),
  Object.freeze({ ordinal: 22, level: 3, angle: -11, insideCode: 1 }),
  Object.freeze({ ordinal: 38, level: 3, angle: 11, insideCode: 1 }),
  Object.freeze({ ordinal: 7, level: 3, angle: 30, insideCode: 0 }),
  Object.freeze({ ordinal: 21, level: 3, angle: 30, insideCode: 2 }),
  Object.freeze({ ordinal: 11, level: 3, angle: 49, insideCode: 1 }),
  Object.freeze({ ordinal: 19, level: 3, angle: 71, insideCode: 1 }),
  Object.freeze({ ordinal: 35, level: 3, angle: 90, insideCode: 0 }),
  Object.freeze({ ordinal: 37, level: 3, angle: 109, insideCode: 1 }),
  Object.freeze({ ordinal: 41, level: 3, angle: 131, insideCode: 1 }),
  Object.freeze({ ordinal: 49, level: 3, angle: 150, insideCode: 0 }),
  Object.freeze({ ordinal: 50, level: 3, angle: 169, insideCode: 1 }),
  Object.freeze({ ordinal: 40, level: 4, angle: -150, insideCode: 0 }),
  Object.freeze({ ordinal: 24, level: 4, angle: -120, insideCode: 0 }),
  Object.freeze({ ordinal: 20, level: 4, angle: -90, insideCode: 0 }),
  Object.freeze({ ordinal: 12, level: 4, angle: -60, insideCode: 0 }),
  Object.freeze({ ordinal: 10, level: 4, angle: -30, insideCode: 0 }),
  Object.freeze({ ordinal: 36, level: 4, angle: -90, insideCode: 2 }),
  Object.freeze({ ordinal: 6, level: 4, angle: 0, insideCode: 0 }),
  Object.freeze({ ordinal: 5, level: 4, angle: 30, insideCode: 0 }),
  Object.freeze({ ordinal: 18, level: 4, angle: 30, insideCode: 2 }),
  Object.freeze({ ordinal: 3, level: 4, angle: 60, insideCode: 0 }),
  Object.freeze({ ordinal: 34, level: 4, angle: 90, insideCode: 0 }),
  Object.freeze({ ordinal: 9, level: 4, angle: 150, insideCode: 2 }),
  Object.freeze({ ordinal: 33, level: 4, angle: 120, insideCode: 0 }),
  Object.freeze({ ordinal: 17, level: 4, angle: 150, insideCode: 0 }),
  Object.freeze({ ordinal: 48, level: 4, angle: 180, insideCode: 0 }),
  Object.freeze({ ordinal: 16, level: 5, angle: -150, insideCode: 0 }),
  Object.freeze({ ordinal: 8, level: 5, angle: -90, insideCode: 0 }),
  Object.freeze({ ordinal: 4, level: 5, angle: -30, insideCode: 0 }),
  Object.freeze({ ordinal: 2, level: 5, angle: 30, insideCode: 0 }),
  Object.freeze({ ordinal: 1, level: 5, angle: 90, insideCode: 0 }),
  Object.freeze({ ordinal: 32, level: 5, angle: 150, insideCode: 0 }),
  Object.freeze({ ordinal: 0, level: 6, angle: 0, insideCode: 0 }),
]);

/** gate (1..64) -> YiSphere row. */
export function yiSphereRow(gate) {
  if (!Number.isInteger(gate) || gate < 1 || gate > 64) throw new RangeError('gate must be 1..64.');
  return YISPHERE_MANDALA.find((r) => r.gate === gate);
}

// ─── MandalaGeometry.cs port: HD wheel derived from Fuxi complements ───

const SECONDS_PER_CIRCLE = 360 * 3600;
export const SECONDS_PER_HEXAGRAM = SECONDS_PER_CIRCLE / 64; // 20250 arcsec = 5.625 deg
export const SECONDS_PER_LINE = SECONDS_PER_HEXAGRAM / 6;    // 3375 arcsec = 0.9375 deg

/**
 * Trigram bit values, top-line-first (MSB-first strings), in the donor's
 * Fuxi derivation order. SOURCE_STATEMENT (MandalaGeometry.cs comments).
 */
export const TRIGRAM_BITS_TOP_FIRST = Object.freeze({
  Heaven: '111', Lake: '011', Fire: '101', Thunder: '001',
  Wind: '110', Water: '010', Mountain: '100', Earth: '000',
});

const TRIGRAM_DERIVATION_ORDER = Object.freeze(['Heaven', 'Lake', 'Fire', 'Thunder', 'Wind', 'Water', 'Mountain', 'Earth']);
const trigramValue = (name) => parseInt(TRIGRAM_BITS_TOP_FIRST[name], 2);

// Donor CreateLookup(): half-circle of 32 (lower from the first four trigrams,
// upper over all eight), then the 32 bitwise complements; start 46deg45min;
// each subsequent figure starts 5.625deg earlier (transit order runs
// backwards). Lookup indexed by figure binary value (= FuXi decimal).
const MANDALA_START_SECONDS = 46 * 3600 + 45 * 60; // 46deg45'00"
const MANDALA_LOOKUP_SECONDS = Object.freeze((() => {
  const order = TRIGRAM_DERIVATION_ORDER.map(trigramValue);
  const halfCircle = [];
  for (const lower of order.slice(0, 4)) {
    for (const upper of order) {
      halfCircle.push((upper << 3) | lower); // F1: donor used (upper << upperLength) — safe only for 3+3
    }
  }
  const sequence = [...halfCircle, ...halfCircle.map((v) => (~v) & 63)];
  const lookup = new Array(64);
  sequence.forEach((value, n) => {
    lookup[value] = (((MANDALA_START_SECONDS - n * SECONDS_PER_HEXAGRAM) % SECONDS_PER_CIRCLE) + SECONDS_PER_CIRCLE) % SECONDS_PER_CIRCLE;
  });
  return lookup;
})());

/**
 * The derived mandala wheel: 64 entries indexed by FuXi decimal (0..63),
 * each { value, startSeconds, startDegrees }. DERIVED (algorithmic, from
 * Fuxi complements; NOT a source statement about the sky).
 */
export const MANDALA_WHEEL = Object.freeze(MANDALA_LOOKUP_SECONDS.map((seconds, value) => Object.freeze({
  value,
  startSeconds: seconds,
  startDegrees: seconds / 3600,
})));

/** MandalaGeometry.cs StartAngle: FuXi decimal (0..63) -> start degrees. */
export function mandalaStartDegrees(fuXiDecimal) {
  if (!Number.isInteger(fuXiDecimal) || fuXiDecimal < 0 || fuXiDecimal > 63) throw new RangeError('fuXiDecimal must be 0..63.');
  return MANDALA_LOOKUP_SECONDS[fuXiDecimal] / 3600;
}

/** King Wen gate (1..64) -> derived mandala start degrees (via our kingwen map). */
export function gateStartAngle(gate) {
  return mandalaStartDegrees(gateToFuXiDecimal(gate));
}

/** MandalaGeometry.cs LineStartAngle: line (1..6) start degrees for a gate. */
export function lineStartAngle(gate, line) {
  if (!Number.isInteger(line) || line < 1 || line > 6) throw new RangeError('line must be 1..6.');
  const gateSeconds = MANDALA_LOOKUP_SECONDS[gateToFuXiDecimal(gate)];
  return ((((gateSeconds - (line - 1) * SECONDS_PER_LINE) % SECONDS_PER_CIRCLE) + SECONDS_PER_CIRCLE) % SECONDS_PER_CIRCLE) / 3600;
}

// ─── cross-checks (run at load; disagreements are CONFLICT records) ───

/**
 * YiSphere ordinal vs our src/merged/kingwen.js KING_WEN_TO_FUXI_DECIMAL.
 * Verified: all 64 agree — exported as the agreement record so the check is
 * visible, not implicit.
 */
export const YISPHERE_ORDINAL_CROSSCHECK = Object.freeze({
  checked: 64,
  mismatches: Object.freeze(
    YISPHERE_MANDALA.filter((r) => KING_WEN_TO_FUXI_DECIMAL[r.gate] !== r.ordinal)
      .map((r) => Object.freeze({ gate: r.gate, yiSphereOrdinal: r.ordinal, ours: KING_WEN_TO_FUXI_DECIMAL[r.gate] })),
  ),
});

/**
 * KingWen.csv trigram composition vs our kingwen.js bit patterns.
 * (CSV upper/lower names -> top-first bits -> FuXi decimal -> gatePattern.)
 */
export const KINGWEN_TRIGRAM_CROSSCHECK = Object.freeze({
  checked: 64,
  mismatches: Object.freeze(
    KINGWEN_CODON_RINGS.filter((r) => {
      const topFirst = TRIGRAM_BITS_TOP_FIRST[r.upperTrigram] + TRIGRAM_BITS_TOP_FIRST[r.lowerTrigram];
      return parseInt(topFirst, 2) !== KING_WEN_TO_FUXI_DECIMAL[r.number];
    }).map((r) => Object.freeze({ gate: r.number, upper: r.upperTrigram, lower: r.lowerTrigram, ours: KING_WEN_TO_FUXI_DECIMAL[r.number] })),
  ),
});

/**
 * Wheel-anchor CONFLICT: this derived wheel puts gate 1 at 46.75 deg and
 * gate 41 at ~328 deg; the humanDesign.ts port anchors gate 41 at 58 deg
 * (code) / ~311.75 deg (its own comment). All anchors preserved; see also
 * HD_WHEEL_ANCHOR_VARIANTS in state-space/human-design.js.
 */
export const MANDALA_ANCHOR_CLAIM = claim(
  { startDegrees: 46.75, gate1Start: mandalaStartDegrees(63), gate41Start: gateStartAngle(41), comment: 'MandalaGeometry.cs also carries the unexplained comment "Gate 1 starts at 13deg15min in Scorpio" (=223.25 deg), inconsistent with its own 46.75 start' },
  {
    status: CLAIM_STATUS.DERIVED,
    source: MG_SRC + ' CreateLookup()',
    evidence: { kind: 'wheel-anchor', conflictsWith: 'human-design.js HD_WHEEL_ANCHOR_VARIANTS (58.0 code / 311.75 comment)' },
  },
);

/** Provenance claims for every table in this module. */
export const CORRESPONDENCE_PROVENANCE = Object.freeze({
  kingwenCodonRings: claim('KingWen.csv 64 rows: number/title/upper/lower trigram/CodonRing/youTubeId', {
    status: CLAIM_STATUS.SOURCE_STATEMENT, source: KW_SRC,
    evidence: { note: 'CodonRing column = Gene Keys codon-ring correspondence (donor attribution; GeneKeys JSON scaffolds in SynthAiSuite_skeleton were empty and were not ported)' },
  }),
  yiSphereMandala: claim('YiSphere.csv 64 rows: gate/ordinal/bits/level/angle/inside', {
    status: CLAIM_STATUS.SOURCE_STATEMENT, source: YS_SRC,
  }),
  yiSphereMandalaAlt: claim('YiSphereAlt.csv 64 rows: ordinal/level/signed-angle/insideCode — variant layout, preserved not merged', {
    status: CLAIM_STATUS.SOURCE_STATEMENT, source: YSA_SRC,
  }),
  mandalaGeometry: MANDALA_ANCHOR_CLAIM,
});

export default Object.freeze({
  KINGWEN_CODON_RINGS, codonRingRow, codonRing, CODON_RINGS,
  YISPHERE_MANDALA, YISPHERE_MANDALA_ALT, yiSphereRow,
  SECONDS_PER_HEXAGRAM, SECONDS_PER_LINE, TRIGRAM_BITS_TOP_FIRST,
  MANDALA_WHEEL, mandalaStartDegrees, gateStartAngle, lineStartAngle,
  YISPHERE_ORDINAL_CROSSCHECK, KINGWEN_TRIGRAM_CROSSCHECK,
  MANDALA_ANCHOR_CLAIM, CORRESPONDENCE_PROVENANCE,
});

