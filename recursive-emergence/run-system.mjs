#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalPythonModelPort } from './src/model-port.mjs';
import { EmbodiedSystemRuntime } from './src/system-runtime.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const configPath = arg('--config');
if (!configPath) {
  console.error('Usage: node run-system.mjs --config /path/to/system.json [--steps 1] [--stimulus "..."]');
  process.exit(2);
}

const config = JSON.parse(readFileSync(resolve(configPath), 'utf8'));
const modelPorts = new Map();
for (const [key, modelDir] of Object.entries(config.models || {})) {
  modelPorts.set(key, new LocalPythonModelPort({
    modelDir: resolve(modelDir),
    python: config.python || 'python3',
  }));
}

const runtime = new EmbodiedSystemRuntime({
  modelPortsById: modelPorts,
  carrierDefinitions: config.carriers || null,
  stateDir: config.stateDir ? resolve(config.stateDir) : null,
  field: config.field || {},
  evolution: {
    ...(config.evolution || {}),
    python: config.python || 'python3',
    modelmakerApp: config.evolution?.modelmakerApp ? resolve(config.evolution.modelmakerApp) : null,
  },
  maxPiecesPerAction: config.maxPiecesPerAction || 96,
});

const result = await runtime.run({
  steps: Number(arg('--steps', config.steps || 1)),
  stimulus: arg('--stimulus', config.stimulus || ''),
});
console.log(JSON.stringify(result, null, 2));
