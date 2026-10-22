// Pure Synthia Automata — engine/v2: State Space Model (SSM) — system memory
//
// Ported from handoff 02_safe_namespaced_additions/complete_v2_engine/layer5_ssm.js
// (donor synthia_os_complete_v2, ranked PORT #4 in docs/corpus/unique-pieces-survey-2.md;
// filename kept per port contract).
// Fix-then-integrate changes vs the donor:
//   1. DONOR DEFECT — CommonJS (`require`/`module.exports`/`window.SSM`):
//      not loadable from our pure ESM tree or browser file:// modules.
//      Converted to ESM exports.
//   2. DONOR DEFECT — `Math.random()` in _buildB()/_buildC(): the input and
//      output projections were non-deterministic, so two fresh models given
//      identical inputs evolved differently. Replaced with the project
//      mulberry32 PRNG (state-space/constants.js), seeded per instance
//      (constructor `seed`, default fixed constant).
//   3. DONOR DEFECT — `predict()` leaked into long-term memory: it stepped
//      the model (which pushes into both `history` and `memory`), then
//      rolled back `history` and `time` but NOT `memory` — every prediction
//      permanently polluted recall(). Fixed: the prediction entry is removed
//      from memory too.
//   4. DONOR DEFECT — getMood() crashed for stateDim < 3 (top3[0] undefined)
//      and tie ordering was engine-dependent; guarded and given a
//      deterministic tiebreak (lower index wins).
//   5. DONOR DEPENDENCY — `require('./layer1_ato_core.js')` was used only for
//      hammingDistance; inlined as a local length-agnostic helper (zero deps)
//      instead of importing the donor's whole ATO core.
//
// State equation (Mamba/S4-style, donor header preserved):
//   h(t+1) = tanh(A * h(t) + B * x(t))
//   y(t)   = tanh(C * h(t) + D * x(t))
//
// Pure JS ESM, zero deps, browser file://-safe, deterministic (no wall-clock).

import { mulberry32 } from '../../state-space/constants.js';

/* Length-agnostic Hamming distance over 0/1-ish vectors (mismatched
 * positions counted; length difference counted). Local replacement for the
 * donor's ATO.hammingDistance. */
function hammingDistance(a, b) {
  const n = Math.min(a.length, b.length);
  let d = Math.abs(a.length - b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d;
}

export class StateSpaceModel {
  /**
   * @param stateDim  hidden state dimension (default 64 — the 64 hexagrams)
   * @param inputDim  input dimension (default 6)
   * @param outputDim output dimension (default 6)
   * @param seed      mulberry32 seed for B/C projections (default fixed —
   *                  same seed reproduces the identical model bit-for-bit)
   */
  constructor(stateDim = 64, inputDim = 6, outputDim = 6, seed = 0x55b1) {
    this.stateDim = stateDim;
    this.inputDim = inputDim;
    this.outputDim = outputDim;
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);

    this.h = new Array(stateDim).fill(0);

    this.A = this._buildA();  // state transition (structured, HiPPO-inspired)
    this.B = this._buildB();  // input projection (seeded deterministic)
    this.C = this._buildC();  // output projection (seeded deterministic)
    this.D = this._buildD();  // skip connection

    this.time = 0;
    this.history = [];
    this.memory = [];
    this.memorySize = 1000;
  }

  // ------------------------------------------------------------ matrices

  /* A: diagonal decay 0.99; off-diagonal coupling by hexagram distance
   * (close hexagrams couple more strongly). Fully deterministic. */
  _buildA() {
    const A = [];
    for (let i = 0; i < this.stateDim; i++) {
      const row = [];
      for (let j = 0; j < this.stateDim; j++) {
        if (i === j) {
          row.push(0.99);
        } else {
          const distance = this._hexagramDistance(i, j);
          row.push(Math.exp(-distance / 2) * 0.01);
        }
      }
      A.push(row);
    }
    return A;
  }

  _buildB() {
    const B = [];
    for (let i = 0; i < this.stateDim; i++) {
      const row = [];
      for (let j = 0; j < this.inputDim; j++) {
        row.push((this.rng() - 0.5) * 0.1); // seeded — deterministic
      }
      B.push(row);
    }
    return B;
  }

  _buildC() {
    const C = [];
    for (let i = 0; i < this.outputDim; i++) {
      const row = [];
      for (let j = 0; j < this.stateDim; j++) {
        row.push((this.rng() - 0.5) * 0.1); // seeded — deterministic
      }
      C.push(row);
    }
    return C;
  }

  _buildD() {
    const D = [];
    for (let i = 0; i < this.outputDim; i++) {
      const row = [];
      for (let j = 0; j < this.inputDim; j++) {
        row.push(i === j ? 0.5 : 0); // identity-like
      }
      D.push(row);
    }
    return D;
  }

  _hexagramDistance(i, j) {
    return hammingDistance(this._indexToVector(i), this._indexToVector(j));
  }

  _indexToVector(index) {
    // Index 0 = all zeros (Receptive); index 63 = all ones (Creative).
    const vec = [];
    for (let i = 0; i < 6; i++) vec.push((index >> i) & 1);
    return vec;
  }

  // ------------------------------------------------------------ core ops

  /* h(t+1) = tanh(A h + B x); y = tanh(C h + D x). Records history+memory
   * unless record:false (used by predict so speculation never persists). */
  step(input, { record = true } = {}) {
    const x = this._padOrTrim(input, this.inputDim);

    const Ah = this._matVecMul(this.A, this.h);
    const Bx = this._matVecMul(this.B, x);
    this.h = Ah.map((val, i) => Math.tanh(val + Bx[i]));

    const Ch = this._matVecMul(this.C, this.h);
    const Dx = this._matVecMul(this.D, x);
    const yOut = Ch.map((val, i) => Math.tanh(val + Dx[i]));

    if (record) {
      const entry = { time: this.time, input: x, state: [...this.h], output: yOut };
      this.history.push(entry);
      this.memory.push({ ...entry, state: [...this.h] });
      if (this.memory.length > this.memorySize) this.memory.shift();
    }

    this.time++;
    return yOut;
  }

  /* Convert a mesh vertex ({id, vector}) into input and update state. */
  processMeshEvent(vertex) {
    const input = this._padOrTrim(vertex.vector, this.inputDim);
    const output = this.step(input);
    this.history[this.history.length - 1].vertexId = vertex.id;
    return { output, state: [...this.h], time: this.time - 1 };
  }

  /* Predict WITHOUT committing: the speculative step is never recorded into
   * history or memory (donor rolled back history/time but leaked every
   * prediction into memory, polluting recall() — fixed) and the state and
   * clock are rolled back. */
  predict(input) {
    const hSaved = [...this.h];
    const output = this.step(input, { record: false });
    this.h = hSaved;
    this.time--;
    return output;
  }

  /* Memory retrieval: most similar past inputs, cosine similarity, topK. */
  recall(input, topK = 5) {
    const x = this._padOrTrim(input, this.inputDim);
    const similarities = this.memory.map((mem, idx) => ({
      index: idx, similarity: this._cosineSimilarity(x, mem.input), memory: mem,
    }));
    similarities.sort((a, b) => b.similarity - a.similarity || a.index - b.index);
    return similarities.slice(0, topK);
  }

  /* Dominant hexagrams in the current state. Ties break to the lower index
   * (deterministic); safe for stateDim < 3. */
  getMood() {
    const hexActivations = this.h.map((val, idx) => ({ idx, val }));
    hexActivations.sort((a, b) => b.val - a.val || a.idx - b.idx);
    const [top, second, third] = hexActivations;
    if (!top) {
      return { dominant: null, secondary: null, tertiary: null, activation: 0, mood: 'dormant' };
    }
    return {
      dominant: top.idx,
      secondary: second ? second.idx : null,
      tertiary: third ? third.idx : null,
      activation: top.val,
      mood: this._interpretMood(top.val),
    };
  }

  _interpretMood(activation) {
    if (activation > 0.8) return 'intense';
    if (activation > 0.5) return 'active';
    if (activation > 0.2) return 'calm';
    if (activation > -0.2) return 'neutral';
    if (activation > -0.5) return 'subdued';
    return 'dormant';
  }

  // ------------------------------------------------------------ utilities

  _matVecMul(matrix, vector) {
    return matrix.map((row) => row.reduce((sum, val, i) => sum + val * vector[i], 0));
  }

  _padOrTrim(vec, targetLength) {
    if (vec.length === targetLength) return vec;
    if (vec.length < targetLength) return [...vec, ...new Array(targetLength - vec.length).fill(0)];
    return vec.slice(0, targetLength);
  }

  _cosineSimilarity(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (normA === 0 || normB === 0) return 0;
    return dot / (normA * normB);
  }

  // ------------------------------------------------------------ mesh hook

  handle(vertex, params = {}) {
    if (params.step) return this.step(params.input);
    if (params.predict) return this.predict(params.input);
    if (params.recall) return this.recall(params.input, params.topK);
    if (params.mood) return this.getMood();
    return {
      stateDim: this.stateDim,
      time: this.time,
      mood: this.getMood(),
      historyLength: this.history.length,
    };
  }

  toString() {
    return `SSM(dim=${this.stateDim}, time=${this.time}, mood=${this.getMood().mood})`;
  }
}

export default StateSpaceModel;

