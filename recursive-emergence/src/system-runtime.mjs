import { existsSync } from 'node:fs';
import { AutomataMesh } from '../vendor/pure-synthia/mesh/mesh.js';
import { EmergentChannels } from '../vendor/pure-synthia/mesh/channels.js';
import { DistributionalLexicon } from '../vendor/pure-synthia/engine/klein-distributional.js';
import { GraphTraceBuilder } from '../vendor/pure-synthia/experiments/scale/graph-trace.js';
import { IntakeGate } from '../vendor/pure-synthia/engine/intake.js';
import { GrowthLedger } from './growth-ledger.mjs';
import { AppendOnlyStateStore } from './state-store.mjs';
import { ModelCarrier } from './carrier.mjs';
import { SwarmEmitter } from './swarm.mjs';
import { ContactRegistry } from './contact-registry.mjs';
import { EmbodiedField } from './embodied-field.mjs';
import { EvolutionManager } from './evolution-manager.mjs';
import { LocalPythonModelPort } from './model-port.mjs';
import { sha256 } from './hash.mjs';

function exportLexicon(lexicon) {
  return [...lexicon.vocabulary.entries()].map(([token, entry]) => ({
    token,
    contexts: [...entry.contexts.entries()],
  }));
}

function hydrateLexicon(lexicon, state = []) {
  for (const row of state || []) {
    lexicon.vocabulary.set(row.token, {
      contexts: new Map(row.contexts || []),
      features: new Array(256).fill(false),
    });
  }
}

function hydrateChannels(channels, state = []) {
  for (const row of state || []) {
    for (let i = 0; i < Number(row.uses || 0); i += 1) {
      channels.recordCrossing(row.a, row.b, { id: row.packetKeys?.[i] || null });
    }
  }
}

export class EmbodiedSystemRuntime {
  constructor({
    modelPortsById,
    carrierDefinitions = null,
    stateDir = null,
    nodeId = null,
    field = {},
    evolution = {},
    maxPiecesPerAction = 96,
  } = {}) {
    if (!(modelPortsById instanceof Map) || modelPortsById.size === 0) {
      throw new TypeError('modelPortsById must be a non-empty Map of verified local model ports');
    }
    this.modelPortsById = modelPortsById;
    this.stateStore = new AppendOnlyStateStore(stateDir);
    const latest = this.stateStore.latest()?.state || null;
    this.nodeId = nodeId || latest?.nodeId || 'local-node';
    this.stepCount = Number(latest?.stepCount) || 0;
    this.lastSystemWitness = latest?.lastSystemWitness || null;
    this.ledger = new GrowthLedger(latest?.growthLedger?.entries || []);

    this.mesh = new AutomataMesh({ manifestVersion: 'stellar.embodied.mesh.v1' });
    this.channels = new EmergentChannels({ mesh: this.mesh });
    this.mesh.channels = this.channels;
    hydrateChannels(this.channels, latest?.channelState || []);

    this.lexicon = new DistributionalLexicon();
    hydrateLexicon(this.lexicon, latest?.lexiconState || []);
    this.contactRegistry = new ContactRegistry({ lexicon: this.lexicon });

    this.trace = new GraphTraceBuilder(this.mesh);
    this.intake = new IntakeGate({ engine: { mesh: this.mesh } });
    this.emitter = new SwarmEmitter({
      intake: this.intake,
      trace: this.trace,
      mesh: this.mesh,
      lexicon: this.lexicon,
      maxPiecesPerAction,
    });
    this.field = new EmbodiedField({
      mesh: this.mesh,
      trace: this.trace,
      contactRegistry: this.contactRegistry,
      channels: this.channels,
      ...field,
    }).hydrate(latest?.fieldState || null);

    this.fieldTicks = Math.max(1, Number(field.ticks) || 1);
    this.evolution = new EvolutionManager({
      stateDir,
      ...evolution,
    });

    const defs = carrierDefinitions || [...modelPortsById.entries()].map(([modelKey, port]) => ({
      id: `carrier:${port.dimension}`,
      dimension: port.dimension,
      gate: null,
      model: modelKey,
    }));

    const savedCarriers = latest?.carriers || {};
    this.carriers = new Map();

    for (const def of defs) {
      const basePort = modelPortsById.get(def.model);
      if (!basePort) throw new Error(`carrier ${def.id} references unknown model key ${def.model}`);
      if (basePort.dimension !== def.dimension) {
        throw new Error(`carrier ${def.id} dimension ${def.dimension} does not match model ${def.model} dimension ${basePort.dimension}`);
      }

      const saved = savedCarriers[def.id] || null;
      const ports = [basePort];
      for (const candidate of saved?.candidates || []) {
        if (!candidate.modelDir || candidate.id === basePort.id || !existsSync(candidate.modelDir)) continue;
        try {
          const port = new LocalPythonModelPort({ modelDir: candidate.modelDir, python: evolution.python || 'python3' });
          if (port.dimension === def.dimension) ports.push(port);
        } catch {
          // Historical candidate remains preserved in append-only snapshots.
        }
      }

      const carrier = new ModelCarrier({
        id: def.id,
        dimension: def.dimension,
        gate: def.gate ?? null,
        modelPorts: ports,
      });
      if (saved) carrier.hydrate(saved);
      this.carriers.set(carrier.id, carrier);
    }
  }

  fieldSummary() {
    return this.field.summary();
  }

  registerContactRule(rule) {
    this.contactRegistry.register(rule);
    return this;
  }

  _runtimeState() {
    return {
      schema: 'stellar.embodied.runtime-state.v2',
      nodeId: this.nodeId,
      stepCount: this.stepCount,
      carriers: Object.fromEntries([...this.carriers].map(([id, carrier]) => [id, carrier.exportState()])),
      fieldState: this.field.exportState(),
      channelState: this.channels.crossings(),
      lexiconState: exportLexicon(this.lexicon),
      growthLedger: this.ledger.toJSON(),
      lastSystemWitness: this.lastSystemWitness,
    };
  }

  async step(stimulus = '') {
    const step = ++this.stepCount;
    const before = this.field.summary();
    this.ledger.append('cognitive-step-start', {
      step,
      stimulusHash: sha256(String(stimulus)),
      fieldWitness: before.lastWitness,
      carriers: [...this.carriers.keys()],
    });

    const actions = await Promise.all([...this.carriers.values()].map((carrier) =>
      carrier.act({
        stimulus,
        fieldSummary: before,
        step,
        parentWitness: before.lastWitness,
      })
    ));

    const releases = actions.map((action) => this.emitter.release(action));
    this.field.ingest(releases, step);

    const cycle = this.field.cycle({
      step,
      ticks: this.fieldTicks,
      currentCarrierIds: actions.map((x) => x.carrierId),
    });

    const learning = [];
    for (const action of actions) {
      const carrier = this.carriers.get(action.carrierId);
      const feedback = cycle.feedback[action.carrierId] || {
        carrierId: action.carrierId,
        pieceCount: 0,
        contacts: 0,
        structures: 0,
        counterparts: [],
        fieldWitness: cycle.fieldWitness,
      };
      const learned = carrier.learn(feedback, action);
      const parentPort = carrier.pool.candidates.get(action.modelId)?.port || null;
      let evolution = { status: 'not-run' };
      try {
        evolution = await this.evolution.maybeEvolve(carrier, parentPort);
      } catch (error) {
        evolution = { status: 'inconclusive', reason: error.message };
      }
      learning.push({
        carrierId: carrier.id,
        actionId: action.id,
        reward: learned.reward,
        evolution,
      });
    }

    const stepBody = {
      schema: 'stellar.embodied.system-step.v2',
      nodeId: this.nodeId,
      step,
      actionIds: actions.map((x) => x.id),
      releaseWitnesses: releases.map((x) => x.witness),
      fieldWitness: cycle.fieldWitness,
      formId: cycle.finalForm?.id || null,
      promotedChannels: this.channels.promoted(),
      learning,
    };
    const witness = sha256(stepBody);
    this.lastSystemWitness = witness;
    this.ledger.append('system-step', { ...stepBody, witness });

    const snapshot = this.stateStore.commit(this._runtimeState());

    return Object.freeze({
      ...stepBody,
      witness,
      actions: Object.freeze(actions),
      releases: Object.freeze(releases),
      cycle,
      stateSnapshotWitness: snapshot.witness,
    });
  }

  exportMeshCapsule({ peerNodeId = this.nodeId } = {}) {
    const carriers = {};
    for (const [id, carrier] of this.carriers) {
      const state = carrier.exportState();
      carriers[id] = {
        id,
        dimension: carrier.dimension,
        gate: carrier.gate,
        fitness: carrier.pool.gossipSummary(),
        relationships: state.relationships,
        experienceCount: state.experiences.length,
      };
    }
    const body = {
      schema: 'stellar.peer.learning-capsule.v1',
      peerNodeId,
      step: this.stepCount,
      systemWitness: this.lastSystemWitness,
      field: {
        lastWitness: this.field.lastWitness,
        formId: this.field.lastForm?.id || null,
        gateHistogram: this.field.gateHistogram(),
        promotedChannels: this.channels.promoted(),
      },
      carriers,
    };
    return Object.freeze({ ...body, witness: sha256(body) });
  }

  ingestMeshCapsule(capsule) {
    if (!capsule || capsule.schema !== 'stellar.peer.learning-capsule.v1') {
      return { accepted: false, reason: 'BAD_SCHEMA' };
    }
    const { witness, ...body } = capsule;
    if (sha256(body) !== witness) return { accepted: false, reason: 'WITNESS_MISMATCH' };
    if (capsule.peerNodeId === this.nodeId) return { accepted: false, reason: 'SELF_CAPSULE' };

    const accepted = [];
    const ignored = [];
    for (const [id, peerCarrier] of Object.entries(capsule.carriers || {})) {
      const local = this.carriers.get(id);
      if (!local) {
        ignored.push({ id, reason: 'NO_LOCAL_CARRIER' });
        continue;
      }
      if (local.dimension !== peerCarrier.dimension || (local.gate ?? null) !== (peerCarrier.gate ?? null)) {
        ignored.push({ id, reason: 'IDENTITY_MISMATCH' });
        continue;
      }
      const fitness = local.pool.ingestGossip(peerCarrier.fitness);
      if (!fitness.accepted) {
        ignored.push({ id, reason: fitness.reason });
        continue;
      }
      local.ingestPeerObservation({
        peerNodeId: capsule.peerNodeId,
        peerWitness: witness,
        fieldWitness: capsule.field?.lastWitness || null,
        formId: capsule.field?.formId || null,
        relationships: peerCarrier.relationships || {},
        step: capsule.step,
      });
      accepted.push(id);
    }

    this.ledger.append('peer-learning-capsule', {
      peerNodeId: capsule.peerNodeId,
      peerWitness: witness,
      accepted,
      ignored,
    });
    const snapshot = this.stateStore.commit(this._runtimeState());
    return {
      accepted: accepted.length > 0,
      acceptedCarriers: accepted,
      ignored,
      snapshotWitness: snapshot.witness,
    };
  }

  close() {
    const ports = new Set(this.modelPortsById.values());
    for (const carrier of this.carriers.values()) {
      for (const row of carrier.pool.candidates.values()) ports.add(row.port);
    }
    for (const port of ports) {
      try { port.close?.(); } catch {}
    }
  }

  async run({ steps = 1, stimulus = '' } = {}) {
    const reports = [];
    for (let i = 0; i < Math.max(1, Number(steps) || 1); i += 1) {
      reports.push(await this.step(stimulus));
    }
    return Object.freeze({
      schema: 'stellar.embodied.run.v2',
      nodeId: this.nodeId,
      steps: reports.length,
      reports: Object.freeze(reports),
      field: this.field.summary(),
      ledger: this.ledger.toJSON(),
    });
  }
}
