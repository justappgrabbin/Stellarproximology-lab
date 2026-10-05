import { operatorById } from '../vendor/pure-synthia/state-space/operators.js';
import { channelPartners } from '../vendor/pure-synthia/merged/centers-channels.js';
import { gateBits, hamming } from '../vendor/pure-synthia/state-space/addressing.js';
import { sha256 } from './hash.mjs';

const BUNDLE = operatorById('o_bundle');
const SEQUENCE = operatorById('o_sequence');

const HAMMING_NEIGHBORS = new Map();
for (let gate = 1; gate <= 64; gate += 1) {
  const bits = gateBits(gate);
  const neighbors = [];
  for (let other = 1; other <= 64; other += 1) {
    if (other !== gate && hamming(bits, gateBits(other)) === 1) neighbors.push(other);
  }
  HAMMING_NEIGHBORS.set(gate, Object.freeze(neighbors));
}

function relationFor(a, b) {
  const ga = a.address?.gate;
  const gb = b.address?.gate;
  if (!ga || !gb) return null;
  if (ga === gb) return 'same-gate';
  if (channelPartners(ga).includes(gb)) return 'canonical-channel';
  if (HAMMING_NEIGHBORS.get(ga)?.includes(gb)) return 'adjacent-state';
  return null;
}

function feedbackRow(carrierId) {
  return {
    carrierId,
    pieceCount: 0,
    contacts: 0,
    structures: 0,
    counterparts: new Map(),
    fieldWitness: null,
  };
}

function addCounterpart(feedback, otherCarrierId, relation, structures = 0) {
  if (!otherCarrierId || otherCarrierId === feedback.carrierId) return;
  const prior = feedback.counterparts.get(otherCarrierId) || {
    carrierId: otherCarrierId,
    contacts: 0,
    structures: 0,
    lastRelation: null,
  };
  feedback.counterparts.set(otherCarrierId, {
    carrierId: otherCarrierId,
    contacts: prior.contacts + 1,
    structures: prior.structures + structures,
    lastRelation: relation,
  });
}

class DisjointSet {
  constructor(ids) {
    this.parent = new Map(ids.map((id) => [id, id]));
  }
  find(id) {
    const p = this.parent.get(id);
    if (p === id) return id;
    const root = this.find(p);
    this.parent.set(id, root);
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra < rb ? ra : rb);
  }
}

export class EmbodiedField {
  constructor({ mesh, trace, ttlSteps = 6, maxActivePieces = 4096 } = {}) {
    if (!mesh || !trace) throw new TypeError('EmbodiedField requires mesh and trace');
    this.mesh = mesh;
    this.trace = trace;
    this.ttlSteps = Math.max(1, Number(ttlSteps) || 6);
    this.maxActivePieces = Math.max(64, Number(maxActivePieces) || 4096);
    this.active = new Map();
    this.retired = [];
    this.cycleCount = 0;
    this.traceSeq = 0;
    this.lastWitness = null;
    this.lastForm = null;
  }

  hydrate(state = null) {
    if (!state) return this;
    this.active = new Map((state.active || []).map((x) => [x.id, { ...x }]));
    this.retired = Array.isArray(state.retired) ? [...state.retired] : [];
    this.cycleCount = Number(state.cycleCount) || 0;
    this.traceSeq = Number(state.traceSeq) || 0;
    this.lastWitness = state.lastWitness || null;
    this.lastForm = state.lastForm || null;
    return this;
  }

  ingest(releases, step) {
    for (const release of releases) {
      for (const piece of release.pieces) {
        this.active.set(piece.id, {
          ...piece,
          activation: 1,
          contacts: 0,
          bornStep: step,
          lastStep: step,
        });
        this.mesh.addEdge('causal', release.actionId, piece.id, 'embodies_as', {
          carrierId: piece.carrierId,
          modelFingerprint: piece.modelFingerprint,
        });
      }
    }
    this._enforceCapacity();
  }

  _enforceCapacity() {
    if (this.active.size <= this.maxActivePieces) return;
    const ordered = [...this.active.values()].sort((a, b) =>
      a.bornStep - b.bornStep || a.id.localeCompare(b.id));
    const retireCount = this.active.size - this.maxActivePieces;
    for (const piece of ordered.slice(0, retireCount)) this._retire(piece, 'capacity');
  }

  _retire(piece, reason) {
    this.active.delete(piece.id);
    this.retired.push({
      id: piece.id,
      carrierId: piece.carrierId,
      actionId: piece.actionId,
      bornStep: piece.bornStep,
      reason,
    });
    this.mesh.addEdge('temporal', piece.id, `retired:${piece.id}`, 'retires', { reason });
  }

  _contactPairs() {
    const byGate = new Map();
    for (const piece of this.active.values()) {
      const gate = piece.address?.gate;
      if (!gate) continue;
      if (!byGate.has(gate)) byGate.set(gate, []);
      byGate.get(gate).push(piece);
    }
    for (const list of byGate.values()) list.sort((a, b) => a.id.localeCompare(b.id));

    const pairs = [];
    const seen = new Set();
    const gates = [...byGate.keys()].sort((a, b) => a - b);
    for (const gate of gates) {
      const targetGates = new Set([
        gate,
        ...channelPartners(gate),
        ...(HAMMING_NEIGHBORS.get(gate) || []),
      ]);
      for (const a of byGate.get(gate)) {
        for (const target of [...targetGates].sort((x, y) => x - y)) {
          for (const b of byGate.get(target) || []) {
            if (a.id === b.id) continue;
            const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
            if (seen.has(key)) continue;
            const relation = relationFor(a, b);
            if (!relation) continue;
            seen.add(key);
            pairs.push({ a, b, relation });
          }
        }
      }
    }
    return pairs;
  }

  cycle({ step, ticks = 1, currentCarrierIds = [] } = {}) {
    const feedback = new Map(currentCarrierIds.map((id) => [id, feedbackRow(id)]));
    for (const piece of this.active.values()) {
      if (feedback.has(piece.carrierId) && piece.bornStep === step) feedback.get(piece.carrierId).pieceCount += 1;
    }

    const tickReports = [];
    let finalForm = null;

    for (let tick = 1; tick <= Math.max(1, Number(ticks) || 1); tick += 1) {
      this.cycleCount += 1;
      const pairs = this._contactPairs();
      const perPieceContacts = new Map();

      for (const contact of pairs) {
        perPieceContacts.set(contact.a.id, (perPieceContacts.get(contact.a.id) || 0) + 1);
        perPieceContacts.set(contact.b.id, (perPieceContacts.get(contact.b.id) || 0) + 1);
        this.mesh.addEdge('causal', contact.a.id, contact.b.id, 'embodied_contact', {
          relation: contact.relation,
          step,
          tick,
        });
        this.mesh.addEdge('dependency', contact.b.id, contact.a.id, 'contact_depends_on', {
          relation: contact.relation,
          step,
          tick,
        });

        for (const [self, other] of [[contact.a, contact.b], [contact.b, contact.a]]) {
          const row = feedback.get(self.carrierId);
          if (row && self.bornStep === step) {
            row.contacts += 1;
            addCounterpart(row, other.carrierId, contact.relation);
          }
        }
      }

      for (const [pieceId, count] of perPieceContacts) {
        const piece = this.active.get(pieceId);
        if (!piece) continue;
        const previous = piece.activation;
        piece.activation += count;
        piece.contacts += count;
        piece.lastStep = step;
        this.trace.recordActivation(piece.id, piece.activation, previous, { seq: ++this.traceSeq });
      }

      const ids = [...this.active.keys()].sort();
      const dsu = new DisjointSet(ids);
      for (const contact of pairs) dsu.union(contact.a.id, contact.b.id);
      const components = new Map();
      for (const id of ids) {
        const root = dsu.find(id);
        if (!components.has(root)) components.set(root, []);
        components.get(root).push(this.active.get(id));
      }

      const structures = [];
      for (const members of components.values()) {
        if (members.length < 2) continue;
        members.sort((a, b) => a.id.localeCompare(b.id));
        const base = BUNDLE.transform(members);
        const id = `structure:s${step}:t${tick}:${sha256(members.map((x) => x.id)).slice(0, 16)}`;
        const structure = Object.freeze({ ...base, id, step, tick, memberIds: members.map((x) => x.id) });
        structures.push(structure);
        this.trace.recordComposition('o_bundle', members, structure, { step, tick });

        const carriers = [...new Set(members.map((x) => x.carrierId))];
        for (const carrierId of carriers) {
          const row = feedback.get(carrierId);
          if (!row) continue;
          row.structures += 1;
          for (const other of carriers) {
            if (other !== carrierId) addCounterpart(row, other, 'shared-structure', 1);
          }
        }
      }

      if (structures.length > 1) {
        finalForm = Object.freeze({
          ...SEQUENCE.transform(structures),
          id: `field-form:s${step}:t${tick}:${sha256(structures.map((x) => x.id)).slice(0, 16)}`,
          step,
          tick,
        });
        this.trace.recordComposition('o_sequence', structures, finalForm, { step, tick });
      } else {
        finalForm = structures[0] || null;
      }

      tickReports.push(Object.freeze({
        tick,
        contacts: pairs.length,
        structures: structures.length,
        formId: finalForm?.id || null,
      }));
    }

    for (const piece of [...this.active.values()]) {
      if (step - piece.bornStep >= this.ttlSteps) this._retire(piece, 'ttl');
    }

    const summaryBody = {
      schema: 'stellar.embodied.field-cycle.v1',
      step,
      cycles: tickReports,
      activePieces: this.active.size,
      retiredPieces: this.retired.length,
      formId: finalForm?.id || null,
      gateHistogram: this.gateHistogram(),
    };
    const fieldWitness = sha256(summaryBody);
    this.lastWitness = fieldWitness;
    this.lastForm = finalForm;

    const finalizedFeedback = {};
    for (const [carrierId, row] of feedback) {
      finalizedFeedback[carrierId] = Object.freeze({
        carrierId,
        pieceCount: row.pieceCount,
        contacts: row.contacts,
        structures: row.structures,
        counterparts: Object.freeze([...row.counterparts.values()]),
        fieldWitness,
      });
    }

    return Object.freeze({
      ...summaryBody,
      fieldWitness,
      finalForm,
      feedback: Object.freeze(finalizedFeedback),
    });
  }

  gateHistogram() {
    const counts = {};
    for (const piece of this.active.values()) {
      const gate = String(piece.address?.gate || 0);
      counts[gate] = (counts[gate] || 0) + 1;
    }
    return counts;
  }

  summary() {
    return Object.freeze({
      activePieces: this.active.size,
      retiredPieces: this.retired.length,
      cycleCount: this.cycleCount,
      lastWitness: this.lastWitness,
      lastFormId: this.lastForm?.id || null,
      gateHistogram: this.gateHistogram(),
    });
  }

  exportState() {
    return {
      active: [...this.active.values()],
      retired: this.retired,
      cycleCount: this.cycleCount,
      traceSeq: this.traceSeq,
      lastWitness: this.lastWitness,
      lastForm: this.lastForm,
    };
  }
}
