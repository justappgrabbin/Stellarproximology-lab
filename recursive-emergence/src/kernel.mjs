import { DIMENSIONS, VERDICTS, assertLocalModelPort, assertRealEmission } from './contracts.mjs';
import { sha256, canonicalJson } from './hash.mjs';
import { GrowthLedger } from './growth-ledger.mjs';
import { SurvivalPool } from './fitness-pool.mjs';

import { IntakeGate } from '../vendor/pure-synthia/engine/intake.js';
import { AutomataMesh } from '../vendor/pure-synthia/mesh/mesh.js';
import { Automaton } from '../vendor/pure-synthia/automata/automaton.js';
import { operatorById } from '../vendor/pure-synthia/state-space/operators.js';
import { GraphTraceBuilder } from '../vendor/pure-synthia/experiments/scale/graph-trace.js';
import {
  FiniteStateMachine,
  FSMState,
  FSMTransition,
} from '../vendor/pure-synthia/experiments/scale/fsm.js';
import {
  AutomataComposer,
  createAutomatonOperator,
} from '../vendor/pure-synthia/experiments/scale/automata-composition.js';

const BUNDLE = operatorById('o_bundle');
const SEQUENCE = operatorById('o_sequence');

function primitiveText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const key of ['text', 'value', 'token', 'char', 'id']) {
      if (value[key] != null) return String(value[key]);
    }
  }
  return canonicalJson(value).slice(0, 256);
}

function seedFsm(seed, maxPrimitives = 12) {
  const values = seed.primitives.slice(0, maxPrimitives).map((p) => p.value);
  const fsm = new FiniteStateMachine({
    id: `fsm:${seed.id}`,
    name: `${seed.dimension}-seed-${seed.generation}`,
  });
  const total = Math.max(1, values.length);
  for (let i = 0; i <= total; i += 1) {
    fsm.addState(new FSMState({
      id: `${fsm.id}:q${i}`,
      name: i === 0 ? 'seed' : `primitive-${i}`,
      initial: i === 0,
      accepting: i === total,
      metadata: i > 0 && values[i - 1] != null ? { primitive: values[i - 1] } : {},
    }));
  }
  if (!values.length) {
    fsm.addTransition(new FSMTransition({
      from: `${fsm.id}:q0`, to: `${fsm.id}:q1`, input: '∅',
      metadata: { seedId: seed.id },
    }));
  } else {
    values.forEach((value, i) => {
      fsm.addTransition(new FSMTransition({
        from: `${fsm.id}:q${i}`, to: `${fsm.id}:q${i + 1}`, input: value,
        metadata: { seedId: seed.id, primitiveIndex: i },
      }));
    });
  }
  return fsm;
}

function buildPrompt(dimension, generation, parent) {
  const parentContext = parent
    ? `A prior shared structure exists with witness ${parent.witness}, ${parent.arrival.stateCount} states and ${parent.arrival.transitionCount} transitions. Emit the next condition from your learned dimensional perspective in response to that shared structure.`
    : 'This is the first generation. Emit one condition that can enter the shared substrate.';
  return [
    `You are the local ${dimension} dimensional model.`,
    'Emit a concise seed/condition. Preserve your learned perspective rather than imitating the other dimensions.',
    'Return ordinary text only; the substrate will reduce and address it.',
    parentContext,
    `Generation: ${generation}.`,
  ].join('\n');
}

function structuralEvaluation({ seeds, arrival, meshSnapshot }) {
  const checks = {
    fourDimensions: DIMENSIONS.every((d) => seeds.some((s) => s.dimension === d)),
    fingerprints: seeds.every((s) => /^[0-9a-f]{64}$/i.test(s.modelFingerprint)),
    derivations: seeds.every((s) => Boolean(s.addressed?.derivationId)),
    primitives: seeds.every((s) => s.primitives.length > 0),
    arrivedStates: Number(arrival?.stateCount || 0) > 0,
    arrivedTransitions: Number(arrival?.transitionCount || 0) > 0,
    dependencyTrace: (meshSnapshot.projections?.dependency || []).length >= 3,
    causalTrace: (meshSnapshot.projections?.causal || []).length >= 3,
  };
  const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return Object.freeze({
    verdict: failures.length ? 'INCONCLUSIVE' : 'ACCEPT',
    checks: Object.freeze(checks),
    failures: Object.freeze(failures),
    scope: 'structural-arrival-only',
  });
}

export class RecursiveEmergenceRuntime {
  constructor({ modelPorts = [], maxGenerations = 8, maxPrimitivesPerSeed = 12 } = {}) {
    this.maxGenerations = Math.max(1, Number(maxGenerations) || 8);
    this.maxPrimitivesPerSeed = Math.max(1, Number(maxPrimitivesPerSeed) || 12);
    this.mesh = new AutomataMesh({ manifestVersion: 'stellar.emergence.mesh.v1' });
    this.trace = new GraphTraceBuilder(this.mesh);
    this.intake = new IntakeGate({ engine: { mesh: this.mesh } });
    this.composer = new AutomataComposer();
    this.automatonOperator = createAutomatonOperator(this.composer);
    this.ledger = new GrowthLedger();
    this.pools = new Map(DIMENSIONS.map((d) => [d, new SurvivalPool(d)]));
    for (const port of modelPorts) this.registerModelPort(port);
  }

  registerModelPort(port) {
    assertLocalModelPort(port);
    this.pools.get(port.dimension).register(port);
    return port;
  }

  readiness() {
    return Object.freeze(Object.fromEntries(DIMENSIONS.map((d) => [
      d,
      this.pools.get(d).candidates.size,
    ])));
  }

  _selectPorts() {
    const selected = [];
    for (const dimension of DIMENSIONS) {
      const pool = this.pools.get(dimension);
      if (!pool.candidates.size) throw new Error(`ARRIVAL_BLOCKED: no real local Modelmaker model registered for ${dimension}`);
      selected.push(pool.choose());
    }
    return selected;
  }

  async grow({ generations = 1, context = '' } = {}) {
    const count = Math.min(this.maxGenerations, Math.max(1, Number(generations) || 1));
    let parent = null;
    const history = [];
    for (let generation = 1; generation <= count; generation += 1) {
      const result = await this._growOne({ generation, parent, context });
      history.push(result);
      parent = result.evaluation.verdict === 'ACCEPT' ? result : parent;
      if (result.evaluation.verdict === 'REJECT') break;
    }
    return Object.freeze({
      generationsRequested: count,
      generationsRun: history.length,
      history: Object.freeze(history),
      ledger: this.ledger.toJSON(),
      readiness: this.readiness(),
    });
  }

  async _growOne({ generation, parent, context }) {
    const ports = this._selectPorts();
    this.ledger.append('generation-start', {
      generation,
      parentWitness: parent?.witness || null,
      selectedModels: ports.map((p) => ({ id: p.id, dimension: p.dimension, fingerprint: p.manifest.modelFingerprint })),
    });

    const emissions = await Promise.all(ports.map((port) =>
      port.emitCondition({
        prompt: [context, buildPrompt(port.dimension, generation, parent)].filter(Boolean).join('\n\n'),
        generation,
        parentWitness: parent?.witness || null,
      })
    ));

    const seeds = [];
    for (let i = 0; i < emissions.length; i += 1) {
      const port = ports[i];
      const emission = assertRealEmission(emissions[i], port.dimension);
      const addressed = this.intake.intake(emission.text, {
        source: port.id,
        originDimension: port.dimension,
        modelFingerprint: emission.modelFingerprint,
      });
      const raw = addressed.P?.tokens || addressed.P?.letters || [];
      const primitiveValues = raw.map(primitiveText).filter(Boolean).slice(0, this.maxPrimitivesPerSeed);
      const seedId = `seed:g${generation}:${port.dimension}:${sha256({
        modelFingerprint: emission.modelFingerprint,
        text: emission.text,
      }).slice(0, 16)}`;
      const primitives = primitiveValues.map((value, index) => ({
        id: `primitive:${seedId}:${index}:${sha256(value).slice(0, 10)}`,
        value,
        scale: 'feature',
        dimension: port.dimension,
        originSeed: seedId,
      }));
      const seed = Object.freeze({
        id: seedId,
        generation,
        dimension: port.dimension,
        modelId: emission.modelId,
        modelFingerprint: emission.modelFingerprint,
        text: emission.text,
        addressed,
        primitives: Object.freeze(primitives),
      });
      seeds.push(seed);

      this.mesh.addEdge('knowledge', `model:${emission.modelFingerprint}`, seedId, 'emits', {
        dimension: port.dimension,
        modelId: emission.modelId,
      });
      this.mesh.addEdge('causal', seedId, `address:${addressed.address?.gate || 'field'}`, 'enters_state_space', {
        derivationId: addressed.derivationId,
        dimension: port.dimension,
      });
      primitives.forEach((primitive, index) => this.trace.recordDecomposition(seedId, primitive, index));

      const automaton = new Automaton({
        id: `automaton:g${generation}:${port.dimension}`,
        address: addressed.address || { gate: 1, line: 1, color: 1, tone: 1, base: 1 },
        dimension: port.dimension,
        states: [
          { id: 'emitted', initial: true },
          { id: 'addressed', accepting: true },
        ],
        ports: {
          in: [{ id: 'input', type: 'json' }],
          out: [{ id: 'output', type: 'json', guarantees: ['addressed', 'model-origin-retained'] }],
        },
        capabilities: ['emit-condition', 'retain-model-origin'],
        state: {
          modelFingerprint: emission.modelFingerprint,
          seedId,
          derivationId: addressed.derivationId,
        },
        implementation: (input, { emit }) => {
          emit({ from: 'emitted', to: 'addressed', input: input.id, transition: 'flow' });
          return { seedId: input.id, derivationId: input.addressed.derivationId };
        },
      });
      this.mesh.register(automaton);
      const run = automaton.run(seed);
      this.ledger.append('seed', {
        generation,
        seedId,
        dimension: port.dimension,
        modelId: emission.modelId,
        modelFingerprint: emission.modelFingerprint,
        derivationId: addressed.derivationId,
        primitiveCount: primitives.length,
        automatonTrace: run.trace,
      });
    }

    const generationAutomata = seeds.map((s) => this.mesh.get(`automaton:g${generation}:${s.dimension}`));
    for (const from of generationAutomata) {
      for (const to of generationAutomata) {
        if (from.id === to.id) continue;
        const connection = this.mesh.connect(from.id, to.id, { operator: 'peer-condition-crossing' });
        if (connection.status === 'connected') {
          this.mesh.route({
            id: `packet:g${generation}:${from.dimension}->${to.dimension}`,
            from: from.id,
            to: to.id,
            kind: 'condition-presence',
          });
        }
      }
    }

    const dimensionalBundles = seeds.map((seed) => {
      const bundle = BUNDLE.transform(seed.primitives);
      const wrapped = Object.freeze({ ...bundle, id: `bundle:${seed.id}`, dimension: seed.dimension });
      this.trace.recordComposition('o_bundle', seed.primitives, wrapped);
      return wrapped;
    });
    const shared = Object.freeze({
      ...BUNDLE.transform(dimensionalBundles),
      id: `shared:g${generation}:conditions`,
      generation,
    });
    this.trace.recordComposition('o_bundle', dimensionalBundles, shared);

    const promoted = Object.freeze({
      ...SEQUENCE.transform(dimensionalBundles),
      id: `cross-scale:g${generation}:1`,
      generation,
    });
    this.trace.recordComposition('o_sequence', dimensionalBundles, promoted);

    const fsmByDimension = new Map(seeds.map((seed) => [seed.dimension, seedFsm(seed, this.maxPrimitivesPerSeed)]));
    const alpha = this.automatonOperator.apply([
      fsmByDimension.get('Movement'),
      fsmByDimension.get('Evolution'),
    ], { mode: 'sequential' });
    this.trace.recordComposition('o_automaton', [
      fsmByDimension.get('Movement'),
      fsmByDimension.get('Evolution'),
    ], alpha.result);

    const beta = this.automatonOperator.apply([
      fsmByDimension.get('Being'),
      fsmByDimension.get('Design'),
    ], { mode: 'sequential' });
    this.trace.recordComposition('o_automaton', [
      fsmByDimension.get('Being'),
      fsmByDimension.get('Design'),
    ], beta.result);

    const arrived = this.automatonOperator.apply([
      alpha.fsm,
      beta.fsm,
    ], { mode: 'parallel', synchronize: false });
    this.trace.recordComposition('o_automaton', [alpha.result, beta.result], arrived.result);

    const arrival = Object.freeze({
      ...arrived.result,
      generation,
      sourceSeedIds: Object.freeze(seeds.map((s) => s.id)),
      sourceModelFingerprints: Object.freeze(seeds.map((s) => s.modelFingerprint)),
      sharedConditionId: shared.id,
      crossScaleId: promoted.id,
    });

    const meshSnapshot = this.mesh.snapshot();
    const evaluation = structuralEvaluation({ seeds, arrival, meshSnapshot });
    if (!VERDICTS.includes(evaluation.verdict)) throw new Error('invalid verdict');

    const reward = evaluation.verdict === 'ACCEPT' ? 1 : evaluation.verdict === 'INCONCLUSIVE' ? 0.25 : 0;
    ports.forEach((port) => this.pools.get(port.dimension).observe(port.id, reward, {
      generation,
      arrivalId: arrival.id,
      verdict: evaluation.verdict,
    }));

    const capsuleBody = {
      schema: 'stellar.emergence.capsule.v1',
      generation,
      parentWitness: parent?.witness || null,
      seeds: seeds.map((s) => ({
        id: s.id,
        dimension: s.dimension,
        modelId: s.modelId,
        modelFingerprint: s.modelFingerprint,
        derivationId: s.addressed.derivationId,
        primitiveIds: s.primitives.map((p) => p.id),
      })),
      arrival,
      evaluation,
      meshDigest: sha256(meshSnapshot),
    };
    const witness = sha256(capsuleBody);
    const capsule = Object.freeze({ ...capsuleBody, witness });

    this.ledger.append('arrival', capsule);

    return Object.freeze({
      generation,
      seeds: Object.freeze(seeds),
      shared,
      promoted,
      arrival,
      evaluation,
      witness,
      capsule,
      mesh: meshSnapshot,
    });
  }

  exportGossip() {
    return Object.freeze({
      schema: 'stellar.emergence.gossip.v1',
      pools: Object.freeze(Object.fromEntries(DIMENSIONS.map((d) => [d, this.pools.get(d).gossipSummary()]))),
      ledgerWitness: this.ledger.witness(),
    });
  }

  ingestGossip(packet) {
    if (!packet || packet.schema !== 'stellar.emergence.gossip.v1') {
      return { accepted: false, reason: 'BAD_SCHEMA' };
    }
    const results = {};
    for (const dimension of DIMENSIONS) {
      results[dimension] = this.pools.get(dimension).ingestGossip(packet.pools?.[dimension]);
    }
    const accepted = Object.values(results).every((r) => r.accepted);
    this.ledger.append('peer-gossip', { accepted, results, peerLedgerWitness: packet.ledgerWitness || null });
    return { accepted, results };
  }
}
