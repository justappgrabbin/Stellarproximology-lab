import { channelPartners, centerForGate } from '../vendor/pure-synthia/merged/centers-channels.js';
import { gateBits, hamming } from '../vendor/pure-synthia/state-space/addressing.js';

export class ContactRegistry {
  constructor({ lexicon = null } = {}) {
    this.lexicon = lexicon;
    this.rules = [];
    this._installDefaults();
  }

  register(rule) {
    if (!rule?.id || typeof rule.test !== 'function') throw new TypeError('contact rule requires id and test(a,b,context)');
    this.rules.push(Object.freeze({ ...rule }));
    return this;
  }

  _installDefaults() {
    this.register({
      id: 'common-origin',
      test: (a, b) => a.actionId && a.actionId === b.actionId,
    });
    this.register({
      id: 'same-gate',
      test: (a, b) => a.address?.gate && a.address.gate === b.address?.gate,
    });
    this.register({
      id: 'canonical-channel',
      test: (a, b) => Boolean(a.address?.gate && b.address?.gate && channelPartners(a.address.gate).includes(b.address.gate)),
    });
    this.register({
      id: 'adjacent-state',
      test: (a, b) => {
        const ga = a.address?.gate;
        const gb = b.address?.gate;
        if (!ga || !gb || ga === gb) return false;
        return hamming(gateBits(ga), gateBits(gb)) === 1;
      },
    });
    this.register({
      id: 'shared-center',
      test: (a, b) => {
        const ga = a.address?.gate;
        const gb = b.address?.gate;
        if (!ga || !gb) return false;
        const ca = centerForGate(ga);
        const cb = centerForGate(gb);
        return Boolean(ca && cb && ca === cb);
      },
    });
    this.register({
      id: 'lexical-match',
      test: (a, b) => Boolean(a.value && b.value && String(a.value).toLowerCase() === String(b.value).toLowerCase()),
    });
    this.register({
      id: 'distributional-contact',
      test: (a, b) => {
        if (!this.lexicon || !a.value || !b.value) return false;
        const left = this.lexicon.infer(String(a.value).toLowerCase());
        const other = String(b.value).toLowerCase();
        return left.synonyms.includes(other) || left.related.includes(other);
      },
    });
  }

  relations(a, b, context = {}) {
    const out = [];
    for (const rule of this.rules) {
      let matched = false;
      try { matched = Boolean(rule.test(a, b, context)); } catch {}
      if (matched) out.push(rule.id);
    }
    return Object.freeze([...new Set(out)]);
  }
}
