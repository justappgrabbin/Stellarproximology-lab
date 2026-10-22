// Pure Synthia Automata — experiments/scale: the reproduction gate (ported report vs sealed fixture, field-by-field)

/**
 * REPRODUCTION GATE — compares a ported benchmark report against the sealed
 * phase-1 result fixture. Every leaf field of the sealed report is compared;
 * the result is an honest per-field table:
 *
 *   { status: 'match' | 'mismatch' | 'adapted-not-reproduced',
 *     perField: { '<path>': { sealed, ported, status, reason? } },
 *     mismatchCount, adaptedCount, matchCount }
 *
 * Rules (task discipline):
 *   - a field that differs is 'mismatch' — never silently dropped;
 *   - a field the port knowingly cannot reproduce (because the machinery was
 *     adapted) is marked 'adapted-not-reproduced' WITH a reason, supplied by
 *     the benchmark via the `adapted` map {path: reason};
 *   - fields present only in the ported report (e.g. our added `provenance`,
 *     `assumptions`, `reproduction` blocks) are not part of the comparison —
 *     the gate walks the SEALED structure.
 *
 * status: IMPLEMENTATION_CHOICE (this port; the source package seals results
 * as files but ships no comparison machinery).
 */

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function walkLeaves(value, path, out) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkLeaves(item, `${path}[${i}]`, out));
    return;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) walkLeaves(value[key], path ? `${path}.${key}` : key, out);
    return;
  }
  out.push([path, value]);
}

function getAtPath(root, path) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter((p) => p.length > 0);
  let node = root;
  for (const part of parts) {
    if (node === undefined || node === null) return undefined;
    node = node[part];
  }
  return node;
}

const leafEqual = (a, b) => a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b));

export function compareToSealed(sealed, ported, { adapted = {} } = {}) {
  const leaves = [];
  walkLeaves(sealed, '', leaves);

  const perField = {};
  let matchCount = 0;
  let mismatchCount = 0;
  let adaptedCount = 0;

  for (const [path, sealedValue] of leaves) {
    if (Object.prototype.hasOwnProperty.call(adapted, path)) {
      perField[path] = Object.freeze({
        sealed: sealedValue, ported: getAtPath(ported, path),
        status: 'adapted-not-reproduced', reason: adapted[path],
      });
      adaptedCount += 1;
      continue;
    }
    const portedValue = getAtPath(ported, path);
    const equal = leafEqual(sealedValue, portedValue);
    perField[path] = Object.freeze({ sealed: sealedValue, ported: portedValue, status: equal ? 'match' : 'mismatch' });
    if (equal) matchCount += 1; else mismatchCount += 1;
  }

  const status = mismatchCount > 0 ? 'mismatch' : (adaptedCount > 0 ? 'adapted-not-reproduced' : 'match');

  return Object.freeze({
    status,
    matchCount,
    mismatchCount,
    adaptedCount,
    comparedFields: leaves.length,
    perField: Object.freeze(perField),
  });
}

