import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_PATH = process.env.SYNTHIA_BROWSER_MEMORY_FILE || join(homedir(), '.synthia', 'browser-task-memory.json');
const clone = (value) => JSON.parse(JSON.stringify(value));
const freeze = (value) => Object.freeze(value);

function siteKey(url) {
  try { return new URL(String(url || 'https://synthia.local/')).origin; }
  catch { return String(url || 'unknown-site'); }
}
function pageKey(title) { return String(title || 'untitled').trim().toLowerCase(); }
function taskKey(route) { return String(route?.task || 'navigation-workflow'); }
function cleanRoute(route = {}) { return { kind: route.kind || 'browser', task: route.task || 'navigation-workflow', dimension: route.dimension || null, reason: route.reason || null }; }

export class BrowserTaskMemory {
  constructor({ path = DEFAULT_PATH } = {}) {
    this.path = path;
    this.loaded = false;
    this.state = { schemaVersion: 1, sequence: 0, sites: {}, tasks: {} };
  }

  async load() {
    if (this.loaded) return this;
    this.loaded = true;
    if (!this.path) return this;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      if (parsed?.schemaVersion === 1) this.state = { schemaVersion: 1, sequence: parsed.sequence || 0, sites: parsed.sites || {}, tasks: parsed.tasks || {} };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return this;
  }

  recommendActions({ url, page, route } = {}) {
    const site = this.state.sites[siteKey(url || page?.url)];
    const learned = site?.pages?.[pageKey(page?.title)]?.[taskKey(route)] || [];
    return freeze([...learned].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)).map((item) => item.text));
  }

  async recordNavigation({ url, route, trace = [], goalPage = null } = {}) {
    await this.load();
    const key = siteKey(url || goalPage?.url);
    const site = this.state.sites[key] ||= { pages: {}, journeys: [] };
    for (const step of trace) {
      const page = site.pages[pageKey(step.pageTitle)] ||= {};
      const bucket = page[taskKey(route)] ||= [];
      let action = bucket.find((item) => item.text === step.actionText);
      if (!action) { action = { text: step.actionText, count: 0, sequence: 0 }; bucket.push(action); }
      action.count += 1;
      action.sequence = ++this.state.sequence;
    }
    if (trace.length) {
      site.journeys.push({
        task: taskKey(route),
        sequence: ++this.state.sequence,
        actions: trace.map((step) => ({ pageTitle: step.pageTitle, actionText: step.actionText })),
        goalTitle: goalPage?.title || null
      });
      if (site.journeys.length > 50) site.journeys.splice(0, site.journeys.length - 50);
    }
    await this.save();
    return this.siteSnapshot(key);
  }

  async checkpointTask({ taskId = null, url, message, route, status, unresolved = [], navigation = null, generatedFields = [] } = {}) {
    await this.load();
    const id = taskId || `browser-task-${++this.state.sequence}`;
    const prior = this.state.tasks[id] || {};
    const record = {
      id,
      sequence: ++this.state.sequence,
      url: String(url || prior.url || ''),
      message: String(message || prior.message || ''),
      route: cleanRoute(route || prior.route || { task: 'navigation-workflow' }),
      status: String(status || prior.status || 'checkpointed'),
      unresolved: [...unresolved],
      navigationTrace: (navigation?.trace || prior.navigationTrace || []).map((step) => ({ pageTitle: step.pageTitle, actionText: step.actionText })),
      generatedFields: generatedFields.map((field) => ({ name: field.name, status: field.status, evidenceRefs: [...(field.evidenceRefs || [])] }))
    };
    this.state.tasks[id] = record;
    await this.save();
    return freeze(clone(record));
  }

  async updateTask(taskId, patch = {}) {
    await this.load();
    const prior = this.state.tasks[taskId];
    if (!prior) throw new Error(`Unknown browser task: ${taskId}`);
    const record = { ...prior, ...clone(patch), id: taskId, sequence: ++this.state.sequence };
    if (patch.unresolved) record.unresolved = [...patch.unresolved];
    this.state.tasks[taskId] = record;
    await this.save();
    return freeze(clone(record));
  }

  async getTask(taskId) {
    await this.load();
    const record = this.state.tasks[taskId];
    return record ? freeze(clone(record)) : null;
  }

  siteSnapshot(urlOrKey) {
    const key = String(urlOrKey || '').includes('://') ? siteKey(urlOrKey) : urlOrKey;
    const site = this.state.sites[key];
    return site ? freeze(clone(site)) : null;
  }

  async save() {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(this.state, null, 2));
    await rename(tmp, this.path);
  }
}

export default BrowserTaskMemory;
