#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalPythonModelPort } from './src/model-port.mjs';
import { RecursiveEmergenceRuntime } from './src/kernel.mjs';
import { DIMENSIONS } from './src/contracts.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const modelsFile = arg('--models');
if (!modelsFile) {
  console.error('Usage: node run-arrival.mjs --models /path/to/models.json [--generations 1] [--context "..."]');
  process.exit(2);
}
const config = JSON.parse(readFileSync(resolve(modelsFile), 'utf8'));
const ports = DIMENSIONS.map((dimension) => {
  const row = config[dimension];
  if (!row?.path) throw new Error(`models.json lacks ${dimension}.path`);
  return new LocalPythonModelPort({ modelDir: row.path });
});

const runtime = new RecursiveEmergenceRuntime({ modelPorts: ports });
const result = await runtime.grow({
  generations: Number(arg('--generations', '1')),
  context: arg('--context', ''),
});
console.log(JSON.stringify(result, null, 2));
