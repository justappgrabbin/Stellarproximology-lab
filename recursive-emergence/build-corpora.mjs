#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { DIMENSION_META, SCALES } from './vendor/pure-synthia/state-space/constants.js';
import { DIMENSION_VOCABULARIES } from './vendor/pure-synthia/merged/dimension-router.js';
import { OPERATORS } from './vendor/pure-synthia/state-space/operators.js';
import { NAMED_TRANSITIONS } from './vendor/pure-synthia/state-space/transitions.js';
import { CANONICAL_CHANNELS } from './vendor/pure-synthia/merged/centers-channels.js';
import {
  WUXING_DIMENSION,
  MANNER_DIMENSION,
  LETTERS_DIMENSIONS,
  UNIFIED_SYNTAX_FIELD,
  SOUND_DIMENSIONS,
  COLOR_DIMENSIONS,
  FRAGMENT_DIMENSIONS,
  SENSE_DIMENSIONS,
} from './vendor/pure-synthia/state-space/primitive-dimensions.js';

const TARGETS = ['Movement', 'Evolution', 'Being', 'Design'];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function relevant(value, dimension) {
  if (value == null) return false;
  if (typeof value === 'string') return value.toLowerCase().includes(dimension.toLowerCase());
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((x) => relevant(x, dimension));
  return Object.values(value).some((x) => relevant(x, dimension));
}

function select(value, dimension) {
  if (value == null) return undefined;
  if (typeof value !== 'object') return relevant(value, dimension) ? value : undefined;
  if (Array.isArray(value)) {
    const kept = value.filter((x) => relevant(x, dimension)).map((x) => x);
    return kept.length ? kept : undefined;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === dimension.toLowerCase()) {
      out[key] = child;
      continue;
    }
    if (!relevant(child, dimension)) continue;
    const picked = select(child, dimension);
    out[key] = picked === undefined ? child : picked;
  }
  return Object.keys(out).length ? out : undefined;
}

const outDir = resolve(arg('--output', './dimensional-corpora'));
mkdirSync(outDir, { recursive: true });

const canonical = {
  wuxing: WUXING_DIMENSION,
  manner: MANNER_DIMENSION,
  letters: LETTERS_DIMENSIONS,
  syntax: UNIFIED_SYNTAX_FIELD,
  sound: SOUND_DIMENSIONS,
  color: COLOR_DIMENSIONS,
  fragments: FRAGMENT_DIMENSIONS,
  senses: SENSE_DIMENSIONS,
};

const config = {};
for (let i = 0; i < TARGETS.length; i += 1) {
  const dimension = TARGETS[i];
  const perspective = select(canonical, dimension) || {};
  const corpus = [
    '# STELLAR PROXIMOLOGY DIMENSIONAL MODEL CORPUS',
    `DIMENSION: ${dimension}`,
    '',
    'This model is one dimensional perspective participating in one shared system.',
    'It emits conditions into the common substrate. It does not own or centrally orchestrate the system.',
    'Space remains the shared field/form condition and is not converted into a fifth equal dimensional LLM by this corpus.',
    '',
    '## DIMENSION META',
    JSON.stringify(DIMENSION_META[dimension], null, 2),
    '',
    '## DIMENSION VOCABULARY',
    JSON.stringify(DIMENSION_VOCABULARIES[dimension], null, 2),
    '',
    '## EXPLICIT CANONICAL PRIMITIVE ATTRIBUTIONS',
    JSON.stringify(perspective, null, 2),
    '',
    '## SHARED SCALE LAW',
    JSON.stringify(SCALES, null, 2),
    '',
    '## SHARED OPERATORS',
    JSON.stringify(OPERATORS.map((o) => ({
      id: o.id,
      name: o.name,
      rule: o.rule,
      positionalRule: o.positionalRule,
      invariants: o.invariants,
      scalesObserved: o.scalesObserved,
    })), null, 2),
    '',
    '## SHARED NAMED TRANSITIONS',
    JSON.stringify(NAMED_TRANSITIONS, null, 2),
    '',
    '## SHARED CHANNEL TOPOLOGY',
    JSON.stringify(CANONICAL_CHANNELS, null, 2),
    '',
    '## RELATIONAL DIRECTIVE',
    `Learn ${dimension} through repeated embodied feedback, relationships, peer observations, and retained provenance. New descendant models inherit this corpus plus verified relationship experience rather than replacing this source lineage.`,
    '',
  ].join('\n');

  const file = join(outDir, `${dimension.toLowerCase()}.txt`);
  writeFileSync(file, corpus, { flag: 'wx' });
  config[dimension] = {
    corpus: file,
    name: `synthia-${dimension.toLowerCase()}`,
    seed: 1001 + i,
    vocab_size: 4096,
    context_length: 128,
    layers: 2,
    heads: 4,
    embedding_size: 256,
    epochs: 2,
    batch_size: 4,
    learning_rate: 0.0003,
  };
}

writeFileSync(join(outDir, 'dimensions.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ok: true, output: outDir, config: join(outDir, 'dimensions.json') }, null, 2));
