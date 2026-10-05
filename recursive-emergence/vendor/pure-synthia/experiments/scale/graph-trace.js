// Pure Synthia Automata — experiments/scale: graph-trace builder + multi-scale
// state mesh. Ported from pure-synthia-phase2.zip src/graph/{topology,mesh}.js
// (ORIGINAL pre-repair variants).
//
// ADAPTER (handoff CONFLICTS.md rule 2-3): the donor's Graph/GraphProjectionSet
// classes duplicate capability our src/mesh/mesh.js AutomataMesh already owns
// (the same five projections: knowledge/causal/phase/temporal/dependency), so
// the donor graph classes are NOT ported. GraphTopologyBuilder is ported as an
// adapter writing into an AutomataMesh via mesh.addEdge(projection, ...). The
// multi-scale StateMesh/MeshRegistry (M(x) = {local, personal, value, scale,
// group} with qualifier-filtered packet propagation, spec §10) is a capability
// our mesh does not have (AutomataMesh routes automaton-to-automaton; StateMesh
// broadcasts qualified state packets to state members) — ported here.
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Date.now() in StateMesh.join/propagate and recordActivation's temporal
//       edge labels -> deterministic per-instance seq counters (`seq`,
//       `t<seq>` labels). The donor's temporal edges used raw wall-clock both
//       in labels and packet metadata, making traces non-reproducible.
//   F2. recordActivation called activation.toFixed(3) — crashed on
//       non-numeric activation; now validated with a TypeError up front.

export const MESH_TYPES = Object.freeze(['local', 'personal', 'value', 'scale', 'group']);

/**
 * GraphTopologyBuilder (adapter): records engine operations as traceable edges
 * in the five projections of an AutomataMesh (src/mesh/mesh.js). Every
 * decomposition, composition and activation generates evidence-carrying edges.
 * (Donor: phase2_orig/src/graph/topology.js; edge semantics verbatim.)
 */
export class GraphTraceBuilder {
  constructor(mesh, evidenceRegistry = null) {
    if (!mesh || typeof mesh.addEdge !== 'function') {
      throw new TypeError('GraphTraceBuilder requires an AutomataMesh-like target (addEdge(projection, from, to, relation, metadata))');
    }
    this.mesh = mesh;
    this.evidence = evidenceRegistry || { create: () => null };
    this._edgeCounter = 0;
    this._seq = 0; // F1
  }

  // Record that primitive was decomposed from input string at position p.
  recordDecomposition(input, primitive, position, context = {}) {
    const evidenceId = this._nextEvidenceId('decomposition');
    this.mesh.addEdge('knowledge', `input:${input}`, primitive.id, 'contains', { evidenceId, position, inputLength: input.length });
    if (position > 0) {
      this.mesh.addEdge('temporal', `input:${input}:pos${position - 1}`, `input:${input}:pos${position}`, 'precedes', { evidenceId });
    }
    return evidenceId;
  }

  // Record that operator composed operands into result.
  recordComposition(operatorId, operands, result, context = {}) {
    const evidenceId = this._nextEvidenceId('composition');
    for (const op of operands) {
      const opId = typeof op === 'string' ? op : op.id;
      this.mesh.addEdge('dependency', result.id || result, opId, 'depends_on', { evidenceId, operator: operatorId });
    }
    this.mesh.addEdge('causal', operatorId, result.id || result, 'produces', { evidenceId, operandCount: operands.length });
    this.mesh.addEdge('knowledge', result.id || result, `operator:${operatorId}`, 'generated_by', { evidenceId });
    return evidenceId;
  }

  // Record state activation with continuous value.
  recordActivation(stateId, activation, previousActivation, context = {}) {
    if (typeof activation !== 'number' || Number.isNaN(activation)) {
      throw new TypeError(`recordActivation requires a numeric activation (got ${JSON.stringify(activation)})`); // F2
    }
    const evidenceId = this._nextEvidenceId('activation');
    this.mesh.addEdge('phase', stateId, `activation:${activation.toFixed(3)}`, 'has_phase', { evidenceId, previous: previousActivation });
    const t1 = context.seq ?? ++this._seq; // F1: was Date.now() labels
    this.mesh.addEdge('temporal', `${stateId}:t${t1 - 1}`, `${stateId}:t${t1}`, 'activates_to', { evidenceId, from: previousActivation, to: activation });
    return evidenceId;
  }

  // Record cross-scale relationship: operator at scale1 also at scale2.
  recordCrossScale(operatorId, scale1, scale2, success, context = {}) {
    const evidenceId = this._nextEvidenceId('cross-scale');
    this.mesh.addEdge('knowledge', `operator:${operatorId}:scale:${scale1}`, `operator:${operatorId}:scale:${scale2}`,
      success ? 'transfers_to' : 'fails_at', { evidenceId, operator: operatorId, success });
    return evidenceId;
  }

  // Record mesh membership.
  recordMeshMembership(stateId, meshType, meshId, context = {}) {
    const evidenceId = this._nextEvidenceId('mesh');
    this.mesh.addEdge('knowledge', stateId, `mesh:${meshType}:${meshId}`, 'belongs_to', { evidenceId, meshType });
    return evidenceId;
  }

  // Neighborhood summary across all five projections (in+out via mesh neighbors).
  neighborhoodSummary(stateId) {
    const out = {};
    for (const projection of ['knowledge', 'causal', 'phase', 'temporal', 'dependency']) {
      const edges = this.mesh.neighbors(stateId, projection);
      out[projection] = edges.map((e) => e.to);
    }
    return out;
  }

  metrics() {
    return this.mesh.metrics().projections;
  }

  _nextEvidenceId(kind) {
    return `evidence:${kind}:${++this._edgeCounter}`;
  }
}

/**
 * StateMesh: one of the five simultaneous meshes a state can belong to
 * (spec §10). Propagates QUALIFIED state packets, not full memory copies.
 * (Donor: phase2_orig/src/graph/mesh.js; F1 seq fix.)
 */
export class StateMesh {
  constructor(name, meshType) {
    this.name = name;
    this.meshType = meshType; // local | personal | value | scale | group
    this.members = new Map(); // stateId -> {stateId, activation, qualifiers, seq}
    this.packets = []; // propagated packets
    this._seq = 0; // F1
  }

  join(stateId, qualifiers = {}, activation = 1.0) {
    this.members.set(stateId, { stateId, activation, qualifiers: { ...qualifiers }, seq: ++this._seq });
    return this;
  }

  leave(stateId) {
    this.members.delete(stateId);
    return this;
  }

  // Propagate a qualified packet to all members except the sender (optionally
  // qualifier-filtered). Returns the delivered qualified packets.
  propagate(fromStateId, packet, qualifierFilter = null) {
    const sender = this.members.get(fromStateId);
    if (!sender) return [];
    const recipients = [];
    for (const [stateId, member] of this.members) {
      if (stateId === fromStateId) continue;
      if (qualifierFilter && !qualifierFilter(member.qualifiers)) continue;
      const qualifiedPacket = {
        ...packet,
        _mesh: this.name,
        _meshType: this.meshType,
        _sender: fromStateId,
        _recipient: stateId,
        _senderActivation: sender.activation,
        _seq: ++this._seq, // F1: was _timestamp: Date.now()
      };
      this.packets.push(qualifiedPacket);
      recipients.push(qualifiedPacket);
    }
    return recipients;
  }

  filter(predicate) {
    return [...this.members.values()].filter((m) => predicate(m.qualifiers));
  }

  toJSON() {
    return {
      name: this.name,
      meshType: this.meshType,
      members: [...this.members.values()],
      packetCount: this.packets.length,
    };
  }
}

export class MeshRegistry {
  constructor() {
    this.meshes = new Map();
  }

  create(name, meshType) {
    const mesh = new StateMesh(name, meshType);
    this.meshes.set(name, mesh);
    return mesh;
  }

  get(name) {
    return this.meshes.get(name) || null;
  }

  byType(meshType) {
    return [...this.meshes.values()].filter((m) => m.meshType === meshType);
  }

  memberships(stateId) {
    return [...this.meshes.values()].filter((m) => m.members.has(stateId));
  }

  toJSON() {
    return [...this.meshes.values()].map((m) => m.toJSON());
  }
}

export const GRAPH_TRACE_PROVENANCE = Object.freeze({
  source: 'pure-synthia-phase2.zip/src/graph/{topology,mesh}.js (ORIGINAL pre-repair variants)',
  adapter: 'GraphTopologyBuilder -> GraphTraceBuilder over AutomataMesh projections (donor Graph/GraphProjectionSet NOT ported — duplicate of src/mesh/mesh.js capability)',
  stateMesh: 'SOURCE_STATEMENT (multi-scale mesh, qualifier-filtered qualified packets, spec §10)',
  f1: 'Date.now() -> per-instance seq counters (join/propagate/recordActivation temporal labels)',
  f2: 'recordActivation validates numeric activation (donor crashed via toFixed on non-numbers)',
});

export default GraphTraceBuilder;
