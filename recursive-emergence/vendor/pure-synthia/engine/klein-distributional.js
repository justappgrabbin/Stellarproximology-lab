// Pure Synthia Automata — engine: Klein distributional lexicon.
// Ported from Synthia-OS-v2.0.0-COHERENT/systems/klein/klein-full-toolkit.js
// (DiseMinerModule.observe/infer/computeOverlap, verbatim formulas).
//
// SPOT-CHECK VERDICT for klein-full-toolkit (798 lines): overlap vs unique.
//   OVERLAP (not ported): MessySubstrate's symbol store duplicates
//     src/state-space/state.js + registry.js roles; KleinEngine.process is an
//     orchestrator with Date.now() ids; KleinMeshRuntime/AutoLing have repaired
//     variants already surveyed.
//   UNIQUE (ported here): the distributional vocabulary layer — per-token
//     context histograms with overlap-based synonym/related inference
//     (donor thresholds 0.7/0.3 verbatim). No equivalent exists in our tree
//     (scale/parsers.js tokenizes; nothing accumulates distributional meaning).
//   NOT PORTED (documented, not silently dropped): the narrative heuristic
//     modules (AutoNovel/ProppLeviStrauss/AnalogyMysticism/HistoricalChange/
//     Creativity, ~250 lines) are template-driven text generators with no
//     verifiable capability claim and several Date.now()/assumed-messy-shape
//     couplings; recorded here so a future workstream can port them with
//     seeded ids if wanted.
//
// Deterministic: counter ids, insertion-ordered iteration, no wall-clock.

export class DistributionalLexicon {
  constructor({ synonymThreshold = 0.7, relatedThreshold = 0.3 } = {}) {
    this.vocabulary = new Map(); // token -> { contexts: Map(symbolId -> count), features: bool[256] }
    this.synonymThreshold = synonymThreshold;   // donor DiseMinerModule thresholds
    this.relatedThreshold = relatedThreshold;
  }

  /** Record token occurrences from a symbol's text content (donor observe loop). */
  observe(symbolId, content) {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const tokens = text.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    for (const token of tokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, { contexts: new Map(), features: new Array(256).fill(false) });
      }
      const entry = this.vocabulary.get(token);
      entry.contexts.set(symbolId, (entry.contexts.get(symbolId) || 0) + 1);
    }
    return tokens.length;
  }

  /** Donor computeOverlap: min-count intersection over union of context keys. */
  computeOverlap(a, b) {
    let intersection = 0;
    const union = new Set([...a.keys(), ...b.keys()]).size;
    for (const [key, count] of a) {
      if (b.has(key)) intersection += Math.min(count, b.get(key));
    }
    return union > 0 ? intersection / union : 0;
  }

  /** Donor infer: synonyms at >0.7 overlap, related at >0.3. */
  infer(word) {
    const entry = this.vocabulary.get(String(word).toLowerCase());
    if (!entry) return { synonyms: [], related: [] };
    const synonyms = [];
    const related = [];
    for (const [otherWord, otherEntry] of this.vocabulary) {
      if (otherWord === String(word).toLowerCase()) continue;
      const overlap = this.computeOverlap(entry.contexts, otherEntry.contexts);
      if (overlap > this.synonymThreshold) synonyms.push(otherWord);
      else if (overlap > this.relatedThreshold) related.push(otherWord);
    }
    return { synonyms, related };
  }

  get size() { return this.vocabulary.size; }
}

export const KLEIN_DISTRIBUTIONAL_PROVENANCE = Object.freeze({
  source: 'Synthia-OS-v2.0.0-COHERENT/systems/klein/klein-full-toolkit.js DiseMinerModule',
  semantics: 'SOURCE_STATEMENT (observe loop, min-count overlap, 0.7/0.3 thresholds verbatim)',
  remainder: 'AutoNovel/ProppLeviStrauss/AnalogyMysticism/HistoricalChange/Creativity/MessySubstrate/KleinEngine documented-not-ported (see module header)',
});

export default DistributionalLexicon;
