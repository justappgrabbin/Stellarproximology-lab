const DEFAULT_BASE_URL = process.env.SYNTHIA_ANDROID_BRIDGE_URL || 'http://127.0.0.1:8787';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function number(value, name) {
  const out = Number(value);
  if (!Number.isFinite(out)) throw new TypeError(`${name} must be a finite number`);
  return out;
}

export class AndroidHandBridge {
  constructor({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 1800 } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'GET', body = null } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === null ? undefined : { 'content-type': 'application/json' },
        body: body === null ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; }
      catch { payload = { ok: false, error: text || `HTTP ${response.status}` }; }
      if (!response.ok) {
        const error = new Error(payload.error || `Android hand bridge HTTP ${response.status}`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return freeze(payload);
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeout = new Error(`Android hand bridge timed out after ${this.timeoutMs}ms`);
        timeout.code = 'ANDROID_HAND_BRIDGE_TIMEOUT';
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async status() {
    try {
      const status = await this.request('/status');
      return freeze({ available: status.accessibilityEnabled === true, reachable: true, ...status });
    } catch (error) {
      return freeze({
        available: false,
        reachable: false,
        baseUrl: this.baseUrl,
        error: error.message,
        code: error.code ?? null,
      });
    }
  }

  screen() { return this.request('/screen'); }
  tap(x, y) { return this.request('/tap', { method: 'POST', body: { x: number(x, 'x'), y: number(y, 'y') } }); }
  swipe(x1, y1, x2, y2, durationMs = 350) {
    return this.request('/swipe', { method: 'POST', body: {
      x1: number(x1, 'x1'), y1: number(y1, 'y1'),
      x2: number(x2, 'x2'), y2: number(y2, 'y2'),
      durationMs: number(durationMs, 'durationMs'),
    } });
  }
  scroll(direction = 'down') { return this.request('/scroll', { method: 'POST', body: { direction: String(direction) } }); }
  clickText(text) { return this.request('/click-text', { method: 'POST', body: { text: String(text ?? '') } }); }
  typeText(text) { return this.request('/set-text', { method: 'POST', body: { text: String(text ?? '') } }); }
  global(action) { return this.request('/global', { method: 'POST', body: { action: String(action ?? '').toUpperCase() } }); }
  openApp(packageName) { return this.request('/open-app', { method: 'POST', body: { packageName: String(packageName ?? '') } }); }

  async command(message) {
    const raw = String(message ?? '').trim();
    const lower = raw.toLowerCase();
    let match;

    if ((match = raw.match(/^(?:tap|touch)\s+(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)$/i))) {
      return freeze({ action: 'tap', ...(await this.tap(match[1], match[2])) });
    }
    if ((match = raw.match(/^(?:click|tap)\s+(?:text\s+)?(.+)$/i))) {
      return freeze({ action: 'click-text', ...(await this.clickText(match[1].replace(/^['"]|['"]$/g, ''))) });
    }
    if ((match = raw.match(/^(?:type|enter|write)\s+(.+)$/i))) {
      return freeze({ action: 'set-text', ...(await this.typeText(match[1])) });
    }
    if (/^(?:scroll|swipe)\s+down$/i.test(raw)) return freeze({ action: 'scroll', ...(await this.scroll('down')) });
    if (/^(?:scroll|swipe)\s+up$/i.test(raw)) return freeze({ action: 'scroll', ...(await this.scroll('up')) });
    if (/^(?:go\s+)?back$/i.test(raw)) return freeze({ action: 'global', ...(await this.global('BACK')) });
    if (/^(?:go\s+)?home$/i.test(raw)) return freeze({ action: 'global', ...(await this.global('HOME')) });
    if (/^(?:show\s+)?recents$/i.test(raw)) return freeze({ action: 'global', ...(await this.global('RECENTS')) });
    if (/^(?:inspect|read|see)(?:\s+(?:the\s+)?screen)?$/i.test(raw)) return freeze({ action: 'screen', ...(await this.screen()) });
    if ((match = raw.match(/^open\s+app\s+([a-zA-Z0-9._]+)$/i))) {
      return freeze({ action: 'open-app', ...(await this.openApp(match[1])) });
    }

    return freeze({ ok: true, status: 'NO_DIRECT_ANDROID_ACTION', action: null, message: raw, lower });
  }
}

export default AndroidHandBridge;
