import test from 'node:test';
import assert from 'node:assert/strict';
import { EmbodiedSystemRuntime } from '../src/system-runtime.mjs';

test('complete runtime refuses to boot without real local model artifacts', () => {
  assert.throws(
    () => new EmbodiedSystemRuntime({ modelPortsById: new Map() }),
    /non-empty Map of verified local model ports/,
  );
});
