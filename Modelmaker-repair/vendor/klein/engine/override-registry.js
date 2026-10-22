// Pure Synthia Automata — engine: OverrideRegistry (layered knowledge with provenance)
// Ported from Synthia_OS_Canonical_Integration_Handoff/02_safe_namespaced_additions/
// self_correcting_v1/src/core/OverrideRegistry.ts (TS -> JS, types stripped, logic kept).
//
// Principle (donor): "Nothing is absolute. Everything has layers." Every value
// carries its layer, provenance, confidence, evidence and version history; reads
// resolve by layer priority and report alternatives instead of silently picking.
//
// Defect fixes applied during the port (documented, behavior-affecting):
//   F1. Date.now() timestamps and uuidv4() evidence ids -> per-registry seq
//       counters (`timestamp` field renamed `seq`; ids `..._vN` / `ev:N`). The
//       donor's wall-clock made exports and ordering non-deterministic.
//   F2. UNKNOWN-layer poisoning: donor unknown() pushed an UNKNOWN-layer entry
//       into the same entry list that get() resolves, and UNKNOWN had the
//       HIGHEST layer priority — so recording one unknown permanently shadowed
//       every real value for that key. Fixed: UNKNOWN-layer entries never win
//       resolution; they are tracked in the unknown queue and only surface as
//       the isUnknown placeholder when no active known-layer entry exists.
//   F3. OverrideType was recorded but NEVER applied (donor get() always
//       returned the winner's raw value). applyOverride() now implements
//       REPLACE/MERGE/PREPEND/APPEND/MASK composition against the next-lower
//       priority value; resolution reports `value` (composed) plus `rawValue`.
//   F4. Node 'events'/'uuid' imports removed (browser file://-safe, zero deps);
//       events via a tiny synchronous listener list.
//   F5. Donor singleton export removed — export the class + factory only.
//
// Donor stub defaults (loadStubDefaults): the donor preloaded 64 codon->DNA /
// amino-acid / center / circuit "system truths". The DNA/amino-acid tables are
// the standard genetic code but indexed by King Wen number (an ARBITRARY
// correspondence), and the center/circuit tables are coarse band guesses.
// They are ported verbatim, tagged CONTROL_ONLY, and NOT auto-loaded.

const SOURCE = 'handoff/02_safe_namespaced_additions/self_correcting_v1/src/core/OverrideRegistry.ts';

// ─── OVERRIDE LAYERS (donor enum, verbatim) ───
export const KNOWLEDGE_LAYER = Object.freeze({
  DEFAULT: 'default',     // System built-in
  CANON: 'canon',         // Official/verified sources
  COMMUNITY: 'community', // Crowd-sourced
  USER: 'user',           // Personal overrides
  COMPUTED: 'computed',   // Derived from evidence
  INFERRED: 'inferred',   // AI/algorithm guessed
  UNKNOWN: 'unknown',     // Placeholder for new things
});

export const OVERRIDE_TYPE = Object.freeze({
  REPLACE: 'replace', // Completely replace default
  MERGE: 'merge',     // Deep merge with default
  PREPEND: 'prepend', // Add before default
  APPEND: 'append',   // Add after default
  MASK: 'mask',       // Hide default, show this
});

export const EVIDENCE_TYPE = Object.freeze({
  TEXT: 'text', QUOTE: 'quote', CALCULATION: 'calculation', OBSERVATION: 'observation',
  EXPERIMENT: 'experiment', TRADITION: 'tradition', INTUITION: 'intuition', CONSENSUS: 'consensus',
});

/**
 * Donor layer priority (SOURCE_STATEMENT, OverrideRegistry.ts layerPriority):
 * lower index = higher priority. UNKNOWN is excluded (defect fix F2) and only
 * acts as the explicit placeholder layer. Note the donor ranks INFERRED and
 * COMPUTED above USER/CANON — kept verbatim, not "corrected".
 */
export const LAYER_PRIORITY = Object.freeze([
  KNOWLEDGE_LAYER.INFERRED,
  KNOWLEDGE_LAYER.COMPUTED,
  KNOWLEDGE_LAYER.COMMUNITY,
  KNOWLEDGE_LAYER.USER,
  KNOWLEDGE_LAYER.CANON,
  KNOWLEDGE_LAYER.DEFAULT,
]);

/**
 * Defect fix F3: compose an override value with the next-lower-priority value
 * according to its override type. REPLACE/MASK ignore the base (MASK is a
 * presentation hint — the composed value is the override, and the resolved
 * record carries masked: true). MERGE deep-merges plain objects (override keys
 * win) and concatenates arrays [base..., override...]; PREPEND/APPEND act on
 * arrays and strings; on non-composable primitives they degrade to REPLACE.
 */
export function applyOverride(overrideValue, baseValue, overrideType) {
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  switch (overrideType) {
    case OVERRIDE_TYPE.MERGE:
      if (isObj(baseValue) && isObj(overrideValue)) return { ...baseValue, ...overrideValue };
      if (Array.isArray(baseValue) && Array.isArray(overrideValue)) return [...baseValue, ...overrideValue];
      return overrideValue;
    case OVERRIDE_TYPE.PREPEND:
      if (Array.isArray(baseValue) && Array.isArray(overrideValue)) return [...overrideValue, ...baseValue];
      if (typeof baseValue === 'string' && typeof overrideValue === 'string') return overrideValue + baseValue;
      return overrideValue;
    case OVERRIDE_TYPE.APPEND:
      if (Array.isArray(baseValue) && Array.isArray(overrideValue)) return [...baseValue, ...overrideValue];
      if (typeof baseValue === 'string' && typeof overrideValue === 'string') return baseValue + overrideValue;
      return overrideValue;
    case OVERRIDE_TYPE.MASK:
    case OVERRIDE_TYPE.REPLACE:
    default:
      return overrideValue;
  }
}

/** Verbatim donor stub tables (CONTROL_ONLY — see header note). Not auto-loaded. */
export const DONOR_STUB_DEFAULTS = Object.freeze({
  codons: Object.freeze('TTT TTC TTA TTG TCT TCC TCA TCG TAT TAC TAA TAG TGT TGC TGA TGG CTT CTC CTA CTG CCT CCC CCA CCG CAT CAC CAA CAG CGT CGC CGA CGG ATT ATC ATA ATG ACT ACC ACA ACG AAT AAC AAA AAG AGT AGC AGA AGG GTT GTC GTA GTG GCT GCC GCA GCG GAT GAC GAA GAG GGT GGC GGA GGG'.split(' ')),
  aminoAcids: Object.freeze('Phe Phe Leu Leu Ser Ser Ser Ser Tyr Tyr Stop Stop Cys Cys Stop Trp Leu Leu Leu Leu Pro Pro Pro Pro His His Gln Gln Arg Arg Arg Arg Ile Ile Ile Met Thr Thr Thr Thr Asn Asn Lys Lys Ser Ser Arg Arg Val Val Val Val Ala Ala Ala Ala Asp Asp Glu Glu Gly Gly Gly Gly'.split(' ')),
});

export class OverrideRegistry {
  constructor() {
    this.entries = new Map();   // key -> KnowledgeEntry[]
    this.index = new Map();     // domain -> Set(key)
    this.unknownQueue = [];     // UNKNOWN-layer placeholder entries
    this._seq = 0;              // deterministic counter (F1: was Date.now()/uuid)
    this._listeners = new Map();// event -> [fn] (F4: was EventEmitter)
  }

  // ─── events (synchronous, deterministic order) ───
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this._listeners.get(event) || []) fn(payload);
  }

  _nextSeq() { return ++this._seq; }

  _evidenceId() { return `ev:${++this._seq}`; }

  // ─── CORE API: GET ───
  get(key, preferredLayer = null) {
    const entries = this.entries.get(key);
    const active = (entries || []).filter((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN);
    if (active.length === 0) return this.createUnknownValue(key);

    let winner = null;
    if (preferredLayer) winner = active.find((e) => e.layer === preferredLayer) || null;
    if (!winner) {
      const sorted = [...active].sort((a, b) => {
        const d = LAYER_PRIORITY.indexOf(a.layer) - LAYER_PRIORITY.indexOf(b.layer);
        return d !== 0 ? d : a.seq - b.seq; // stable, deterministic tie-break (F1)
      });
      winner = sorted[0];
    }
    return this.resolveEntry(winner, active);
  }

  // ─── CORE API: SET (override) ───
  set(key, value, layer = KNOWLEDGE_LAYER.USER, options = {}) {
    const {
      overrideType = OVERRIDE_TYPE.REPLACE,
      source = 'user',
      confidence = 0.8,
      evidence = [],
      tags = [],
      domain = null,
      author = null,
    } = options;

    const existing = this.entries.get(key) || [];
    const layerExisting = existing.find((e) => e.layer === layer && e.active);
    const version = layerExisting ? layerExisting.version + 1 : 1;
    const seq = this._nextSeq();

    const entry = {
      id: `${layer}_${key}_v${version}`,
      key,
      layer,
      value,
      overrideType,
      source,
      author,
      seq, // F1: deterministic; was timestamp: Date.now()
      confidence,
      evidence: evidence.length > 0 ? evidence : [{
        id: this._evidenceId(),
        type: EVIDENCE_TYPE.INTUITION,
        source,
        content: `User override: ${JSON.stringify(value)}`,
        weight: confidence,
        seq: this._seq,
        verified: false,
      }],
      version,
      previousVersions: layerExisting ? [...layerExisting.previousVersions, layerExisting.id] : [],
      active: true,
      deprecated: false,
      deprecatedBy: null,
      tags: [...tags, layer],
      domain: domain || this.inferDomain(key),
      language: 'en',
    };

    if (layerExisting) {
      layerExisting.active = false;
      layerExisting.deprecated = true;
      layerExisting.deprecatedBy = entry.id;
    }

    this.addEntry(entry);
    this.emit('override', { key, layer, previousValue: layerExisting?.value ?? null, newValue: value, confidence });
    return entry;
  }

  // ─── CORE API: UNKNOWN HANDLING ───
  unknown(key, context = null) {
    const seq = this._nextSeq();
    const entry = {
      id: `unknown_${key}_${seq}`, // F1: was Date.now()
      key,
      layer: KNOWLEDGE_LAYER.UNKNOWN,
      value: null,
      overrideType: OVERRIDE_TYPE.REPLACE,
      source: 'unknown_handler',
      seq,
      confidence: 0,
      evidence: [],
      version: 1,
      previousVersions: [],
      active: true,
      deprecated: false,
      deprecatedBy: null,
      tags: ['unknown', 'placeholder'],
      domain: this.inferDomain(key),
      language: 'unknown',
    };
    this.unknownQueue.push(entry);
    this.addEntry(entry); // stored, but UNKNOWN never wins resolution (F2)
    this.emit('unknownEncountered', { key, context, entry });
    return this.createUnknownValue(key);
  }

  // ─── CORE API: RESOLVE ───
  resolveEntry(winner, allEntries) {
    const known = allEntries.filter((e) => e.layer !== KNOWLEDGE_LAYER.UNKNOWN);
    const ordered = [...known].sort((a, b) => {
      const d = LAYER_PRIORITY.indexOf(a.layer) - LAYER_PRIORITY.indexOf(b.layer);
      return d !== 0 ? d : a.seq - b.seq;
    });
    const winnerIdx = ordered.findIndex((e) => e.id === winner.id);
    // F3: compose against the next-lower-priority value when the override type asks for it.
    const base = winnerIdx >= 0 && winnerIdx < ordered.length - 1 ? ordered[winnerIdx + 1] : null;
    const composed = base && winner.overrideType !== OVERRIDE_TYPE.REPLACE
      ? applyOverride(winner.value, base.value, winner.overrideType)
      : winner.value;

    return {
      value: composed,
      rawValue: winner.value,
      layer: winner.layer,
      confidence: winner.confidence,
      masked: winner.overrideType === OVERRIDE_TYPE.MASK,
      provenance: {
        entries: allEntries.map((e) => ({ layer: e.layer, source: e.source, seq: e.seq, confidence: e.confidence, value: e.value })),
        fullHistory: true,
      },
      alternatives: known.filter((e) => e.id !== winner.id)
        .map((e) => ({ layer: e.layer, value: e.value, confidence: e.confidence, source: e.source })),
      isOverride: winner.layer !== KNOWLEDGE_LAYER.DEFAULT,
      isUnknown: false,
    };
  }

  createUnknownValue(key) {
    return {
      value: null,
      layer: KNOWLEDGE_LAYER.UNKNOWN,
      confidence: 0,
      provenance: { entries: [], fullHistory: false },
      alternatives: [],
      isOverride: false,
      isUnknown: true,
    };
  }

  // ─── CORE API: QUERY / HISTORY / REVISE / DEPRECATE ───
  query(pattern, layer = null) {
    const regex = new RegExp('^' + String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const results = [];
    for (const [key, entries] of this.entries) {
      if (regex.test(key)) {
        results.push(...entries.filter((e) => e.active && !e.deprecated && (layer === null || e.layer === layer)));
      }
    }
    return results;
  }

  history(key) {
    const entries = this.entries.get(key);
    return entries ? [...entries].sort((a, b) => b.seq - a.seq) : []; // F1: seq order
  }

  revise(key, newValue, evidence = [], source = 'revision') {
    const entries = this.entries.get(key);
    const current = entries?.find((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN);
    const newConfidence = this.computeConfidence(evidence);
    if (!current) {
      return this.set(key, newValue, KNOWLEDGE_LAYER.COMPUTED, { source, evidence, confidence: newConfidence });
    }
    if (newConfidence > current.confidence) {
      return this.set(key, newValue, KNOWLEDGE_LAYER.COMPUTED, {
        source, evidence, confidence: newConfidence, overrideType: OVERRIDE_TYPE.REPLACE,
      });
    }
    current.evidence.push(...evidence);
    current.confidence = this.computeConfidence(current.evidence);
    this.emit('revised', { key, entry: current, newConfidence });
    return current;
  }

  deprecate(key, layer, reason = 'deprecated') {
    const entries = this.entries.get(key);
    if (!entries) return false;
    const entry = entries.find((e) => e.layer === layer && e.active);
    if (!entry) return false;
    entry.active = false;
    entry.deprecated = true;
    entry.tags.push('deprecated', reason);
    this.emit('deprecated', { key, layer, reason, entry });
    return true;
  }

  // ─── CORE API: KEYS / DOMAINS / EXPORT / IMPORT ───
  keys(domain = null) {
    if (!domain) return [...this.entries.keys()];
    return [...(this.index.get(domain) || [])];
  }

  domains() { return [...this.index.keys()]; }

  export(layer = null) {
    const result = {};
    for (const [key, entries] of this.entries) {
      const active = entries.filter((e) => e.active && !e.deprecated && e.layer !== KNOWLEDGE_LAYER.UNKNOWN
        && (layer === null || e.layer === layer));
      if (active.length === 0) continue;
      const sorted = [...active].sort((a, b) => {
        const d = LAYER_PRIORITY.indexOf(a.layer) - LAYER_PRIORITY.indexOf(b.layer);
        return d !== 0 ? d : a.seq - b.seq;
      });
      result[key] = {
        value: sorted[0].value, layer: sorted[0].layer,
        confidence: sorted[0].confidence, version: sorted[0].version, seq: sorted[0].seq,
      };
    }
    return result;
  }

  import(data, layer = KNOWLEDGE_LAYER.USER, source = 'import') {
    let count = 0;
    for (const [key, value] of Object.entries(data || {})) {
      if (value !== null && typeof value === 'object' && 'value' in value) {
        this.set(key, value.value, layer, { source, confidence: value.confidence || 0.7, tags: value.tags || [] });
      } else {
        this.set(key, value, layer, { source });
      }
      count++;
    }
    this.emit('imported', { count, layer, source });
    return count;
  }

  // ─── DONOR STUB DEFAULTS (CONTROL_ONLY; opt-in, see header) ───
  loadStubDefaults() {
    for (let i = 1; i <= 64; i++) {
      this.set(`codon.${i}.gate`, i, KNOWLEDGE_LAYER.DEFAULT, { source: 'system', confidence: 1.0, tags: ['stub-default'] });
      this.set(`codon.${i}.dna`, DONOR_STUB_DEFAULTS.codons[i - 1] || 'NNN', KNOWLEDGE_LAYER.DEFAULT, { source: 'system', confidence: 0.1, tags: ['stub-default', 'arbitrary-indexing'] });
      this.set(`codon.${i}.aminoAcid`, DONOR_STUB_DEFAULTS.aminoAcids[i - 1] || 'Unknown', KNOWLEDGE_LAYER.DEFAULT, { source: 'system', confidence: 0.1, tags: ['stub-default', 'arbitrary-indexing'] });
    }
    this.emit('defaultsLoaded', { count: this.entries.size });
  }

  // ─── INTERNALS ───
  addEntry(entry) {
    if (!this.entries.has(entry.key)) this.entries.set(entry.key, []);
    this.entries.get(entry.key).push(entry);
    if (!this.index.has(entry.domain)) this.index.set(entry.domain, new Set());
    this.index.get(entry.domain).add(entry.key);
  }

  inferDomain(key) {
    if (key.startsWith('codon.')) return 'codons';
    if (key.startsWith('gate.')) return 'gates';
    if (key.startsWith('astrology.')) return 'astrology';
    if (key.startsWith('formula.')) return 'formulas';
    if (key.startsWith('circuit.')) return 'circuits';
    if (key.startsWith('center.')) return 'centers';
    if (key.startsWith('hexagram.')) return 'yijing';
    if (key.startsWith('dna.')) return 'genetics';
    return 'general';
  }

  // SOURCE_STATEMENT: donor computeConfidence (verified ratio * 0.6 + weight score * 0.4).
  computeConfidence(evidence = []) {
    if (evidence.length === 0) return 0.5;
    const totalWeight = evidence.reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
    if (totalWeight === 0) return 0.5;
    const verifiedWeight = evidence.filter((e) => e.verified).reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
    const verifiedRatio = verifiedWeight / totalWeight;
    const weightScore = Math.min(totalWeight / 3, 1);
    return verifiedRatio * 0.6 + weightScore * 0.4;
  }

  getUnknownQueue() { return [...this.unknownQueue]; }

  clearUnknownQueue() { this.unknownQueue = []; }

  getStats() {
    let totalEntries = 0, activeEntries = 0, overrideCount = 0, unknownCount = 0;
    const layerCounts = {};
    for (const entries of this.entries.values()) {
      totalEntries += entries.length;
      for (const e of entries) {
        if (e.active && !e.deprecated) activeEntries++;
        if (e.layer !== KNOWLEDGE_LAYER.DEFAULT) overrideCount++;
        if (e.layer === KNOWLEDGE_LAYER.UNKNOWN) unknownCount++;
        layerCounts[e.layer] = (layerCounts[e.layer] || 0) + 1;
      }
    }
    return {
      totalEntries, activeEntries, overrideCount, unknownCount, layerCounts,
      domains: this.domains(), keys: this.keys(),
    };
  }
}

export const OVERRIDE_REGISTRY_PROVENANCE = Object.freeze({
  source: SOURCE,
  layers: 'SOURCE_STATEMENT (donor KnowledgeLayer enum, 7 layers)',
  layerPriority: 'SOURCE_STATEMENT (donor layerPriority; UNKNOWN excluded from resolution — defect fix F2)',
  overrideTypes: 'SOURCE_STATEMENT enum; F3 fix: composition semantics implemented here (donor never applied them)',
  determinism: 'F1 fix: seq counters replace Date.now()/uuidv4',
  stubDefaults: 'CONTROL_ONLY: donor codon/center/circuit defaults are arbitrary-indexing stubs; opt-in via loadStubDefaults()',
});

export function createOverrideRegistry() { return new OverrideRegistry(); }

export default OverrideRegistry;

