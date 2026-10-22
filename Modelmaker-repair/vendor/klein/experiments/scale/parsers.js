// Pure Synthia Automata — experiments/scale: multi-scale tokenizer + simple
// dependency parser. Ported from pure-synthia-pass3.zip src/parsers/tokenizer.js
// + src/parsers/dependency.js (ORIGINAL pre-repair variants; the parser layer
// was dropped by the repaired lineages — our src/grammar/* is a different,
// generative-grammar parser, not a scale tokenizer).
//
// Tokenizer: recursive scale decomposition per spec §5 (features -> graphemes
// -> morphemes -> words -> clauses -> sentences -> paragraphs -> discourse);
// every level is simultaneously a completed object and a primitive.
// Dependency parser: G_D projection (spec §9) over token POS tags.
//
// Both originals were already deterministic (counter ids `token:type:N`, no
// Date.now/Math.random) and are ported verbatim, with one defect fix and one
// examination note:
//   F1. Donor tokenize() dispatched to _tokenizeSentences/_tokenizeWords/
//       _tokenizeGraphemes but NEVER DEFINED them — tokenize(text,'sentence')
//       (and 'word'/'grapheme') crashed with TypeError. Implemented here
//       following the donor's own naming/dispatch intent (sentence ->
//       _tokenizeSentence(text,0); word/grapheme -> arrays of tokens).
//   N1. Tokenizer word scale is labeled "lexical" and morpheme scale
//       "morphemic" (not "word"/"morpheme") — donor quirk kept verbatim;
//       flattenToScale/scalePath match on either scale or type, so
//       flattenToScale(token, 'word') still finds them via type.

export class Token {
  constructor({ id, type, text, children = [], position = 0, scale, metadata = {} }) {
    this.id = id;
    this.type = type;
    this.text = text;
    this.children = Object.freeze([...children]);
    this.position = position;
    this.scale = scale || type;
    this.metadata = Object.freeze({ ...metadata });
    Object.freeze(this);
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      text: this.text,
      children: this.children.map((c) => (typeof c === 'object' ? c.toJSON?.() || c : c)),
      position: this.position,
      scale: this.scale,
      metadata: { ...this.metadata },
    };
  }
}

export class MultiScaleTokenizer {
  constructor(options = {}) {
    this.wordSeparators = options.wordSeparators || /\s+/;
    this.sentenceTerminators = options.sentenceTerminators || /[.!?]+/;
    this.paragraphSeparators = options.paragraphSeparators || /\n\n+/;
    this.morphemePatterns = options.morphemePatterns || [
      { pattern: /(un|re|dis|pre|post|sub|super|inter|trans)(\w+)/, type: 'prefix' },
      { pattern: /(\w+)(ing|ed|er|est|ly|tion|ness|ment|able|ible)/, type: 'suffix' },
      { pattern: /(\w+)(s|es|ies)/, type: 'plural' },
    ];
    this._tokenCounter = 0;
  }

  tokenize(input, targetScale = 'auto') {
    if (typeof input !== 'string') {
      return new Token({ id: this._nextId('raw'), type: 'raw', text: String(input), scale: 'unknown' });
    }
    if (targetScale === 'discourse' || targetScale === 'auto') return this._tokenizeDiscourse(input);
    if (targetScale === 'sentence') return this._tokenizeSentences(input);
    if (targetScale === 'word') return this._tokenizeWords(input);
    if (targetScale === 'grapheme') return this._tokenizeGraphemes(input);
    return this._tokenizeDiscourse(input);
  }

  _tokenizeDiscourse(text) {
    const paragraphs = text.split(this.paragraphSeparators).filter((p) => p.trim());
    const children = paragraphs.map((para, i) => this._tokenizeParagraph(para, i));
    return new Token({
      id: this._nextId('discourse'),
      type: 'discourse',
      text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
      children,
      scale: 'discourse',
      metadata: { paragraphCount: children.length },
    });
  }

  _tokenizeParagraph(text, position) {
    const sentences = this._splitSentences(text);
    const children = sentences.map((sent, i) => this._tokenizeSentence(sent, i));
    return new Token({
      id: this._nextId('paragraph'),
      type: 'paragraph',
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      children,
      position,
      scale: 'paragraph',
      metadata: { sentenceCount: children.length },
    });
  }

  _tokenizeSentence(text, position) {
    const clauses = this._splitClauses(text);
    const children = clauses.map((clause, i) => this._tokenizeClause(clause, i));
    return new Token({
      id: this._nextId('sentence'),
      type: 'sentence',
      text: text.trim(),
      children,
      position,
      scale: 'sentence',
      metadata: { clauseCount: children.length, wordCount: text.split(/\s+/).length },
    });
  }

  _tokenizeClause(text, position) {
    const words = text.trim().split(this.wordSeparators).filter((w) => w.length > 0);
    const children = words.map((word, i) => this._tokenizeWord(word, i));
    return new Token({
      id: this._nextId('clause'),
      type: 'clause',
      text: text.trim(),
      children,
      position,
      scale: 'clause',
      metadata: { wordCount: children.length },
    });
  }

  _tokenizeWord(text, position) {
    const morphemes = this._decomposeMorphemes(text);
    const children = morphemes.map((m, i) => this._tokenizeMorpheme(m, i));
    return new Token({
      id: this._nextId('word'),
      type: 'word',
      text,
      children,
      position,
      scale: 'lexical', // N1: donor quirk kept verbatim
      metadata: { morphemeCount: children.length, length: text.length },
    });
  }

  _tokenizeMorpheme(text, position) {
    const graphemes = text.split('');
    const children = graphemes.map((g, i) => this._tokenizeGrapheme(g, i));
    return new Token({
      id: this._nextId('morpheme'),
      type: 'morpheme',
      text,
      children,
      position,
      scale: 'morphemic', // N1: donor quirk kept verbatim
      metadata: { graphemeCount: children.length },
    });
  }

  _tokenizeGrapheme(text, position) {
    return new Token({
      id: this._nextId('grapheme'),
      type: 'grapheme',
      text,
      children: [],
      position,
      scale: 'grapheme',
      metadata: { charCode: text.charCodeAt(0) },
    });
  }

  _tokenizeSentences(text) {
    return this._tokenizeSentence(text, 0);
  }

  _tokenizeWords(text) {
    const words = text.trim().split(this.wordSeparators).filter((w) => w.length > 0);
    return words.map((w, i) => this._tokenizeWord(w, i));
  }

  _tokenizeGraphemes(text) {
    return text.split('').map((g, i) => this._tokenizeGrapheme(g, i));
  }

  _splitSentences(text) {
    const matches = text.match(/[^.!?]+[.!?]+\s*/g);
    if (!matches) return [text];
    return matches.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  _splitClauses(text) {
    return text.split(/,\s*|\s+;\s*/).filter((p) => p.trim().length > 0);
  }

  _decomposeMorphemes(word) {
    for (const pattern of this.morphemePatterns) {
      const match = word.match(pattern.pattern);
      if (match) {
        const parts = match.slice(1).filter(Boolean);
        if (parts.length > 1) return parts;
      }
    }
    return [word];
  }

  _nextId(type) {
    return `token:${type}:${++this._tokenCounter}`;
  }

  flattenToScale(token, targetScale) {
    const results = [];
    const visit = (node) => {
      if (node.scale === targetScale || node.type === targetScale) {
        results.push(node);
        return;
      }
      for (const child of node.children || []) visit(child);
    };
    visit(token);
    return results;
  }

  scalePath(token) {
    const path = [];
    const visit = (node, depth = 0) => {
      path.push({ type: node.type, scale: node.scale, depth, text: node.text.substring(0, 20) });
      for (const child of node.children || []) visit(child, depth + 1);
    };
    visit(token);
    return path;
  }
}

// ─── dependency parser (G_D projection, spec §9) ───

export class DependencyRelation {
  constructor({ head, dependent, relation, evidence = null }) {
    this.head = head;
    this.dependent = dependent;
    this.relation = relation;
    this.evidence = evidence;
  }

  toJSON() {
    return { head: this.head, dependent: this.dependent, relation: this.relation, evidence: this.evidence };
  }
}

export class DependencyParser {
  constructor() {
    this.posPatterns = {
      DET: /^(the|a|an|this|that|these|those|my|your|his|her|its|our|their)$/i,
      PREP: /^(in|on|at|by|with|from|to|for|of|about|into|through|during|before|after|above|below|between|under)$/i,
      CONJ: /^(and|but|or|nor|for|yet|so|because|although|while|if|unless)$/i,
      AUX: /^(is|am|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must)$/i,
      PRON: /^(i|you|he|she|it|we|they|me|him|her|us|them|myself|yourself|himself|herself|itself|ourselves|themselves)$/i,
    };
  }

  parse(tokens) {
    const relations = [];
    const posTags = tokens.map((t) => this._tagPOS(t));

    let rootIdx = posTags.findIndex((p) => p.pos === 'VERB');
    if (rootIdx === -1) rootIdx = posTags.findIndex((p) => p.pos === 'NOUN');
    if (rootIdx === -1) rootIdx = 0;

    const root = tokens[rootIdx];
    relations.push(new DependencyRelation({ head: 'ROOT', dependent: root.id, relation: 'root' }));

    for (let i = 0; i < rootIdx; i++) {
      if (posTags[i].pos === 'NOUN' || posTags[i].pos === 'PRON') {
        relations.push(new DependencyRelation({ head: root.id, dependent: tokens[i].id, relation: 'nsubj' }));
      }
    }
    for (let i = rootIdx + 1; i < tokens.length; i++) {
      if (posTags[i].pos === 'NOUN' || posTags[i].pos === 'PRON') {
        relations.push(new DependencyRelation({ head: root.id, dependent: tokens[i].id, relation: 'dobj' }));
      }
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      if (posTags[i].pos === 'ADJ' && posTags[i + 1]?.pos === 'NOUN') {
        relations.push(new DependencyRelation({ head: tokens[i + 1].id, dependent: tokens[i].id, relation: 'amod' }));
      }
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      if (posTags[i].pos === 'DET' && (posTags[i + 1]?.pos === 'NOUN' || posTags[i + 1]?.pos === 'ADJ')) {
        relations.push(new DependencyRelation({ head: tokens[i + 1].id, dependent: tokens[i].id, relation: 'det' }));
      }
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      if (posTags[i].pos === 'PREP') {
        let headIdx = i - 1;
        while (headIdx >= 0 && posTags[headIdx].pos === 'DET') headIdx--;
        if (headIdx >= 0) {
          relations.push(new DependencyRelation({ head: tokens[headIdx].id, dependent: tokens[i].id, relation: 'prep' }));
        }
        if (i + 1 < tokens.length) {
          relations.push(new DependencyRelation({ head: tokens[i].id, dependent: tokens[i + 1].id, relation: 'pobj' }));
        }
      }
    }

    return {
      tokens: tokens.map((t, i) => ({ ...t.toJSON(), pos: posTags[i].pos })),
      relations: relations.map((r) => r.toJSON()),
      root: root.id,
    };
  }

  _tagPOS(token) {
    const text = token.text.toLowerCase();
    for (const [pos, pattern] of Object.entries(this.posPatterns)) {
      if (pattern.test(text)) return { text, pos };
    }
    if (/ing$/.test(text)) return { text, pos: 'VERB' };
    if (/ed$/.test(text)) return { text, pos: 'VERB' };
    if (/ly$/.test(text)) return { text, pos: 'ADV' };
    if (/(tion|ness|ment|ity)$/.test(text)) return { text, pos: 'NOUN' };
    if (/(able|ible|ful|less|ous|ive)$/.test(text)) return { text, pos: 'ADJ' };
    if (text.length <= 3) return { text, pos: 'VERB' };
    return { text, pos: 'NOUN' };
  }
}

export const PARSERS_PROVENANCE = Object.freeze({
  source: 'pure-synthia-pass3.zip/src/parsers/{tokenizer,dependency}.js (ORIGINAL pre-repair variants; dropped by repaired lineages)',
  determinism: 'verbatim-deterministic: counter ids token:<type>:N; no wall-clock, no randomness',
  f1: 'donor dispatched to _tokenizeSentences/_tokenizeWords/_tokenizeGraphemes but never defined them (crash on sentence/word/grapheme scales); implemented per dispatch intent',
  n1: 'word scale labeled "lexical", morpheme scale "morphemic" — donor quirk kept; flattenToScale matches type too',
});

export default MultiScaleTokenizer;

