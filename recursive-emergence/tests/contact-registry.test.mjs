import test from 'node:test';
import assert from 'node:assert/strict';
import { DistributionalLexicon } from '../vendor/pure-synthia/engine/klein-distributional.js';
import { ContactRegistry } from '../src/contact-registry.mjs';

const p = (id, gate, value, actionId = id) => ({
  id,
  gate,
  value,
  actionId,
  address: { gate },
});

test('contact registry can express more than one simultaneous contact relation', () => {
  const registry = new ContactRegistry();
  const relations = registry.relations(
    p('a', 1, 'seed', 'same-action'),
    p('b', 1, 'seed', 'same-action'),
  );
  assert.ok(relations.includes('common-origin'));
  assert.ok(relations.includes('same-gate'));
  assert.ok(relations.includes('lexical-match'));
});

test('distributional contact is learned from repeated contexts', () => {
  const lexicon = new DistributionalLexicon({ synonymThreshold: 0.4, relatedThreshold: 0.1 });
  lexicon.observe('c1', 'alpha beta');
  lexicon.observe('c2', 'alpha beta');
  const registry = new ContactRegistry({ lexicon });
  const relations = registry.relations(p('a', 1, 'alpha'), p('b', 2, 'beta'));
  assert.ok(relations.includes('distributional-contact'));
});
