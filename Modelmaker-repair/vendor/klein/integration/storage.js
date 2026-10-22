export class MemoryRecordStore {
  constructor(seed = []) { this.records = new Map(seed.map((r) => [r.identity, structuredClone(r)])); }
  async get(identity) { const value = this.records.get(identity); return value ? structuredClone(value) : null; }
  async put(record) { this.records.set(record.identity, structuredClone(record)); return structuredClone(record); }
  async list() { return [...this.records.values()].map((r) => structuredClone(r)); }
}

export class LocalStorageRecordStore {
  constructor({ storage = globalThis.localStorage, prefix = 'synthia.canonical.' } = {}) {
    if (!storage) throw new Error('LocalStorageRecordStore requires a Storage-compatible object');
    this.storage = storage;
    this.prefix = prefix;
  }
  async get(identity) {
    const raw = this.storage.getItem(this.prefix + identity);
    return raw ? JSON.parse(raw) : null;
  }
  async put(record) {
    this.storage.setItem(this.prefix + record.identity, JSON.stringify(record));
    return structuredClone(record);
  }
  async list() {
    const out = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix)) out.push(JSON.parse(this.storage.getItem(key)));
    }
    return out;
  }
}

