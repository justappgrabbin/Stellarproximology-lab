import test from 'node:test';
import assert from 'node:assert/strict';

import { GrowthLedger } from '../src/growth-ledger.mjs';
import { SurvivalPool } from '../src/fitness-pool.mjs';
import { RecursiveEmergenceRuntime } from '../src/kernel.mjs';

test('growth ledger is append-only and self-verifying', () => {
  const ledger = new GrowthLedger();
  ledger.append('a', { x: 1 });
  ledger.append('b', { x: 2 });
  assert.equal(ledger.verify().ok, true);
  const broken = ledger.toJSON().entries.map((x) => ({ ...x }));
  broken[1].payload = { x: 999 };
  assert.throws(() => new GrowthLedger(broken));
});

test('survival pool explores an untried local model before exploiting', () => {
  const pool = new SurvivalPool('Movement');
  const a = { id: 'a', dimension: 'Movement' };
  const b = { id: 'b', dimension: 'Movement' };
  pool.register(a);
  pool.register(b);
  assert.equal(pool.choose().id, 'a');
  pool.observe('a', 1);
  assert.equal(pool.choose().id, 'b');
});

test('arrival refuses to fabricate missing dimensional models', async () => {
  const runtime = new RecursiveEmergenceRuntime({ modelPorts: [] });
  await assert.rejects(
    runtime.grow({ generations: 1 }),
    /ARRIVAL_BLOCKED: no real local Modelmaker model registered/,
  );
});
