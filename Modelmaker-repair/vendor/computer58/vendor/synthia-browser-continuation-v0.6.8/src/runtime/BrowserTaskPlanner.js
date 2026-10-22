export const HUMAN_ONLY = /(^|[-_\s])(signature|e[-_\s]?signature|initials?|consent|captcha|password|pin|payment|card|cvv|security[-_\s]?code)([-_\s]|$)/i;

export function isHumanOnlyField(field = {}) {
  const name = field.name || field.id || '';
  return HUMAN_ONLY.test(`${name} ${field.label || ''} ${field.type || ''}`);
}

export class BrowserTaskPlanner {
  plan(message, route) {
    const task = route?.task || 'navigation-workflow';
    if (task === 'form-workflow') {
      return Object.freeze({
        kind: task,
        steps: Object.freeze(['open-site', 'inspect-page', 'inspect-form', 'draft-known-values', 'fill-preapproved-values', 'validate', 'pause-for-human-only-fields', 'request-final-submit-confirmation']),
        finalConfirmation: 'submission',
        humanOnly: Object.freeze(['signature', 'consent', 'captcha'])
      });
    }
    if (task === 'purchase-workflow') {
      return Object.freeze({
        kind: task,
        steps: Object.freeze(['open-site', 'search', 'compare-requested-constraints', 'select-item', 'prepare-cart', 'pause-before-payment-or-order']),
        finalConfirmation: 'purchase',
        humanOnly: Object.freeze(['payment-authorization', 'final-order'])
      });
    }
    if (task === 'booking-workflow') {
      return Object.freeze({
        kind: task,
        steps: Object.freeze(['open-site', 'search-availability', 'select-requested-slot', 'prepare-booking', 'pause-before-binding-confirmation']),
        finalConfirmation: 'booking',
        humanOnly: Object.freeze(['binding-confirmation'])
      });
    }
    return Object.freeze({
      kind: task,
      steps: Object.freeze(['open-site', 'inspect-page', 'navigate-to-goal']),
      finalConfirmation: null,
      humanOnly: Object.freeze([])
    });
  }

  async prepareForm(browserForm, { page, profile = {}, preapprovedFields = [], generatedValues = {}, generatedSources = {} } = {}) {
    if (!browserForm) throw new Error('browser-form automaton is required');
    if (!page) return Object.freeze({ status: 'needs-browser-page', page: null, draft: null, validation: null, unresolved: Object.freeze([]) });

    await browserForm.call({ operation: 'inspect-page', page });
    const form = page.forms?.[0];
    if (!form) return Object.freeze({ status: 'no-form-found', page, draft: null, validation: null, unresolved: Object.freeze([]) });

    const values = {};
    const sources = {};
    const approved = new Set(preapprovedFields);
    const generated = new Set(Object.keys(generatedValues || {}));
    for (const field of form.fields || []) {
      const name = field.name || field.id;
      if (!name || isHumanOnlyField(field)) continue;
      if (Object.prototype.hasOwnProperty.call(generatedValues, name)) {
        values[name] = generatedValues[name];
        sources[name] = generatedSources[name] || { kind: 'generated-expression', ref: `generated.${name}` };
      } else if (Object.prototype.hasOwnProperty.call(profile, name)) {
        values[name] = profile[name];
        sources[name] = { kind: 'stored-profile', ref: `profile.${name}` };
      }
    }

    let draft = await browserForm.call({ operation: 'draft', formId: form.id, values, context: { sources } });
    const safeApproved = draft.entries.filter((entry) => entry.value !== null && (approved.has(entry.name) || generated.has(entry.name)) && !HUMAN_ONLY.test(`${entry.name} ${entry.label || ''}`)).map((entry) => entry.name);
    if (safeApproved.length) draft = await browserForm.call({ operation: 'approve-fields', draftId: draft.id, names: safeApproved, context: { scope: generated.size ? 'reversible-generated-or-profile-draft' : 'profile-preapproval' } });

    const unapprovedPopulated = draft.entries.filter((entry) => entry.value !== null && !entry.approved).map((entry) => entry.name);
    if (unapprovedPopulated.length) {
      return Object.freeze({
        status: 'awaiting-field-approval',
        page,
        draft,
        validation: null,
        unresolved: Object.freeze(unapprovedPopulated),
        next: 'approve populated profile fields before typing them into the page'
      });
    }

    draft = await browserForm.call({ operation: 'fill', draftId: draft.id });
    const validation = await browserForm.call({ operation: 'validate', draftId: draft.id });
    const unresolved = [...validation.missing];
    const humanOnly = unresolved.filter((name) => {
      const field = (form.fields || []).find((candidate) => (candidate.name || candidate.id) === name);
      return isHumanOnlyField(field || { name });
    });
    return Object.freeze({
      status: validation.valid ? 'ready-for-submit-confirmation' : 'awaiting-human',
      page,
      draft,
      validation,
      unresolved: Object.freeze(unresolved),
      humanOnly: Object.freeze(humanOnly),
      next: validation.valid ? 'request final submission confirmation' : 'collect unresolved human-only or missing fields'
    });
  }
}

export default BrowserTaskPlanner;
