function makePeerId() {
  return globalThis.crypto?.randomUUID?.() || `peer-${Math.random().toString(36).slice(2)}`;
}

export class PeerMeshBridge {
  constructor({ runtime, peerId = makePeerId(), channel = 'stellar-recursive-emergence' } = {}) {
    if (!runtime) throw new TypeError('PeerMeshBridge requires an EmbodiedSystemRuntime');
    this.runtime = runtime;
    this.peerId = peerId;
    this.channelName = channel;
    this.peers = new Map();
    this.transports = new Set();
    if (typeof BroadcastChannel !== 'undefined') this.attachBroadcastChannel(channel);
  }

  capabilities() {
    return ['recursive-emergence', 'swarm-capsules', 'model-fitness-gossip', 'local-first'];
  }

  advertise() {
    return {
      type: 'peer-advertisement',
      peerId: this.peerId,
      capabilities: this.capabilities(),
    };
  }

  attachBroadcastChannel(name = this.channelName) {
    const bc = new BroadcastChannel(name);
    bc.onmessage = (event) => this.receive(event.data, { transport: 'broadcast' });
    this.transports.add(bc);
    bc.postMessage(this.advertise());
    return bc;
  }

  attachTransport(transport) {
    if (!transport || typeof transport.send !== 'function') throw new Error('transport.send required');
    this.transports.add(transport);
    transport.onmessage = (message) => this.receive(message?.data ?? message, { transport: 'custom' });
    try { transport.send(this.advertise()); } catch {}
    return transport;
  }

  send(message) {
    for (const transport of this.transports) {
      try {
        if (typeof transport.postMessage === 'function') transport.postMessage(message);
        else transport.send(message);
      } catch {}
    }
  }

  publishLearning() {
    const capsule = this.runtime.exportMeshCapsule({ peerNodeId: this.peerId });
    this.send({ type: 'learning-capsule', peerId: this.peerId, capsule });
    return capsule;
  }

  receive(message, meta = {}) {
    if (!message || message.peerId === this.peerId) return null;
    if (message.type === 'peer-advertisement') {
      this.peers.set(message.peerId, {
        peerId: message.peerId,
        capabilities: message.capabilities || [],
        transport: meta.transport || 'unknown',
      });
      return { type: 'peer-advertisement', peerId: message.peerId };
    }
    if (message.type === 'learning-capsule' && message.capsule) {
      const result = this.runtime.ingestMeshCapsule(message.capsule);
      if (result.accepted) {
        this.peers.set(message.peerId, {
          ...(this.peers.get(message.peerId) || { peerId: message.peerId }),
          transport: meta.transport || 'unknown',
          lastWitness: message.capsule.witness,
        });
      }
      return result;
    }
    return null;
  }

  close() {
    for (const transport of this.transports) {
      try { transport.close?.(); } catch {}
    }
    this.transports.clear();
  }
}
