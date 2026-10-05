import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertDimension, assertRealEmission } from './contracts.mjs';

const DEFAULT_EMITTER = fileURLToPath(new URL('../python/emit_seed.py', import.meta.url));

function readManifest(modelDir) {
  const path = `${modelDir.replace(/\/$/, '')}/dimension_manifest.json`;
  if (!existsSync(path)) throw new Error(`missing Modelmaker dimension manifest: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export class LocalPythonModelPort {
  constructor({ modelDir, python = 'python3', emitter = DEFAULT_EMITTER } = {}) {
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
    this.emitter = emitter;
    this.dimension = manifest.dimension;
    this.id = manifest.modelId;
    this.manifest = Object.freeze({ ...manifest });
  }

  emitCondition({ prompt, generation = 1, parentWitness = null } = {}) {
    const request = JSON.stringify({ prompt, generation, parentWitness });
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [
        this.emitter,
        '--model-dir', this.modelDir,
        '--dimension', this.dimension,
      ], {
        env: {
          ...process.env,
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          TOKENIZERS_PARALLELISM: 'false',
        },
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
}
