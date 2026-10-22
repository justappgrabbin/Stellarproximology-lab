// Pure Synthia Automata — Sovereign Light entry point.
//
// Bundled by esbuild (format=iife, global-name=__SYNTHIA_BUNDLE__) and inlined
// into a single self-contained HTML file (see sovereign.html / the
// synthia-sovereign build). No DOM access happens at import time: the engine
// is pure computation, and the global is attached only when a window/globalThis
// object exists, so the bundle also loads cleanly under node.

import { SynthiaAutomata } from './engine/synthia.js';
import { soundFor, transitionSound } from './state-space/sounds.js';
import { colorFor, transitionColor, COLOR_ANCHORS, DIMENSION_LAYERS } from './state-space/colors.js';
import { NAMED_TRANSITIONS } from './state-space/transitions.js';
import { LETTERS, letterState } from './state-space/letters.js';
import { OPERATORS, operatorById } from './state-space/operators.js';
import {
  addressForArcSec,
  arcSecForAddress,
  gateBits,
  gateFromBits,
  hamming,
  addrKey,
  KING_WEN_TO_FUXI_DECIMAL,
} from './state-space/addressing.js';
import * as merged from './merged/index.js';
import { kleinOperator, kleinInvariants } from './engine/klein.js';
import { OPEN_QUESTIONS } from './engine/questions.js';
import * as fragments from './state-space/fragments.js';
import * as primitiveDimensions from './state-space/primitive-dimensions.js';
import * as generative from './state-space/generative-grammar.js';
import { Predictor, PREDICTION_DISCLAIMER } from './engine/prediction.js';
import { runD1Benchmark } from './experiments/scale/d1.js';
import { runD2Benchmark } from './experiments/scale/d2.js';
import { runD3Benchmark } from './experiments/scale/d3.js';
import { runCrossScaleAnalysis } from './experiments/scale/cross-scale.js';
import { controlMappings } from './experiments/scale/controls.js';
import * as chains from './state-space/chains.js';
import * as claimStatus from './state-space/claim-status.js';
import * as dimensionCanon from './state-space/dimension-canon.js';
import * as canonRegistry from './engine/canon-registry.js';
import * as meshStateSpace from './state-space/mesh-state-space.js';
import * as ruleCouncil from './engine/rule-council.js';
import * as wenWangGua from './state-space/wen-wang-gua.js';
import * as layer5Ssm from './engine/v2/layer5_ssm.js';
import * as phaseSpaceEngine from './engine/v2/phase_space_engine.js';
import * as coordinateEngine from './engine/v2/coordinate_engine.js';
import * as humanDesign from './state-space/human-design.js';
import * as overrideRegistry from './engine/override-registry.js';
import * as selfCorrecting from './engine/self-correcting.js';
import * as correspondences from './state-space/correspondences.js';
import * as synthaiConverter from './engine/synthai-converter.js';
import * as booleanAto from './engine/boolean-ato.js';
import * as resonanceNetwork from './engine/resonance-network.js';
import * as kleinDistributional from './engine/klein-distributional.js';
import * as hypothesisRegistry from './experiments/hypothesis-registry.js';
import * as graphTrace from './experiments/scale/graph-trace.js';
import * as phaseCorpora from './experiments/scale/phase-corpora.js';
import * as scaleFsm from './experiments/scale/fsm.js';
import * as automataComposition from './experiments/scale/automata-composition.js';
import * as scaleParsers from './experiments/scale/parsers.js';
import { LivingLoop } from './organism/living-loop.js';
import * as vitals from './organism/vitals.js';

// One engine instance per page load. Pure computation — no DOM, no network.
const engine = new SynthiaAutomata();

// Turn 11: the endogenous living loop. The organism senses its own vitals,
// develops needs, initiates its own calls (origin:'endogenous'), evaluates
// consequences, and learns. Deterministic per logical tick: the browser's
// heartbeat (UI layer) supplies time by calling organism.tick(); under node
// the loop advances only when ticked. `recent(n)` exposes the tail of the
// hash-chained autobiographical episode log for the UI panel.
const livingLoop = new LivingLoop(engine, { seed: 0x5117 });
const organism = {
  tick: () => livingLoop.tick(),
  getState: () => livingLoop.getState(),
  replay: (log, opts) => livingLoop.replay(log, opts),
  recent: (n = 5) => livingLoop.log.slice(-n),
  vitals,
  loop: livingLoop,
};

const api = {
  engine,
  call: (input) => engine.call(input),
  listTools: () => engine.listTools(),
  meshMetrics: () => engine.meshMetrics(),
  replay: (derivationJSON) => engine.replay(derivationJSON),
  triples: () => engine.triples(),
  emergentChannels: () => engine.emergentChannels(),
  questions: () => engine.questions.list(),
  runRelationalExperiment: () => engine.runRelationalExperiment(),
  klein: { kleinOperator, kleinInvariants, OPEN_QUESTIONS },
  fragments,
  primitiveDimensions,
  generative,
  predict: (state, opts) => new Predictor(engine).next(state, opts),
  PREDICTION_DISCLAIMER,
  scale: { runD1Benchmark, runD2Benchmark, runD3Benchmark, runCrossScaleAnalysis, controlMappings },
  // Turn 9: claim-status provenance + dimension canon + registry (handoff contract)
  claimStatus,
  dimensionCanon,
  canonRegistry,
  // Turn 10: verbatim Black Book chains / Book of Colors tables (perspectival, provenance-wrapped)
  chains,
  // Turn 9d/10: ported donor capabilities (fix-then-integrate; see docs/HANDOFF_INTEGRATION.md §6)
  meshStateSpace,
  ruleCouncil,
  wenWangGua,
  v2: { layer5Ssm, phaseSpaceEngine, coordinateEngine },
  humanDesign,
  overrideRegistry,
  selfCorrecting,
  correspondences,
  synthaiConverter,
  booleanAto,
  resonanceNetwork,
  kleinDistributional,
  hypothesisRegistry,
  graphTrace,
  phaseCorpora,
  scaleLab: { fsm: scaleFsm, composition: automataComposition, parsers: scaleParsers },
  emergence: () => ({ intent: engine.intent, editor: engine.editor, detector: engine.detector, coordinator: engine.coordinator }),
  organism,
  sounds: { soundFor, transitionSound },
  colors: { colorFor, transitionColor, COLOR_ANCHORS, DIMENSION_LAYERS },
  transitions: { NAMED_TRANSITIONS },
  letters: { LETTERS, letterState },
  operators: { OPERATORS, operatorById },
  addressing: {
    addressForArcSec,
    arcSecForAddress,
    gateBits,
    gateFromBits,
    hamming,
    addrKey,
    KING_WEN_TO_FUXI_DECIMAL,
  },
  merged,
};

// Attach the single global API object (guarded: no window under node).
if (typeof window !== 'undefined') {
  window.SYNTHIA_SOVEREIGN = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SYNTHIA_SOVEREIGN = api;
}

export default api;

