import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from './hash.mjs';

export class AppendOnlyStateStore {
  constructor(stateDir = null) {
    this.stateDir = stateDir;
    this.memory = [];
    if (stateDir) mkdirSync(join(stateDir, 'snapshots'), { recursive: true });
  }

  latest() {
    if (!this.stateDir) return this.memory.at(-1) || null;
    const dir = join(this.stateDir, 'snapshots');
    if (!existsSync(dir)) return null;
    const files = readdirSync(dir).filter((x) => /^\d{8}-[0-9a-f]{12}\.json$/.test(x)).sort();
    if (!files.length) return null;
    return JSON.parse(readFileSync(join(dir, files.at(-1)), 'utf8'));
  }

  commit(snapshot) {
    const previous = this.latest()?.witness || null;
    const seq = (this.latest()?.seq || 0) + 1;
    const body = { seq, previous, state: snapshot };
    const witness = sha256(body);
    const record = Object.freeze({ ...body, witness });
    if (!this.stateDir) {
      this.memory.push(record);
      return record;
    }
    const file = `${String(seq).padStart(8, '0')}-${witness.slice(0, 12)}.json`;
    writeFileSync(join(this.stateDir, 'snapshots', file), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    return record;
  }
}
