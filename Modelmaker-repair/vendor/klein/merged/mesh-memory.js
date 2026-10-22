// Pure Synthia Automata — merged from Synthia_Progressive_Upgrade_v0_6/runtime/AnticipatoryMeshMemory.ts (public/private address split; deterministic local port, no transport provider)

/** Keys that must never cross the public memory boundary. */
export const FORBIDDEN_PRIVATE_KEYS = Object.freeze([
  'degree', 'minute', 'second', 'arcSecond', 'arc', 'zodiac', 'house',
  'privateCoordinates', 'conversation', 'document', 'rawText', 'userId', 'sessionId',
]);

const FORBIDDEN = new Set(FORBIDDEN_PRIVATE_KEYS);
const int = (v, min, max) => Math.max(min, Math.min(max, Math.floor(Number(v) || min)));

/**
 * The public form of a canonical address: ONLY Gate/Line/Color/Tone/Base may
 * cross the mesh boundary. Degree/Minute/Second/ArcSecond/Zodiac/House stay
 * private and are stripped here.
 */
export function publicAddress(addr = {}) {
  return {
    gate: int(addr.gate, 1, 64),
    line: int(addr.line, 1, 6),
    color: int(addr.color, 1, 6),
    tone: int(addr.tone, 1, 6),
    base: int(addr.base, 1, 5),
  };
}

/** Deterministic 8-hex-char hash (FNV-1a 32-bit) for precedent ids. */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Recursively strip forbidden private keys and non-JSON values. */
function sanitize(value) {
  if (value === null || typeof value !== 'object') {
    return ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN.has(k)) continue;
    out[k] = sanitize(v);
  }
  return out;
}

const addressKey = a => `G${a.gate}.L${a.line}.C${a.color}.T${a.tone}.B${a.base}`;

/**
 * Anticipatory memory with a hard public/private split. Everything stored
 * under observe()/contribute() is sanitized before it can be recalled;
 * recall() only ever returns the public form. Local and deterministic —
 * no mesh transport, no clocks.
 */
export class AnticipatoryMemory {
  constructor() {
    this.store = new Map(); // precedentId -> sanitized precedent
    this.byAddress = new Map(); // addressKey -> Set<precedentId>
    this.counter = 0;
  }

  #index(precedent) {
    const key = addressKey(precedent.address);
    if (!this.byAddress.has(key)) this.byAddress.set(key, new Set());
    this.byAddress.get(key).add(precedent.precedentId);
    this.store.set(precedent.precedentId, precedent);
    return precedent;
  }

  /**
   * Record a precedent observed at a full (possibly private) address.
   * Only the public address + sanitized precedent are retained.
   */
  observe(addr, precedent = {}) {
    this.counter += 1;
    const address = publicAddress(addr);
    const clean = sanitize(precedent) || {};
    const id = `precedent_${hash32(addressKey(address) + ':' + JSON.stringify(clean) + ':' + this.counter)}`;
    return this.#index({
      precedentId: id,
      address,
      data: clean,
      evidenceCount: Math.max(1, Math.floor(Number(clean.evidenceCount) || 1)),
      confidence: Math.max(0, Math.min(1, Number(clean.confidence) || 0.5)),
    });
  }

  /**
   * Local recall by public address. Accepts a full address (it is reduced to
   * its public form first) or an already-public one. Returns sanitized
   * precedents, most-confident first. Never returns private coordinates.
   */
  recall(publicAddr) {
    const key = addressKey(publicAddress(publicAddr));
    const ids = this.byAddress.get(key);
    if (!ids) return [];
    return [...ids]
      .map(id => this.store.get(id))
      .filter(Boolean)
      .sort((a, b) => (b.confidence * Math.log2(b.evidenceCount + 1)) - (a.confidence * Math.log2(a.evidenceCount + 1))
        || (a.precedentId < b.precedentId ? -1 : 1))
      .map(p => JSON.parse(JSON.stringify(p)));
  }

  /**
   * Contribute local knowledge to the shared form: returns the sanitized
   * public precedent (and indexes it locally). This is the ONLY shape that
   * may be published to a mesh — private coordinates and raw content are gone.
   */
  contribute(addr, data = {}) {
    const observed = this.observe(addr, data);
    return JSON.parse(JSON.stringify(observed));
  }

  snapshot() {
    return {
      precedents: [...this.store.values()].map(p => JSON.parse(JSON.stringify(p))),
      addresses: [...this.byAddress.keys()].sort(),
    };
  }
}

export default AnticipatoryMemory;

