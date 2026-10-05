import { sha256 } from './hash.mjs';

export class SurvivalPool {
  constructor(dimension) {
    this.dimension = dimension;
    this.candidates = new Map();
    this.peerReports = [];
  }

  register(port) {
    if (port.dimension !== this.dimension) throw new Error('candidate dimension mismatch');
    if (!this.candidates.has(port.id)) {
      this.candidates.set(port.id, { port, pulls: 0, reward: 0, evidence: [] });
    }
    return port;
  }

  observe(candidateId, reward, evidence = null) {
    const row = this.candidates.get(candidateId);
    if (!row) throw new Error(`unknown candidate ${candidateId}`);
    const bounded = Math.max(0, Math.min(1, Number(reward)));
    row.pulls += 1;
    row.reward += bounded;
    if (evidence) row.evidence.push(evidence);
    return this.stats(candidateId);
  }

  choose() {
    const rows = [...this.candidates.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (!rows.length) throw new Error(`no model candidates registered for ${this.dimension}`);
    const untried = rows.find(([, row]) => row.pulls === 0);
    if (untried) return untried[1].port;
    const total = rows.reduce((n, [, row]) => n + row.pulls, 0);
    let best = null;
    for (const [id, row] of rows) {
      const mean = row.reward / row.pulls;
      const ucb = mean + Math.sqrt((2 * Math.log(total)) / row.pulls);
      if (!best || ucb > best.ucb || (ucb === best.ucb && id < best.id)) best = { id, ucb, port: row.port };
    }
    return best.port;
  }

  stats(candidateId) {
    const row = this.candidates.get(candidateId);
    if (!row) return null;
    return Object.freeze({
      id: candidateId,
      pulls: row.pulls,
      meanReward: row.pulls ? row.reward / row.pulls : null,
      evidenceCount: row.evidence.length,
    });
  }

  gossipSummary() {
    const candidates = [...this.candidates.keys()].sort().map((id) => this.stats(id));
    const payload = { dimension: this.dimension, candidates };
    return Object.freeze({ ...payload, digest: sha256(payload) });
  }

  ingestGossip(report) {
    if (!report || report.dimension !== this.dimension) return { accepted: false, reason: 'DIMENSION_MISMATCH' };
    const payload = { dimension: report.dimension, candidates: report.candidates };
    if (sha256(payload) !== report.digest) return { accepted: false, reason: 'DIGEST_MISMATCH' };
    this.peerReports.push(Object.freeze({ ...report }));
    return { accepted: true, peerReports: this.peerReports.length };
  }
}
