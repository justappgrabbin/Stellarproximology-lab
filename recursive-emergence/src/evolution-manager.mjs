import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LocalPythonModelPort } from './model-port.mjs';
import { sha256 } from './hash.mjs';

const DEFAULT_SCRIPT = fileURLToPath(new URL('../python/evolve_model.py', import.meta.url));

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'carrier';
}

export class EvolutionManager {
  constructor({
    enabled = false,
    threshold = 16,
    stateDir = null,
    python = 'python3',
    script = DEFAULT_SCRIPT,
    modelmakerApp = null,
  } = {}) {
    this.enabled = Boolean(enabled);
    this.threshold = Math.max(1, Number(threshold) || 16);
    this.stateDir = stateDir;
    this.python = python;
    this.script = script;
    this.modelmakerApp = modelmakerApp;
  }

  async maybeEvolve(carrier, parentPort) {
    if (!this.enabled) return { status: 'disabled' };
    if (!this.stateDir) return { status: 'blocked', reason: 'STATE_DIR_REQUIRED' };
    const experiences = carrier.experiencesSinceEvolution();
    if (experiences.length < this.threshold) {
      return { status: 'waiting', have: experiences.length, need: this.threshold };
    }
    if (!parentPort?.modelDir || !existsSync(parentPort.modelDir)) {
      return { status: 'blocked', reason: 'PARENT_MODEL_DIR_MISSING' };
    }

    const trainingText = carrier.trainingText();
    const evolutionIndex = Math.floor(carrier.experiences.length / this.threshold);
    const digest = sha256(trainingText).slice(0, 12);
    const root = join(
      this.stateDir,
      'evolution',
      safeName(carrier.id),
      `${String(evolutionIndex).padStart(6, '0')}-${digest}`,
    );
    mkdirSync(root, { recursive: true });
    const experienceFile = join(root, 'relationship-experience.jsonl');
    if (!existsSync(experienceFile)) writeFileSync(experienceFile, trainingText + '\n', { flag: 'wx' });
    const outputDir = join(root, 'model');

    if (existsSync(join(outputDir, 'dimension_manifest.json'))) {
      const recovered = new LocalPythonModelPort({ modelDir: outputDir, python: this.python });
      carrier.registerCandidate(recovered);
      carrier.markEvolved();
      return {
        status: 'candidate-recovered',
        carrierId: carrier.id,
        modelId: recovered.id,
        modelFingerprint: recovered.manifest.modelFingerprint,
        parentModelFingerprint: recovered.manifest.parentModelFingerprint,
        modelDir: recovered.modelDir,
      };
    }

    const args = [
      this.script,
      '--parent-model-dir', parentPort.modelDir,
      '--experience-file', experienceFile,
      '--output-dir', outputDir,
      '--carrier-id', carrier.id,
      '--evolution-index', String(evolutionIndex),
    ];
    if (this.modelmakerApp) args.push('--modelmaker-app', this.modelmakerApp);

    const result = await new Promise((resolve, reject) => {
      const child = spawn(this.python, args, {
        env: {
          ...process.env,
          HF_HUB_OFFLINE: '1',
          TRANSFORMERS_OFFLINE: '1',
          TOKENIZERS_PARALLELISM: 'false',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error(`model evolution exited ${code}: ${stderr.trim()}`));
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`invalid evolution response: ${error.message}\n${stdout}`)); }
      });
    });

    if (!result?.ok || !result.modelDir) return { status: 'blocked', reason: 'EVOLUTION_DID_NOT_BUILD' };
    const candidate = new LocalPythonModelPort({ modelDir: result.modelDir, python: this.python });
    carrier.registerCandidate(candidate);
    carrier.markEvolved();
    return {
      status: 'candidate-created',
      carrierId: carrier.id,
      modelId: candidate.id,
      modelFingerprint: candidate.manifest.modelFingerprint,
      parentModelFingerprint: candidate.manifest.parentModelFingerprint,
      modelDir: candidate.modelDir,
    };
  }
}
