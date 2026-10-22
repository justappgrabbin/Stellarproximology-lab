// Pure Synthia Automata — engine/v2: Phase Space Engine — five-dimensional
// sequential transformation  Space(Design(Being(Evolution(Movement(state)))))
//
// Ported from handoff 02_safe_namespaced_additions/complete_v2_engine/phase_space_engine.js
// (donor synthia_os_complete_v2, ranked PORT #4 in docs/corpus/unique-pieces-survey-2.md;
// filename kept per port contract). Each dimension is a TRANSFORM, not a
// feature; the output of one stage is the input of the next; the trace
// records every intermediate state.
//
// Fix-then-integrate changes vs the donor:
//   1. DONOR DEFECT — CommonJS (`require`/`module.exports`/`window.*`):
//      converted to ESM exports.
//   2. DONOR DEFECT — `Date.now()` in every stage's `_movement/_evolution/
//      _being/_design/_space` sidecar and in establishPresentIdentity()
//      (`being_${Date.now()}` ids): wall-clock leaked into the transformed
//      state, breaking deterministic double-run equality. Replaced with a
//      per-compose integer `tick` injected through context (engine counter —
//      same idiom as engine/synthia.js); ids are `being_t<tick>`.
//   3. DONOR DEFECT — `Math.random()` in applyTrajectory(): the Evolution
//      stage pulled the state in a random direction, so identical runs
//      diverged. Replaced with a seeded mulberry32 rng injected through
//      context (engine seed + tick, so stages differ but runs reproduce).
//   4. DONOR DEFECT — Movement DROPPED the state vector: rotateInHypercube
//      returned a plain array and the stage spread it into the output object
//      (`{...rotatedArray, _movement}`) — the vector survived only as
//      numeric keys, so every downstream stage that read `state.vector`
//      degraded to empty-vector no-ops. Fixed: the rotated vector is kept
//      under `state.vector`.
//   5. DONOR DEFECT — division-by-empty guard regressed: situateState()
//      computed `active / coordinates.length` with no zero guard (NaN
//      surface for vectorless states). Fixed (surface 0).
//   6. DONOR ASSUMED SHAPE — context.mesh.vertices was assumed to be a
//      Map of {vector} vertices. Our AutomataMesh exposes `automata` (a Map
//      of tool automata, not vector vertices). iterVertices() now accepts
//      mesh.vertices / mesh.automata / a plain Map / a plain object, and
//      stages degrade honestly (no relations/edges) when no vector-bearing
//      vertices exist.
//   7. DONOR DEPENDENCY — `require('./layer1_ato_core.js')` used only for
//      hammingDistance + xor; inlined as local helpers (zero deps).
//
// Interrogative projection (READ-ONLY, donor semantics preserved):
//   Who → Space · What → Movement · Where → Being · When → Evolution ·
//   Why → Design
//
// Pure JS ESM, zero deps, browser file://-safe, deterministic (no wall-clock).

import { mulberry32 } from '../../state-space/constants.js';

/* Local replacements for the donor's ATO helpers (length-agnostic). */
function hammingDistance(a, b) {
  const n = Math.min(a.length, b.length);
  let d = Math.abs(a.length - b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}
function xorVectors(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ? 1 : 0) ^ (b[i] ? 1 : 0);
  return out;
}

/* Iterate [id, vertex] pairs from whatever mesh shape we are handed:
 * mesh.vertices (Map or array), mesh.automata (Map — our AutomataMesh),
 * a plain Map, or a plain object of id -> vertex. Never throws. */
function iterVertices(mesh) {
  const source = mesh && (mesh.vertices || mesh.automata) || mesh;
  if (!source) return [];
  if (source instanceof Map) return [...source.entries()];
  if (Array.isArray(source)) return source.map((v, i) => [v && v.id != null ? v.id : i, v]);
  if (typeof source === 'object') return Object.entries(source);
  return [];
}

/* Stage context plumbing: engine.compose() injects `tick` (integer, engine
 * counter) and `rng` (seeded mulberry32). Direct operator.apply() callers
 * get deterministic defaults (tick 0, fixed-seed rng). */
function stageContext(context) {
  return {
    tick: Number.isInteger(context.tick) ? context.tick : 0,
    rng: typeof context.rng === 'function' ? context.rng : mulberry32(0x9e37),
    ...context,
  };
}

// ============================================================
// SECTION 1: OPERATOR BASE CLASS
// ============================================================

export class PhaseOperator {
  constructor(name, transformFn) {
    this.name = name;
    this.transform = transformFn; // (state, context) => { state, events }
  }

  apply(state, context = {}) {
    const result = this.transform(state, stageContext(context));
    return {
      state: result.state,
      events: result.events || [],
      operator: this.name,
      input: state,
      output: result.state,
    };
  }
}

// ============================================================
// SECTION 2: THE FIVE DIMENSIONS
// ============================================================

/* D1: MOVEMENT — the impulse, the initial transformation. */
export const MovementOperator = new PhaseOperator('Movement', (state, context) => {
  const events = [];

  const impulse = detectImpulse(state);
  events.push({ type: 'impulse_detected', impulse, source: 'state_vector' });

  // Geometric rotation in the hypercube — a computation, not a lookup.
  const rotatedVector = rotateInHypercube(state, impulse.axis, impulse.magnitude);
  // FIX (donor defect #4): keep the vector under `vector`; the donor spread
  // the rotated ARRAY into the state object and the vector was lost.
  const transformed = Array.isArray(state) || state === null || typeof state !== 'object'
    ? { vector: rotatedVector }
    : { ...state, vector: rotatedVector };
  events.push({
    type: 'state_rotated',
    axis: impulse.axis,
    magnitude: impulse.magnitude,
    before: state,
    after: transformed,
  });

  const derivative = computeDerivative(state, transformed);
  events.push({ type: 'derivative_computed', value: derivative });

  return {
    state: {
      ...transformed,
      _movement: { impulse, derivative, tick: context.tick },
    },
    events,
  };
});

/* D2: EVOLUTION — the trajectory, how the state changes over time. */
export const EvolutionOperator = new PhaseOperator('Evolution', (state, context) => {
  const events = [];
  const history = context.history || [];

  const trajectory = computeTrajectory(state, history);
  events.push({ type: 'trajectory_computed', points: trajectory.points });

  const patterns = detectChangePatterns(trajectory);
  events.push({ type: 'patterns_detected', patterns });

  // The state is PULLED by its own history (seeded rng — deterministic).
  const evolved = applyTrajectory(state, trajectory, context.rng);
  events.push({
    type: 'state_evolved',
    trajectory_influence: trajectory.influence,
    before: state,
    after: evolved,
  });

  return {
    state: {
      ...evolved,
      _evolution: {
        trajectory,
        patterns,
        history: history.slice(-10),
        tick: context.tick,
      },
    },
    events,
  };
});

/* D3: BEING — the situated state, where it currently exists. */
export const BeingOperator = new PhaseOperator('Being', (state, context) => {
  const events = [];
  const mesh = context.mesh;

  const situated = situateState(state);
  events.push({
    type: 'state_situated',
    coordinates: situated.coordinates,
    surface: situated.surface,
  });

  const relations = computeRelations(situated, mesh);
  events.push({ type: 'relations_computed', count: relations.length });

  const identity = establishPresentIdentity(situated, relations, context.tick);
  events.push({
    type: 'identity_established',
    identity,
    stability: identity.stability,
  });

  return {
    state: {
      ...situated,
      _being: {
        coordinates: situated.coordinates,
        relations,
        identity,
        tick: context.tick,
      },
    },
    events,
  };
});

/* D4: DESIGN — the structural transformation, why this form. */
export const DesignOperator = new PhaseOperator('Design', (state, context) => {
  const events = [];
  const rules = context.rules || [];

  const possibleForms = generatePossibleForms(state);
  events.push({ type: 'forms_generated', count: possibleForms.length });

  const constrained = applyConstraints(possibleForms, rules);
  events.push({
    type: 'constraints_applied',
    rules_used: rules.length,
    forms_remaining: constrained.length,
  });

  const selected = selectForm(constrained, state._evolution?.trajectory);
  events.push({
    type: 'form_selected',
    form: selected.id,
    fit_score: selected.fit,
    reason: selected.reason,
  });

  const designed = applyForm(state, selected);
  events.push({
    type: 'state_designed',
    form_applied: selected.id,
    before: state,
    after: designed,
  });

  return {
    state: {
      ...designed,
      _design: {
        possibleForms: possibleForms.map((f) => f.id),
        selectedForm: selected.id,
        constraints: rules.map((r) => r && r.name).filter(Boolean),
        fitScore: selected.fit,
        tick: context.tick,
      },
    },
    events,
  };
});

/* D5: SPACE — the embedding, the final identity, who this is. */
export const SpaceOperator = new PhaseOperator('Space', (state, context) => {
  const events = [];
  const mesh = context.mesh;

  const embedded = embedInSpace(state, mesh);
  events.push({
    type: 'state_embedded',
    address: embedded.address,
    coordinates: embedded.coordinates,
  });

  const identity = establishIdentity(embedded);
  events.push({
    type: 'identity_established',
    id: identity.id,
    name: identity.name,
    address: identity.address,
  });

  const edges = createEdges(embedded, mesh);
  events.push({
    type: 'edges_created',
    count: edges.length,
    neighbors: edges.map((e) => e.target),
  });

  const navigable = makeNavigable(embedded, edges);
  events.push({
    type: 'state_navigable',
    portals: navigable.portals,
    channels: navigable.channels,
  });

  return {
    state: {
      ...navigable,
      _space: {
        address: identity.address,
        identity,
        edges,
        portals: navigable.portals,
        tick: context.tick,
      },
    },
    events,
  };
});

// ============================================================
// SECTION 3: COMPUTATIONAL FUNCTIONS (NOT LOOKUPS)
// ============================================================

function stateVectorOf(state) {
  if (Array.isArray(state)) return state;
  if (state && Array.isArray(state.vector)) return state.vector;
  return null;
}

function detectImpulse(state) {
  // Dominant direction of change in the state vector — mathematical, not a
  // classification.
  const vector = stateVectorOf(state);
  if (!vector || vector.length === 0) return { axis: 0, magnitude: 0, direction: 'neutral' };

  let maxIdx = 0;
  let maxVal = Math.abs(vector[0]);
  for (let i = 1; i < vector.length; i++) {
    if (Math.abs(vector[i]) > maxVal) {
      maxVal = Math.abs(vector[i]);
      maxIdx = i;
    }
  }

  return {
    axis: maxIdx,
    magnitude: vector[maxIdx],
    direction: vector[maxIdx] > 0 ? 'positive' : vector[maxIdx] < 0 ? 'negative' : 'neutral',
  };
}

function rotateInHypercube(state, axis, magnitude) {
  // Rotate the state vector around the given axis (geometric transform).
  const source = stateVectorOf(state) || [];
  const rotated = source.map((v, i) => {
    if (i === axis) return v;
    return v + magnitude * 0.1 * Math.sin(i + axis);
  });
  const norm = Math.sqrt(rotated.reduce((s, v) => s + v * v, 0));
  return norm > 0 ? rotated.map((v) => v / norm) : rotated;
}

function computeDerivative(before, after) {
  const b = stateVectorOf(before);
  const a = stateVectorOf(after);
  if (!b || !a) return 0;
  const diff = b.map((v, i) => (a[i] ?? 0) - v);
  return Math.sqrt(diff.reduce((s, v) => s + v * v, 0));
}

function computeTrajectory(state, history) {
  const points = history.map((h) => (h && (h.state || h))).filter((s) => s && stateVectorOf(s));
  points.push(state);

  const velocities = [];
  for (let i = 1; i < points.length; i++) {
    const v1 = stateVectorOf(points[i - 1]);
    const v2 = stateVectorOf(points[i]);
    if (v1 && v2) {
      const diff = v1.map((v, j) => (v2[j] ?? 0) - v);
      velocities.push(Math.sqrt(diff.reduce((s, v) => s + v * v, 0)));
    }
  }

  const influence = velocities.length > 0
    ? velocities.reduce((s, v) => s + v, 0) / velocities.length
    : 0;

  return {
    points: points.length,
    velocities,
    influence,
    direction: velocities.length > 0 ? velocities[velocities.length - 1] : 0,
  };
}

function detectChangePatterns(trajectory) {
  const patterns = [];
  const vels = trajectory.velocities;
  if (vels.length < 2) return patterns;

  const accels = [];
  for (let i = 1; i < vels.length; i++) accels.push(vels[i] - vels[i - 1]);

  // vels.length >= 2 guarantees accels.length >= 1 — the division is safe.
  const avgAccel = accels.reduce((s, a) => s + a, 0) / accels.length;
  if (avgAccel > 0.1) patterns.push({ type: 'acceleration', value: avgAccel });
  if (avgAccel < -0.1) patterns.push({ type: 'deceleration', value: avgAccel });
  if (Math.abs(avgAccel) < 0.05) patterns.push({ type: 'steady', value: avgAccel });

  let oscillations = 0;
  for (let i = 1; i < accels.length; i++) {
    if (accels[i] * accels[i - 1] < 0) oscillations++;
  }
  if (accels.length > 0 && oscillations > accels.length / 3) {
    patterns.push({ type: 'oscillation', count: oscillations });
  }

  return patterns;
}

function applyTrajectory(state, trajectory, rng) {
  // Pull the state along its trajectory. FIX (donor defect #3): the donor
  // used Math.random() here — now a seeded rng from the stage context.
  const vector = stateVectorOf(state);
  if (!vector) return state;

  const pull = trajectory.influence * 0.1;
  const newVector = vector.map((v) => v + pull * (rng() - 0.5));

  if (Array.isArray(state) || state === null || typeof state !== 'object') {
    return { vector: newVector };
  }
  return { ...state, vector: newVector };
}

function situateState(state) {
  // Project state onto the current hypercube surface.
  const vector = stateVectorOf(state);
  if (!vector) {
    return { ...(state && typeof state === 'object' && !Array.isArray(state) ? state : {}), vector: [], coordinates: [], surface: 0 };
  }

  const coordinates = vector.map((v, i) => ({
    dimension: i,
    value: v,
    surface: Math.abs(v) > 0.5 ? 'active' : 'dormant',
  }));

  return {
    ...(Array.isArray(state) ? {} : state),
    vector,
    coordinates,
    // FIX (donor defect #5): zero-length guard — donor divided by
    // coordinates.length unguarded (NaN surface for empty vectors).
    surface: coordinates.length > 0
      ? coordinates.filter((c) => c.surface === 'active').length / coordinates.length
      : 0,
  };
}

function computeRelations(situated, mesh) {
  const relations = [];
  const vector = stateVectorOf(situated);
  if (!vector) return relations;

  for (const [id, vertex] of iterVertices(mesh)) {
    const vVec = stateVectorOf(vertex);
    if (vVec) {
      const dist = hammingDistance(
        vector.map((v) => (v > 0 ? 1 : 0)),
        vVec.map((v) => (v > 0 ? 1 : 0)),
      );
      if (dist < 3) {
        relations.push({
          target: id,
          distance: dist,
          type: dist === 0 ? 'identical' : dist < 2 ? 'close' : 'near',
        });
      }
    }
  }
  return relations;
}

function establishPresentIdentity(situated, relations, tick) {
  // Identity derived from the situated state and its relations — not a
  // lookup. FIX (donor defect #2): id is counter-derived, never wall-clock.
  const coords = situated.coordinates || [];
  const activeCoords = coords.filter((c) => c.surface === 'active');
  const stability = coords.length > 0 ? activeCoords.length / coords.length : 0;

  return {
    id: `being_t${Number.isInteger(tick) ? tick : 0}`,
    coordinates: activeCoords.map((c) => c.dimension),
    stability,
    relationCount: relations.length,
    form: stability > 0.6 ? 'defined' : stability > 0.3 ? 'emerging' : 'diffuse',
  };
}

function generatePossibleForms(state) {
  // Generate possible forms from the current state — a creative operation.
  const vector = stateVectorOf(state);
  if (!vector || vector.length === 0) return [];

  const maxVal = Math.max(...vector.map(Math.abs));

  return [
    { id: 'direct', vector: [...vector], fit: 1.0, reason: 'direct_projection' },
    { id: 'complement', vector: vector.map((v) => -v), fit: 0.5, reason: 'complementary_form' },
    { id: 'amplified', vector: vector.map((v) => v / (maxVal || 1)), fit: 0.7, reason: 'amplified_form' },
    { id: 'attenuated', vector: vector.map((v) => v * 0.5), fit: 0.3, reason: 'attenuated_form' },
  ];
}

function applyConstraints(forms, rules) {
  // Rules are predicate functions, not lookup tables.
  let constrained = [...forms];
  for (const rule of rules) {
    if (typeof rule === 'function') {
      constrained = constrained.filter((form) => rule(form));
    }
  }
  return constrained.length > 0 ? constrained : forms.slice(0, 1);
}

function selectForm(forms, trajectory) {
  if (forms.length === 0) return { id: 'none', fit: 0, reason: 'no_forms' };

  const scored = forms.map((form) => {
    let score = form.fit || 0.5;
    if (trajectory && trajectory.direction > 0) score += 0.1;
    return { ...form, score };
  });
  // Deterministic tiebreak: stable order by generation order on equal score.
  scored.sort((a, b) => b.score - a.score);

  return { ...scored[0], fit: scored[0].score };
}

function applyForm(state, form) {
  const base = Array.isArray(state) || state === null || typeof state !== 'object' ? {} : state;
  return {
    ...base,
    vector: form.vector || stateVectorOf(state) || [],
    form: form.id,
  };
}

function embedInSpace(state, mesh) {
  const vector = stateVectorOf(state) || [];
  const address = computeAddress(vector);
  return {
    ...(Array.isArray(state) || state === null || typeof state !== 'object' ? {} : state),
    vector,
    address,
    coordinates: vector,
  };
}

function computeAddress(vector) {
  // Stable address from the vector (deterministic weighted-sum hash).
  if (!Array.isArray(vector)) return 'addr_unknown';
  const hash = vector.reduce((s, v, i) => s + Math.abs(v) * (i + 1), 0);
  return `addr_${Math.floor(hash * 1000)}`;
}

function establishIdentity(embedded) {
  return {
    id: `id_${embedded.address}`,
    name: `State_${embedded.address}`,
    address: embedded.address,
    vector: embedded.vector,
  };
}

function createEdges(embedded, mesh) {
  const edges = [];
  const vector = stateVectorOf(embedded);
  if (!vector) return edges;

  for (const [id, vertex] of iterVertices(mesh)) {
    const vVec = stateVectorOf(vertex);
    if (vVec) {
      const eBits = vector.map((v) => (v > 0 ? 1 : 0));
      const vBits = vVec.map((v) => (v > 0 ? 1 : 0));
      const dist = hammingDistance(eBits, vBits);
      if (dist < 3 && dist > 0) {
        edges.push({ target: id, distance: dist, transform: xorVectors(eBits, vBits) });
      }
    }
  }
  return edges;
}

function makeNavigable(embedded, edges) {
  const portals = edges.map((e, i) => ({
    id: `portal_${i}`,
    target: e.target,
    distance: e.distance,
    direction: i % 6, // six directions for hexagonal navigation
  }));

  const channels = [];
  for (let i = 0; i < portals.length - 1; i++) {
    channels.push({ from: portals[i].id, to: portals[i + 1].id, active: true });
  }

  return { ...embedded, portals, channels };
}

// ============================================================
// SECTION 4: PHASE SPACE ENGINE
// ============================================================

export class PhaseSpaceEngine {
  /* seed: mulberry32 seed for the Evolution stage's trajectory pull.
   * Default fixed — identical (state, context, seed) runs are identical. */
  constructor({ seed = 0x5eed } = {}) {
    this.seed = seed >>> 0;
    this.tick = 0; // engine counter — injected into stages, never wall-clock
    this.operators = {
      Movement: MovementOperator,
      Evolution: EvolutionOperator,
      Being: BeingOperator,
      Design: DesignOperator,
      Space: SpaceOperator,
    };
    this.stageOrder = ['Movement', 'Evolution', 'Being', 'Design', 'Space'];
  }

  /* Run the full five-stage composition. Returns {finalState, trace,
   * errors, complete}; the trace records every intermediate stage. */
  compose(initialState, context = {}) {
    const trace = [];
    const errors = [];
    let currentState = initialState;

    // Per-compose deterministic stage context: one tick, one seeded rng
    // stream. Callers may override either (stageContext supplies defaults).
    const tick = ++this.tick;
    const staged = {
      rng: mulberry32(this.seed ^ Math.imul(tick, 0x9e3779b1)),
      ...context,
      tick,
    };

    for (const stageName of this.stageOrder) {
      const operator = this.operators[stageName];

      if (!operator) {
        errors.push({
          stage: stageName,
          error: 'MISSING_OPERATOR',
          message: `Operator ${stageName} is not registered`,
        });
        continue;
      }

      const result = operator.apply(currentState, staged);

      trace.push({
        stage: stageName,
        input: result.input,
        output: result.output,
        events: result.events,
        operator: result.operator,
      });

      currentState = result.state;
    }

    return { finalState: currentState, trace, errors, complete: errors.length === 0 };
  }

  /* Read-only projection of a completed trace through an alternate basis.
   * Does not recompute the state. */
  project(trace, projection = 'interrogative') {
    const projections = {
      interrogative: {
        Who: 'Space', What: 'Movement', Where: 'Being', When: 'Evolution', Why: 'Design',
      },
      chronological: {
        First: 'Movement', Second: 'Evolution', Third: 'Being', Fourth: 'Design', Fifth: 'Space',
      },
      structural: {
        Foundation: 'Movement', Process: 'Evolution', Situation: 'Being', Form: 'Design', Identity: 'Space',
      },
    };

    const mapping = projections[projection] || projections.interrogative;
    const result = {};

    for (const [key, stageName] of Object.entries(mapping)) {
      const stage = trace.find((t) => t.stage === stageName);
      if (stage) {
        result[key] = { stage: stageName, output: stage.output, events: stage.events };
      }
    }

    return result;
  }

  registerOperator(stageName, operator) {
    this.operators[stageName] = operator;
  }

  getOperator(stageName) {
    return this.operators[stageName];
  }
}

export default PhaseSpaceEngine;

