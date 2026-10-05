import { sha256 } from './hash.mjs';

function tokenValue(token) {
  if (token == null) return '';
  if (typeof token === 'string') return token;
  return String(token.value ?? token.char ?? token.id ?? '');
}

export class SwarmEmitter {
  constructor({ intake, trace, mesh, lexicon = null, maxPiecesPerAction = 96 } = {}) {
    if (!intake || !trace || !mesh) throw new TypeError('SwarmEmitter requires intake, trace, and mesh');
    this.intake = intake;
    this.trace = trace;
    this.mesh = mesh;
    this.lexicon = lexicon;
    this.maxPiecesPerAction = Math.max(1, Number(maxPiecesPerAction) || 96);
  }

  release(action) {
    const addressed = this.intake.intake(action.text, {
      source: action.carrierId,
      originDimension: action.dimension,
      modelFingerprint: action.modelFingerprint,
      carrierGate: action.carrierGate,
    });
    this.lexicon?.observe(action.id, action.text);

    const atoms = [
      ...(addressed.P?.tokens || []).map((value, index) => ({ kind: 'token', index, value: tokenValue(value) })),
      ...(addressed.P?.letters || []).map((value, index) => ({ kind: 'letter', index, value: tokenValue(value) })),
    ].filter((x) => x.value).slice(0, this.maxPiecesPerAction);

    if (!atoms.length) throw new Error(`${action.id}: action produced no swarm primitives`);

    const pieces = atoms.map((atom, ordinal) => {
      const id = `swarm:${action.id}:${ordinal}:${sha256({
        value: atom.value,
        kind: atom.kind,
        ordinal,
      }).slice(0, 12)}`;
      return Object.freeze({
        schema: 'stellar.swarm.piece.v1',
        id,
        actionId: action.id,
        carrierId: action.carrierId,
        carrierGate: action.carrierGate,
        dimension: action.dimension,
        modelId: action.modelId,
        modelFingerprint: action.modelFingerprint,
        primitiveKind: atom.kind,
        primitiveIndex: atom.index,
        ordinal,
        value: atom.value,
        address: Object.freeze({ ...addressed.address }),
        fractalPath: Object.freeze({
          originHexagram: action.carrierGate,
          gate: addressed.address.gate,
          line: addressed.address.line,
          color: addressed.address.color,
          tone: addressed.address.tone,
          base: addressed.address.base,
          primitiveKind: atom.kind,
          primitiveIndex: atom.index,
        }),
        derivationId: addressed.derivationId,
      });
    });

    for (let i = 0; i < pieces.length; i += 1) {
      this.trace.recordDecomposition(action.id, pieces[i], i, { carrierId: action.carrierId });
      this.mesh.addEdge('knowledge', action.id, pieces[i].id, 'releases', {
        carrierId: action.carrierId,
        dimension: action.dimension,
        derivationId: addressed.derivationId,
      });
    }

    const body = {
      schema: 'stellar.swarm.release.v1',
      actionId: action.id,
      carrierId: action.carrierId,
      modelFingerprint: action.modelFingerprint,
      derivationId: addressed.derivationId,
      address: addressed.address,
      pieceIds: pieces.map((x) => x.id),
    };

    return Object.freeze({
      ...body,
      addressed,
      pieces: Object.freeze(pieces),
      witness: sha256(body),
    });
  }
}
