import { existsSync } from 'node:fs';
import { AutomataMesh } from '../vendor/pure-synthia/mesh/mesh.js';
import { GraphTraceBuilder } from '../vendor/pure-synthia/experiments/scale/graph-trace.js';
import { IntakeGate } from '../vendor/pure-synthia/engine/intake.js';
import { GrowthLedger } from './growth-ledger.mjs';
import { AppendOnlyStateStore } from './state-store.mjs';
import { ModelCarrier } from './carrier.mjs';
import { SwarmEmitter } from './swarm.mjs';
import { EmbodiedField } from './embodied-field.mjs';
import { EvolutionManager } from './evolution-manager.mjs';
import { LocalPythonModelPort } from './model-port.mjs';
import { sha256 } from './hash.mjs';

export class EmbodiedSystemRuntime {
  constructor({
    modelPortsById,
    carrierDefinitions = null,
    stateDir = null,
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
    this.stepCount = Number(latest?.stepCount) || 0;
    this.ledger = new GrowthLedger(latest?.growthLedger?.entries || []);

    this.mesh = new AutomataMesh({ manifestVersion: 'stellar.embodied.mesh.v1' });
    this.trace = new GraphTraceBuilder(this.mesh);
    this.intake = new IntakeGate({ engine: { mesh: this.mesh } });
    this.emitter = new SwarmEmitter({
      intake: this.intake,
      trace: this.trace,
      mesh: this.mesh,
      maxPiecesPerAction,
    });
    this.field = new EmbodiedField({
      mesh: this.mesh,
      trace: this.trace,
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
          // A missing/corrupt historical candidate is retained in snapshots but
          // is not executable in this runtime instance.
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
      schema: 'stellar.embodied.system-step.v1',
      step,
      actionIds: actions.map((x) => x.id),
      releaseWitnesses: releases.map((x) => x.witness),
      fieldWitness: cycle.fieldWitness,
      formId: cycle.finalForm?.id || null,
      learning,
    };
    const witness = sha256(stepBody);
    this.ledger.append('system-step', { ...stepBody, witness });

    const snapshot = this.stateStore.commit({
      schema: 'stellar.embodied.runtime-state.v1',
      stepCount: this.stepCount,
      carriers: Object.fromEntries([...this.carriers].map(([id, carrier]) => [id, carrier.exportState()])),
      fieldState: this.field.exportState(),
      growthLedger: this.ledger.toJSON(),
      lastSystemWitness: witness,
    });

    return Object.freeze({
      ...stepBody,
      witness,
      actions: Object.freeze(actions),
      releases: Object.freeze(releases),
      cycle,
      stateSnapshotWitness: snapshot.witness,
    });
  }

  async run({ steps = 1, stimulus = '' } = {}) {
    const reports = [];
    for (let i = 0; i < Math.max(1, Number(steps) || 1); i += 1) {
      reports.push(await this.step(stimulus));
    }
    return Object.freeze({
      schema: 'stellar.embodied.run.v1',
      steps: reports.length,
      reports: Object.freeze(reports),
      field: this.field.summary(),
      ledger: this.ledger.toJSON(),
    });
  }
}
