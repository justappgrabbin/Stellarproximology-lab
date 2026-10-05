import { sha256, canonicalJson } from './hash.mjs';

export class GrowthLedger {
  constructor(entries = []) {
    this.entries = [];
    for (const entry of entries) this._appendExisting(entry);
  }

  append(kind, payload) {
    const seq = this.entries.length + 1;
    const previous = this.entries.at(-1)?.hash || 'GENESIS';
    const body = Object.freeze({ seq, kind, previous, payload });
    const hash = sha256(body);
    const entry = Object.freeze({ ...body, hash });
    this.entries.push(entry);
    return entry;
  }

  _appendExisting(entry) {
    this.entries.push(Object.freeze({ ...entry }));
    const check = this.verify();
    if (!check.ok) throw new Error(`invalid imported growth ledger at entry ${check.index}`);
  }

  verify() {
    let previous = 'GENESIS';
    for (let i = 0; i < this.entries.length; i += 1) {
      const entry = this.entries[i];
      const body = { seq: i + 1, kind: entry.kind, previous, payload: entry.payload };
      const expected = sha256(body);
      if (entry.seq !== i + 1 || entry.previous !== previous || entry.hash !== expected) {
        return { ok: false, index: i, expected, actual: entry.hash };
      }
      previous = entry.hash;
    }
    return { ok: true, witness: previous, entries: this.entries.length };
  }

  witness() {
    return this.entries.at(-1)?.hash || sha256('GENESIS');
  }

  toJSON() {
    return JSON.parse(canonicalJson({ entries: this.entries, witness: this.witness() }));
  }
}
