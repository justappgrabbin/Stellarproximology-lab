import { SurvivalPool } from './fitness-pool.mjs';
import { assertLocalModelPort, assertRealEmission } from './contracts.mjs';
import { sha256 } from './hash.mjs';

function compactRelationships(relationships) {
  return [...relationships.entries()]
    .sort((a, b) => (b[1].contacts || 0) - (a[1].contacts || 0) || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([id, row]) => ({ id, contacts: row.contacts || 0, structures: row.structures || 0, lastRelation: row.lastRelation || null }));
}

export class ModelCarrier {
  constructor({ id, dimension, gate = null, modelPorts = [], savedState = null } = {}) {
    if (!id) throw new TypeError('carrier id is required');
    this.id = id;
    this.dimension = dimension;
    this.gate = gate;
    this.pool = new SurvivalPool(dimension);
    this.relationships = new Map();
    this.experiences = [];
    this.peerObservations = [];
    this.actionCount = 0;
    this.lastEvolutionExperienceCount = 0;
    for (const port of modelPorts) this.registerCandidate(port);
    if (savedState) this.hydrate(savedState);
  }

  registerCandidate(port) {
    assertLocalModelPort(port);
    if (port.dimension !== this.dimension) throw new Error(`${this.id}: candidate dimension mismatch`);
    this.pool.register(port);
    return port;
  }

  hydrate(saved) {
    this.actionCount = Number(saved.actionCount) || 0;
    this.lastEvolutionExperienceCount = Number(saved.lastEvolutionExperienceCount) || 0;
    this.experiences = Array.isArray(saved.experiences) ? [...saved.experiences] : [];
    this.peerObservations = Array.isArray(saved.peerObservations) ? [...saved.peerObservations] : [];
    this.relationships = new Map(Object.entries(saved.relationships || {}));
    for (const candidate of saved.candidates || []) this.pool.restore(candidate.id, candidate);
    return this;
  }

  async act({ stimulus = '', fieldSummary = {}, step = 1, parentWitness = null } = {}) {
    const port = this.pool.choose();
    const relationships = compactRelationships(this.relationships);
    const recent = this.experiences.slice(-6).map((x) => ({
      step: x.step,
      fieldWitness: x.fieldWitness,
      contacts: x.contacts,
      structures: x.structures,
    }));
    const peer = this.peerObservations.slice(-4);
    const prompt = [
      `Carrier identity: ${this.id}`,
      `Dimensional perspective: ${this.dimension}`,
      this.gate ? `Hexagram carrier gate: ${this.gate}` : null,
      'You operate only on the cognitive/2D side. Your action will be reduced into swarm pieces by the substrate; do not attempt to manipulate the embodied field directly.',
      `Current embodied field: ${JSON.stringify(fieldSummary)}`,
      `Current relationships: ${JSON.stringify(relationships)}`,
      `Recent embodied experience: ${JSON.stringify(recent)}`,
      `Verified peer-mesh observations: ${JSON.stringify(peer)}`,
      `Current stimulus: ${String(stimulus)}`,
      'Produce the next concise action/condition as ordinary text.',
    ].filter(Boolean).join('\n');
    const emission = assertRealEmission(await port.emitCondition({
      prompt,
      generation: step,
      parentWitness,
    }), this.dimension);
    this.actionCount += 1;
    return Object.freeze({
      schema: 'stellar.cognitive.action.v1',
      id: `action:${this.id}:${step}:${sha256({
        carrier: this.id,
        model: emission.modelFingerprint,
        text: emission.text,
      }).slice(0, 16)}`,
      step,
      carrierId: this.id,
      dimension: this.dimension,
      carrierGate: this.gate,
      modelId: emission.modelId,
      modelFingerprint: emission.modelFingerprint,
      text: emission.text,
    });
  }

  learn(feedback, action) {
    const counterparts = feedback.counterparts || [];
    for (const row of counterparts) {
      const prior = this.relationships.get(row.carrierId) || { contacts: 0, structures: 0, lastRelation: null };
      this.relationships.set(row.carrierId, {
        contacts: prior.contacts + (row.contacts || 0),
        structures: prior.structures + (row.structures || 0),
        lastRelation: row.lastRelation || prior.lastRelation,
      });
    }
    const experience = Object.freeze({
      step: action.step,
      actionId: action.id,
      modelId: action.modelId,
      modelFingerprint: action.modelFingerprint,
      fieldWitness: feedback.fieldWitness,
      pieceCount: feedback.pieceCount || 0,
      contacts: feedback.contacts || 0,
      structures: feedback.structures || 0,
      counterparts,
    });
    this.experiences.push(experience);
    const reward = feedback.structures > 0 ? 1 : feedback.contacts > 0 ? 0.6 : feedback.pieceCount > 0 ? 0.25 : 0;
    this.pool.observe(action.modelId, reward, {
      step: action.step,
      fieldWitness: feedback.fieldWitness,
      contacts: feedback.contacts || 0,
      structures: feedback.structures || 0,
    });
    return { experience, reward };
  }

  ingestPeerObservation(observation) {
    const body = Object.freeze({
      peerNodeId: observation.peerNodeId,
      peerWitness: observation.peerWitness,
      fieldWitness: observation.fieldWitness || null,
      formId: observation.formId || null,
      relationships: observation.relationships || {},
      step: observation.step || null,
    });
    this.peerObservations.push(body);
    return body;
  }

  experiencesSinceEvolution() {
    return this.experiences.slice(this.lastEvolutionExperienceCount);
  }

  markEvolved() {
    this.lastEvolutionExperienceCount = this.experiences.length;
  }

  trainingText() {
    const local = this.experiencesSinceEvolution().map((x) => `LOCAL_RELATIONSHIP ${JSON.stringify(x)}`);
    const peer = this.peerObservations.slice(-Math.max(8, local.length)).map((x) => `VERIFIED_PEER_OBSERVATION ${JSON.stringify(x)}`);
    return [...local, ...peer].join('\n');
  }

  exportState() {
    return {
      id: this.id,
      dimension: this.dimension,
      gate: this.gate,
      actionCount: this.actionCount,
      lastEvolutionExperienceCount: this.lastEvolutionExperienceCount,
      relationships: Object.fromEntries(this.relationships),
      experiences: this.experiences,
      peerObservations: this.peerObservations,
      candidates: this.pool.exportState(),
    };
  }
}
