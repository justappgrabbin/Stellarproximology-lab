import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDimension, assertRealEmission } from './contracts.mjs';

const DEFAULT_WORKER = fileURLToPath(new URL('../python/model_worker.py', import.meta.url));
const DEFAULT_ONE_SHOT = fileURLToPath(new URL('../python/emit_seed.py', import.meta.url));

function readManifest(modelDir) {
  const path = `${modelDir.replace(/\/$/, '')}/dimension_manifest.json`;
  if (!existsSync(path)) throw new Error(`missing Modelmaker dimension manifest: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export class LocalPythonModelPort {
  constructor({
    modelDir,
    python = 'python3',
    worker = DEFAULT_WORKER,
    emitter = DEFAULT_ONE_SHOT,
    persistent = true,
  } = {}) {
    if (!modelDir) throw new TypeError('modelDir is required');
    const manifest = readManifest(modelDir);
    assertDimension(manifest.dimension);
    if (manifest.builder !== 'stellarproximology/Modelmaker') {
      throw new Error(`model at ${modelDir} was not built by the expected Modelmaker contract`);
    }
    if (!manifest.modelFingerprint) throw new Error(`model manifest at ${modelDir} lacks modelFingerprint`);
    this.kind = 'local-model';
    this.artifactVerified = true;
    this.modelDir = modelDir;
    this.python = python;
    this.worker = worker;
    this.emitter = emitter;
    this.persistent = persistent;
    this.dimension = manifest.dimension;
    this.id = manifest.modelId;
    this.manifest = Object.freeze({ ...manifest });
    this._child = null;
    this._buffer = '';
    this._seq = 0;
    this._pending = new Map();
    this._stderr = '';
  }

  _env() {
    return {
      ...process.env,
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      TOKENIZERS_PARALLELISM: 'false',
    };
  }

  _startWorker() {
    if (this._child) return;
    const child = spawn(this.python, [
      this.worker,
      '--model-dir', this.modelDir,
      '--dimension', this.dimension,
    ], {
      env: this._env(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._child = child;
    this._buffer = '';
    this._stderr = '';

    child.stdout.on('data', (chunk) => {
      this._buffer += String(chunk);
      while (true) {
        const idx = this._buffer.indexOf('\n');
        if (idx < 0) break;
        const line = this._buffer.slice(0, idx).trim();
        this._buffer = this._buffer.slice(idx + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); }
        catch { continue; }
        const pending = this._pending.get(message.requestId);
        if (!pending) continue;
        this._pending.delete(message.requestId);
        if (message.error) pending.reject(new Error(message.error));
        else {
          try {
            assertRealEmission(message, this.dimension);
            if (message.modelFingerprint !== this.manifest.modelFingerprint) {
              throw new Error(`${this.dimension} model fingerprint changed since manifest creation`);
            }
            pending.resolve(message);
          } catch (error) {
            pending.reject(error);
          }
        }
      }
    });
    child.stderr.on('data', (chunk) => { this._stderr += String(chunk); });
    child.on('error', (error) => {
      for (const pending of this._pending.values()) pending.reject(error);
      this._pending.clear();
    });
    child.on('close', (code) => {
      const error = code === 0 ? null : new Error(`model worker exited ${code}: ${this._stderr.trim()}`);
      if (error) for (const pending of this._pending.values()) pending.reject(error);
      this._pending.clear();
      this._child = null;
    });
  }

  emitCondition(request = {}) {
    if (!this.persistent) return this._emitOneShot(request);
    this._startWorker();
    const requestId = `${this.id}:${++this._seq}`;
    return new Promise((resolve, reject) => {
      this._pending.set(requestId, { resolve, reject });
      this._child.stdin.write(JSON.stringify({
        requestId,
        prompt: request.prompt,
        generation: request.generation ?? 1,
        parentWitness: request.parentWitness ?? null,
      }) + '\n', (error) => {
        if (!error) return;
        this._pending.delete(requestId);
        reject(error);
      });
    });
  }

  _emitOneShot({ prompt, generation = 1, parentWitness = null } = {}) {
    const request = JSON.stringify({ prompt, generation, parentWitness });
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [
        this.emitter,
        '--model-dir', this.modelDir,
        '--dimension', this.dimension,
      ], {
        env: this._env(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`local model emitter exited ${code}: ${stderr.trim()}`));
        try {
          const emission = JSON.parse(stdout);
          assertRealEmission(emission, this.dimension);
          if (emission.modelFingerprint !== this.manifest.modelFingerprint) {
            throw new Error(`${this.dimension} model fingerprint changed since manifest creation`);
          }
          resolve(emission);
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.end(request);
    });
  }

  close() {
    if (!this._child) return;
    try { this._child.stdin.end(); } catch {}
    try { this._child.kill(); } catch {}
    this._child = null;
    for (const pending of this._pending.values()) pending.reject(new Error('model port closed'));
    this._pending.clear();
  }
}
