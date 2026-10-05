export const DIMENSIONS = Object.freeze(['Movement', 'Evolution', 'Being', 'Design']);
export const VERDICTS = Object.freeze(['ACCEPT', 'REJECT', 'INCONCLUSIVE']);

export function assertDimension(dimension) {
  if (!DIMENSIONS.includes(dimension)) {
    throw new RangeError(`dimension must be one of ${DIMENSIONS.join(', ')}; got ${dimension}`);
  }
  return dimension;
}

export function assertLocalModelPort(port) {
  if (!port || port.kind !== 'local-model') {
    throw new TypeError('A real local-model port is required; synthetic/fixture ports are not accepted for arrival.');
  }
  assertDimension(port.dimension);
  if (typeof port.emitCondition !== 'function') {
    throw new TypeError(`Local model port ${port.id || port.dimension} must implement emitCondition().`);
  }
  return port;
}

export function assertRealEmission(emission, expectedDimension) {
  if (!emission || typeof emission !== 'object') throw new TypeError('model emission must be an object');
  if (emission.dimension !== expectedDimension) {
    throw new Error(`model emission dimension mismatch: expected ${expectedDimension}, got ${emission.dimension}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(String(emission.modelFingerprint || ''))) {
    throw new Error(`${expectedDimension} emission lacks a 64-hex model fingerprint`);
  }
  if (typeof emission.text !== 'string' || !emission.text.trim()) {
    throw new Error(`${expectedDimension} emitted an empty condition`);
  }
  if (!emission.modelId) throw new Error(`${expectedDimension} emission lacks modelId`);
  return emission;
}
