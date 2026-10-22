import { join } from 'node:path';
import { ChromeDevToolsBrowserExecutor } from '../../vendor/synthia-browser-continuation-v0.6.8/src/runtime/ChromeDevToolsBrowserExecutor.js';
import { BrowserTaskPlanner } from '../../vendor/synthia-browser-continuation-v0.6.8/src/runtime/BrowserTaskPlanner.js';
import { BrowserTaskMemory } from '../../vendor/synthia-browser-continuation-v0.6.8/src/runtime/BrowserTaskMemory.js';
import { browserFormAutomaton } from '../../vendor/synthia-browser-continuation-v0.6.8/src/UPGRADES/vendor/ato-core/src/browser-form.mjs';

const freeze = (value) => Object.freeze(value);

function normalUrl(input) {
  let value = String(input ?? '').trim();
  if (!value) throw new TypeError('URL required');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = `https://${value}`;
  return new URL(value).href;
}

export class VisualBrowserExecutor extends ChromeDevToolsBrowserExecutor {
  constructor({ width = 430, height = 760, ...options } = {}) {
    super(options);
    this.viewport = { width, height };
  }

  async ready() {
    await this.start();
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width,
      height: this.viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    return this;
  }

  async navigate(url) {
    await this.ready();
    return super.navigate(url);
  }

  async loadHTML(html, options = {}) {
    await this.ready();
    return super.loadHTML(html, options);
  }

  async screenshot() {
    await this.ready();
    const result = await this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    return `data:image/png;base64,${result.data}`;
  }

  async clickPoint(x, y) {
    await this.ready();
    const px = Math.max(0, Math.min(this.viewport.width - 1, Number(x)));
    const py = Math.max(0, Math.min(this.viewport.height - 1, Number(y)));
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1 });
    await this.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    return freeze({ ok: true, x: px, y: py });
  }

  async back() {
    await this.ready();
    await this.evaluate('history.back()');
    await new Promise((resolve) => setTimeout(resolve, 220));
    return this.snapshot();
  }

  async forward() {
    await this.ready();
    await this.evaluate('history.forward()');
    await new Promise((resolve) => setTimeout(resolve, 220));
    return this.snapshot();
  }

  async reload() {
    await this.ready();
    await this.cdp.send('Page.reload', { ignoreCache: false });
    await new Promise((resolve) => setTimeout(resolve, 220));
    return this.snapshot();
  }
}

export class SoloBrowserHand {
  constructor({ persistenceDir = '.synthia-state', width = 430, height = 760 } = {}) {
    this.executor = new VisualBrowserExecutor({ headless: true, width, height });
    this.browserForm = browserFormAutomaton();
    this.planner = new BrowserTaskPlanner();
    this.memory = new BrowserTaskMemory({ path: join(persistenceDir, 'browser-task-memory.json') });
    this.currentUrl = null;
    this.latestPage = null;
    this.latestDraft = null;
  }

  status() {
    return freeze({
      available: ChromeDevToolsBrowserExecutor.isAvailable(),
      browserPath: ChromeDevToolsBrowserExecutor.findBrowserPath(),
      started: this.executor.started,
      url: this.currentUrl,
      viewport: freeze({ ...this.executor.viewport }),
    });
  }

  async bundle() {
    if (!this.executor.started) return freeze({ ok: true, status: this.status(), page: null, screenshot: null });
    const page = await this.executor.inspectPage();
    this.latestPage = page;
    this.currentUrl = page.url;
    return freeze({ ok: true, status: this.status(), page, screenshot: await this.executor.screenshot() });
  }

  async navigate(url) {
    const target = normalUrl(url);
    await this.executor.navigate(target);
    this.currentUrl = target;
    return this.bundle();
  }

  async loadHTML(html, { url = 'https://synthia.local/' } = {}) {
    await this.executor.loadHTML(html, { url });
    this.currentUrl = url;
    return this.bundle();
  }

  async back() { await this.executor.back(); return this.bundle(); }
  async forward() { await this.executor.forward(); return this.bundle(); }
  async reload() { await this.executor.reload(); return this.bundle(); }

  async clickPoint(x, y) {
    await this.executor.clickPoint(x, y);
    return this.bundle();
  }

  async clickText(text) {
    const page = await this.executor.inspectPage();
    const query = String(text ?? '').trim().toLowerCase();
    const action = page.actions?.find((item) => String(item.text ?? '').trim().toLowerCase() === query)
      ?? page.actions?.find((item) => String(item.text ?? '').toLowerCase().includes(query));
    if (!action) return freeze({ ok: false, status: 'ACTION_NOT_FOUND', query, page, screenshot: await this.executor.screenshot() });
    const result = await this.executor.clickAction(action.id);
    return freeze({ ...(await this.bundle()), clicked: result });
  }

  async fillFields(values = {}) {
    const page = await this.executor.inspectPage();
    const form = page.forms?.[0];
    if (!form) return freeze({ ok: false, status: 'NO_FORM_FOUND', page, screenshot: await this.executor.screenshot() });
    await this.browserForm.call({ operation: 'inspect-page', page });
    let draft = await this.browserForm.call({ operation: 'draft', formId: form.id, values, context: { sources: Object.fromEntries(Object.keys(values).map((name) => [name, { kind: 'explicit-user-entry', ref: `user.${name}` }])) } });
    const populated = draft.entries.filter((entry) => entry.value !== null && entry.value !== undefined && entry.value !== '').map((entry) => entry.name);
    if (populated.length) draft = await this.browserForm.call({ operation: 'approve-fields', draftId: draft.id, names: populated, context: { scope: 'explicit-user-fill-request' } });
    draft = await this.browserForm.call({ operation: 'fill', draftId: draft.id });
    const validation = await this.browserForm.call({ operation: 'validate', draftId: draft.id });
    if (draft.status === 'filled') await this.executor.fillDraft(draft);
    this.latestDraft = draft;
    return freeze({ ...(await this.bundle()), draft, validation, status: validation.valid ? 'READY_FOR_FINAL_CONFIRMATION' : 'AWAITING_FIELDS' });
  }

  async submit({ confirmed = false } = {}) {
    if (!this.latestDraft) throw new Error('no prepared browser form');
    const validation = await this.browserForm.call({ operation: 'validate', draftId: this.latestDraft.id });
    if (!validation.valid) return freeze({ ...(await this.bundle()), status: 'AWAITING_FIELDS', validation });
    const request = await this.browserForm.call({ operation: 'request-submission', draftId: this.latestDraft.id });
    if (!confirmed) return freeze({ ...(await this.bundle()), status: 'AWAITING_FINAL_CONFIRMATION', requestId: request.id });
    await this.browserForm.call({ operation: 'confirm-submission', requestId: request.id });
    const formId = this.latestDraft.formId;
    const dispatched = await this.browserForm.ownedState.submit(request.id, () => this.executor.submitForm(formId));
    return freeze({ ...(await this.bundle()), status: 'SUBMITTED', requestId: request.id, dispatched });
  }


  async morphPageFromPacket(packet) {
    if (!this.executor.started) throw new Error('open a browser page before morphing it');
    const seen = new Set();
    const findColor = (value) => {
      if (!value || typeof value !== 'object' || seen.has(value)) return null;
      seen.add(value);
      for (const key of ['css', 'hex', 'color']) {
        const candidate = value[key];
        if (typeof candidate === 'string' && (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(candidate) || /^(rgb|hsl)a?\(/i.test(candidate))) return candidate;
      }
      for (const child of Object.values(value)) {
        const found = findColor(child);
        if (found) return found;
      }
      return null;
    };
    const accent = findColor(packet?.perception) || findColor(packet?.current);
    if (!accent) return freeze({ ...(await this.bundle()), ok: false, status: 'NO_RESOLVED_CHROMATIC_EXPRESSION' });
    const css = `
      :root{--synthia-page-accent:${accent}!important}
      ::selection{background:color-mix(in srgb,var(--synthia-page-accent),transparent 55%)!important}
      a,button,input,select,textarea,[role=button]{transition:box-shadow .25s,border-color .25s,outline-color .25s!important}
      input:focus,select:focus,textarea:focus,button:hover,a:focus{outline-color:var(--synthia-page-accent)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--synthia-page-accent),transparent 70%)!important}
    `;
    const result = await this.executor.evaluate(`(() => {
      let style=document.getElementById('synthia-canonical-page-morph');
      if(!style){style=document.createElement('style');style.id='synthia-canonical-page-morph';document.documentElement.appendChild(style);}
      style.textContent=${JSON.stringify(css)};
      document.documentElement.dataset.synthiaMorphed='true';
      return {ok:true,accent:${JSON.stringify(accent)}};
    })()`);
    return freeze({ ...(await this.bundle()), ok: true, status: 'MORPHED', morph: result, canonicalMorphPacketId: packet?.id ?? null });
  }

  async command(message) {
    const text = String(message ?? '').trim();
    const lower = text.toLowerCase();
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return freeze({ action: 'navigate', ...(await this.navigate(urlMatch[0])) });
    const openMatch = text.match(/^(?:open|go to|navigate to|visit)\s+([^\s]+(?:\.[^\s]+)+)/i);
    if (openMatch) return freeze({ action: 'navigate', ...(await this.navigate(openMatch[1])) });
    if (/^(?:back|go back)$/i.test(text)) return freeze({ action: 'back', ...(await this.back()) });
    if (/^(?:forward|go forward)$/i.test(text)) return freeze({ action: 'forward', ...(await this.forward()) });
    if (/^(?:reload|refresh)$/i.test(text)) return freeze({ action: 'reload', ...(await this.reload()) });
    if (/\binspect\b/i.test(text)) return freeze({ action: 'inspect', ...(await this.bundle()) });
    const click = text.match(/^click\s+(.+)$/i);
    if (click) return freeze({ action: 'click', ...(await this.clickText(click[1])) });
    const fill = text.match(/^fill\s+(.+?)\s+with\s+(.+)$/i);
    if (fill) return freeze({ action: 'fill', ...(await this.fillFields({ [fill[1].trim()]: fill[2].trim() })) });
    if (/\bfill\s+(?:out\s+)?(?:the\s+)?form\b/i.test(lower)) {
      const page = await this.executor.inspectPage();
      return freeze({ action: 'form-inspect', ok: true, status: page.forms?.length ? 'AWAITING_VALUES' : 'NO_FORM_FOUND', page, screenshot: await this.executor.screenshot() });
    }
    return freeze({ action: null, ok: true, status: 'NO_DIRECT_BROWSER_ACTION', ...(await this.bundle()) });
  }

  async close() {
    await this.executor.stop();
  }
}

export default SoloBrowserHand;
