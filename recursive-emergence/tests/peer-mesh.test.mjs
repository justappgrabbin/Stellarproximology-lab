import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerMeshBridge } from '../src/peer-mesh.mjs';

test('peer mesh bridge sends and ingests learning capsules through a custom transport', () => {
  const received = [];
  const runtime = {
    exportMeshCapsule: ({ peerNodeId }) => ({ schema: 'x', peerNodeId, witness: 'w' }),
    ingestMeshCapsule: (capsule) => {
      received.push(capsule);
      return { accepted: true };
    },
  };
  const bridge = new PeerMeshBridge({ runtime, peerId: 'local', channel: 'test-no-broadcast' });
  bridge.close();
  const sent = [];
  const transport = { send: (m) => sent.push(m), close() {} };
  bridge.attachTransport(transport);
  bridge.publishLearning();
  assert.ok(sent.some((m) => m.type === 'learning-capsule'));
  const result = bridge.receive({ type: 'learning-capsule', peerId: 'remote', capsule: { witness: 'x' } });
  assert.equal(result.accepted, true);
  assert.equal(received.length, 1);
  bridge.close();
});
