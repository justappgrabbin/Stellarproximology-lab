import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AppendOnlyStateStore } from '../src/state-store.mjs';

test('state store writes immutable versioned snapshots instead of overwriting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stellar-state-'));
  const store = new AppendOnlyStateStore(dir);
  const a = store.commit({ step: 1 });
  const b = store.commit({ step: 2 });
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(store.latest().state.step, 2);
  assert.equal(readdirSync(join(dir, 'snapshots')).length, 2);
});
