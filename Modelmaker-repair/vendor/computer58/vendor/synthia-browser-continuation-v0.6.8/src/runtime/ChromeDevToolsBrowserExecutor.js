import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_BROWSER_PATHS = [
  process.env.SYNTHIA_CHROMIUM_PATH,
  process.env.CHROME_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable'
].filter(Boolean);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => port ? resolve(port) : reject(new Error('Could not allocate browser debug port')));
    });
  });
}

class CDPConnection {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chromium DevTools')), 5000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', (event) => { clearTimeout(timer); reject(event.error || new Error('DevTools websocket error')); }, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(Object.assign(new Error(message.error.message), { code: message.error.code, data: message.error.data }));
        else pending.resolve(message.result || {});
        return;
      }
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of [...listeners]) listener(message.params || {});
    });
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('Chromium DevTools connection closed'));
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Chromium DevTools connection is not open');
    const id = ++this.sequence;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  once(method, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${method}`)); }, timeoutMs);
      const listener = (params) => { cleanup(); resolve(params); };
      const cleanup = () => {
        clearTimeout(timer);
        const list = this.listeners.get(method) || [];
        this.listeners.set(method, list.filter((entry) => entry !== listener));
      };
      const list = this.listeners.get(method) || [];
      list.push(listener);
      this.listeners.set(method, list);
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

function jsString(value) {
  return JSON.stringify(String(value ?? ''));
}

export class ChromeDevToolsBrowserExecutor {
  constructor({ browserPath = null, headless = true, browserArgs = [] } = {}) {
    this.browserPath = browserPath;
    this.headless = headless;
    this.browserArgs = [...browserArgs];
    this.process = null;
    this.userDataDir = null;
    this.port = null;
    this.cdp = null;
    this.started = false;
    this.logicalUrl = null;
  }

  static findBrowserPath() {
    return DEFAULT_BROWSER_PATHS.find((candidate) => existsSync(candidate)) || null;
  }

  static isAvailable() {
    return Boolean(this.findBrowserPath());
  }

  resolveBrowserPath() {
    if (this.browserPath) {
      if (!existsSync(this.browserPath)) throw new Error(`Configured browser executable does not exist: ${this.browserPath}`);
      return this.browserPath;
    }
    const path = ChromeDevToolsBrowserExecutor.findBrowserPath();
    if (!path) throw new Error('No Chromium/Chrome executable configured. Set SYNTHIA_CHROMIUM_PATH.');
    return path;
  }

  async start() {
    if (this.started) return this;
    this.port = await freePort();
    this.userDataDir = await mkdtemp(join(tmpdir(), 'synthia-browser-'));
    const executable = this.resolveBrowserPath();
    const args = [
      this.headless ? '--headless=new' : null,
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...this.browserArgs,
      'about:blank'
    ].filter(Boolean);
    this.process = spawn(executable, args, { stdio: 'ignore' });
    this.process.unref();

    let pages = null;
    let lastError = null;
    for (let i = 0; i < 80; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        if (response.ok) {
          pages = await response.json();
          if (pages.some((page) => page.type === 'page' && page.webSocketDebuggerUrl)) break;
        }
      } catch (error) { lastError = error; }
      if (this.process.exitCode !== null) throw new Error(`Chromium exited before DevTools became ready (code ${this.process.exitCode})`);
      await delay(50);
    }
    const page = pages?.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
    if (!page) throw lastError || new Error('Chromium DevTools page target did not become ready');
    this.cdp = new CDPConnection(page.webSocketDebuggerUrl);
    await this.cdp.connect();
    await Promise.all([this.cdp.send('Page.enable'), this.cdp.send('Runtime.enable'), this.cdp.send('DOM.enable')]);
    this.started = true;
    return this;
  }

  async stop() {
    this.cdp?.close();
    this.cdp = null;
    if (this.process && this.process.exitCode === null) {
      try { this.process.kill('SIGTERM'); } catch {}
      await delay(50);
      if (this.process.exitCode === null) try { this.process.kill('SIGKILL'); } catch {}
    }
    this.process = null;
    if (this.userDataDir) await rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
    this.userDataDir = null;
    this.started = false;
  }

  async evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    await this.start();
    const result = await this.cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
    return result.result?.value;
  }

  async navigate(url) {
    await this.start();
    const target = new URL(url).href;
    this.logicalUrl = target;
    await this.cdp.send('Page.navigate', { url: target });
    for (let i = 0; i < 120; i++) {
      try {
        const ready = await this.evaluate('document.readyState');
        if (ready === 'complete' || ready === 'interactive') break;
      } catch {}
      await delay(50);
    }
    return this.snapshot();
  }

  async loadHTML(html, { url = 'https://synthia.local/' } = {}) {
    await this.start();
    this.logicalUrl = String(url);
    const { frameTree } = await this.cdp.send('Page.getFrameTree');
    await this.cdp.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html: String(html || '') });
    for (let i = 0; i < 40; i++) {
      const ready = await this.evaluate('document.readyState').catch(() => null);
      if (ready === 'complete' || ready === 'interactive') break;
      await delay(25);
    }
    return this.snapshot();
  }

  async snapshot() {
    const snapshot = await this.evaluate(`(() => ({ url: location.href, title: document.title, readyState: document.readyState, text: (document.body?.innerText || '').slice(0, 8000) }))()`);
    return Object.freeze({ ...snapshot, url: this.logicalUrl || snapshot.url });
  }

  async inspectPage() {
    const inspected = await this.evaluate(`(() => {
      const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const labelFor = (el) => {
        if (el.labels && el.labels.length) return clean(Array.from(el.labels).map(x => x.innerText).filter(Boolean).join(' '));
        const aria = el.getAttribute('aria-label'); if (aria) return clean(aria);
        const placeholder = el.getAttribute('placeholder'); if (placeholder) return clean(placeholder);
        return clean(el.name || el.id || '');
      };
      const fieldValue = (el) => {
        if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? (el.value || true) : '';
        return el.value ?? '';
      };
      const actions = Array.from(document.querySelectorAll('a[href],button,input[type=submit],input[type=button],[role=button]'))
        .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .map((el, index) => {
          const actionId = 'action-' + (index + 1);
          el.setAttribute('data-synthia-action-id', actionId);
          const text = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
          const parent = el.closest('li,nav,section,article,form,div') || el.parentElement;
          const context = clean(parent?.innerText || '').slice(0, 500);
          return {
            id: actionId,
            tag: el.tagName.toLowerCase(),
            role: clean(el.getAttribute('role') || (el.tagName === 'A' ? 'link' : 'button')),
            text,
            href: el.href || null,
            type: clean(el.type || ''),
            context,
            disabled: false
          };
        });
      const forms = Array.from(document.forms).map((form, formIndex) => ({
        id: form.id || form.name || 'form-' + (formIndex + 1),
        action: form.action || location.href,
        method: (form.method || 'GET').toUpperCase(),
        official: location.protocol === 'https:',
        text: clean(form.innerText || '').slice(0, 1000),
        fields: Array.from(form.elements).filter(el => ['INPUT','SELECT','TEXTAREA'].includes(el.tagName) && !['submit','button','reset','image','hidden'].includes((el.type || '').toLowerCase())).map((el, fieldIndex) => ({
          id: el.id || el.name || 'field-' + (fieldIndex + 1),
          name: el.name || el.id || 'field-' + (fieldIndex + 1),
          label: labelFor(el),
          type: (el.type || el.tagName || 'text').toLowerCase(),
          required: Boolean(el.required),
          value: fieldValue(el),
          options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value:o.value, label:o.text, selected:o.selected })) : []
        }))
      }));
      const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((el) => clean(el.innerText)).filter(Boolean).slice(0, 30);
      return { url: location.href, title: document.title, text: clean(document.body?.innerText || '').slice(0, 12000), headings, actions, forms };
    })()`);
    return Object.freeze({ ...inspected, url: this.logicalUrl || inspected.url });
  }

  async clickAction(actionId) {
    const result = await this.evaluate(`(() => {
      const id = ${jsString(actionId)};
      const el = document.querySelector('[data-synthia-action-id="' + CSS.escape(id) + '"]');
      if (!el) return { ok:false, reason:'ACTION_NOT_FOUND', actionId:id };
      const text = String(el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
      el.click();
      return { ok:true, actionId:id, text };
    })()`);
    if (result?.ok) await delay(120);
    return Object.freeze(result);
  }

  async setField(name, value) {
    const result = await this.evaluate(`(() => {
      const name = ${jsString(name)};
      const value = ${JSON.stringify(value)};
      const fields = Array.from(document.querySelectorAll('input,select,textarea'));
      const el = fields.find(x => x.name === name || x.id === name);
      if (!el) return { ok:false, reason:'FIELD_NOT_FOUND', name };
      const type = (el.type || '').toLowerCase();
      if (type === 'file') return { ok:false, reason:'FILE_REQUIRES_UPLOAD', name };
      if (type === 'checkbox' || type === 'radio') el.checked = Boolean(value);
      else el.value = value == null ? '' : String(value);
      el.dispatchEvent(new Event('input', { bubbles:true }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
      return { ok:true, name, value: type === 'checkbox' || type === 'radio' ? el.checked : el.value };
    })()`);
    return Object.freeze(result);
  }

  async fillDraft(draft) {
    const results = [];
    for (const entry of draft?.entries || []) {
      if (entry.value === null || entry.value === undefined || entry.value === '') continue;
      if (!entry.approved) throw new Error(`Refusing to type unapproved browser field: ${entry.name}`);
      results.push(await this.setField(entry.name, entry.value));
    }
    return Object.freeze({ ok: results.every((result) => result.ok), fields: Object.freeze(results) });
  }

  async click(selector) {
    return await this.evaluate(`(() => { const el=document.querySelector(${jsString(selector)}); if(!el)return {ok:false,reason:'NOT_FOUND'}; el.click(); return {ok:true}; })()`);
  }

  async select(name, value) {
    return this.setField(name, value);
  }

  async upload(name, filePath) {
    await this.start();
    const { root } = await this.cdp.send('DOM.getDocument', { depth: 1, pierce: true });
    const selector = `input[type="file"][name=${JSON.stringify(String(name))}],input[type="file"]#${String(name).replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`;
    const { nodeId } = await this.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return Object.freeze({ ok: false, reason: 'FILE_FIELD_NOT_FOUND', name });
    await this.cdp.send('DOM.setFileInputFiles', { nodeId, files: [String(filePath)] });
    return Object.freeze({ ok: true, name, filePath: String(filePath) });
  }

  async submitForm(formId) {
    const navigation = this.cdp.once('Page.loadEventFired', 3000).catch(() => null);
    const result = await this.evaluate(`(() => {
      const id = ${jsString(formId)};
      const forms = Array.from(document.forms);
      const form = forms.find((f, i) => f.id === id || f.name === id || ('form-' + (i+1)) === id);
      if (!form) return { ok:false, reason:'FORM_NOT_FOUND', formId:id };
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
      return { ok:true, formId:id, destination:form.action };
    })()`);
    await navigation;
    await delay(50);
    return Object.freeze({ ...result, page: await this.snapshot() });
  }
}

export default ChromeDevToolsBrowserExecutor;
