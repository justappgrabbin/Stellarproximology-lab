import test from 'node:test';
import assert from 'node:assert/strict';

import { AutomataMesh } from '../vendor/pure-synthia/mesh/mesh.js';
import { GraphTraceBuilder } from '../vendor/pure-synthia/experiments/scale/graph-trace.js';
import { EmbodiedField } from '../src/embodied-field.mjs';

function piece(id, carrierId, gate) {
  return Object.freeze({
    id,
    actionId: `action:${carrierId}`,
    carrierId,
    dimension: carrierId,
    modelId: carrierId,
    modelFingerprint: 'a'.repeat(64),
    value: id,
    address: { gate, line: 1, color: 1, tone: 1, base: 1 },
    fractalPath: { gate, line: 1, color: 1, tone: 1, base: 1, primitiveKind: 'token', primitiveIndex: 0 },
  });
}

test('embodied field turns structural contact into shared form and bilateral feedback', () => {
  const mesh = new AutomataMesh();
  const trace = new GraphTraceBuilder(mesh);
  const field = new EmbodiedField({ mesh, trace, ttlSteps: 8 });
  field.ingest([
    { actionId: 'action:Movement', pieces: [piece('p1', 'Movement', 1)] },
    { actionId: 'action:Being', pieces: [piece('p2', 'Being', 1)] },
  ], 1);
  const cycle = field.cycle({ step: 1, ticks: 1, currentCarrierIds: ['Movement', 'Being'] });
  assert.ok(cycle.finalForm);
  assert.ok(cycle.feedback.Movement.contacts > 0);
  assert.ok(cycle.feedback.Being.contacts > 0);
  assert.ok(cycle.feedback.Movement.structures > 0);
  assert.equal(cycle.feedback.Movement.counterparts[0].carrierId, 'Being');
});

test('field state can be exported and hydrated without losing active pieces', () => {
  const mesh = new AutomataMesh();
  const trace = new GraphTraceBuilder(mesh);
  const field = new EmbodiedField({ mesh, trace });
  field.ingest([{ actionId: 'a', pieces: [piece('p1', 'Movement', 1)] }], 1);
  const state = field.exportState();

  const mesh2 = new AutomataMesh();
  const trace2 = new GraphTraceBuilder(mesh2);
  const restored = new EmbodiedField({ mesh: mesh2, trace: trace2 }).hydrate(state);
  assert.equal(restored.summary().activePieces, 1);
});
