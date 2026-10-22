/**
 * Synthia execution-loop orchestrator.
 * Pure JS. Mesh-native. No capability lookup table.
 *
 * probe -> analyze/address -> gap -> mesh synthesis -> retry -> learn -> repeat
 */
import { MeshRuleSynthesizer } from './mesh-rule-synthesizer.js';

export class ExecutionLoopOrchestrator {
  constructor({ mesh, seed = 18091999, maxRepairs = 32 } = {}) {
    if (!mesh) throw new TypeError('ExecutionLoopOrchestrator requires the active capability mesh');
    this.mesh = mesh;
    this.maxRepairs = maxRepairs;
    this.synthesizer = new MeshRuleSynthesizer({ mesh, seed });
  }

  async execute({ artifact, probe, analyze, address, retry, verify }) {
    if (typeof probe !== 'function' || typeof retry !== 'function') {
      throw new TypeError('probe and retry are required');
    }

    const trace = [];
    let observation = await probe(artifact);
    trace.push({ phase:'probe', observation });
    if (observation?.ok && (!verify || await verify(observation, artifact))) {
      return { ok:true, path:'direct-probe', observation, trace };
    }

    const analysis = typeof analyze === 'function'
      ? await analyze(artifact, observation)
      : (observation?.analysis || {});
    const canonicalAddress = typeof address === 'function'
      ? await address({ artifact, analysis, observation })
      : (analysis?.canonicalAddress || null);

    for (let cycle = 0; cycle < this.maxRepairs; cycle++) {
      const gap = this.gapFrom({ artifact, observation, analysis, canonicalAddress, cycle });
      trace.push({ phase:'gap', cycle, gap });

      const synthesis = await this.synthesizer.synthesize(gap, {
        probeCandidate: async (execute, candidate) => {
          const candidateObservation = await retry({
            artifact, execute, candidate, analysis, canonicalAddress,
            priorObservation: observation, probeOnly: true
          });
          return this.scoreObservation(observation, candidateObservation);
        }
      });
      trace.push({ phase:'synthesis', cycle, synthesis });
      if (!synthesis.ok) return { ok:false, path:'mesh-synthesis-stalled', observation, analysis, canonicalAddress, synthesis, trace };

      const next = await retry({
        artifact,
        execute:synthesis.installed.execute,
        candidate:synthesis.winner,
        analysis,
        canonicalAddress,
        priorObservation:observation,
        probeOnly:false
      });
      trace.push({ phase:'retry', cycle, observation:next });

      if (next?.ok && (!verify || await verify(next, artifact))) {
        return { ok:true, path:'mesh-derived-execution', observation:next, analysis, canonicalAddress, synthesis, repairs:cycle+1, trace };
      }
      observation = next;
    }
    return { ok:false, path:'repair-budget-exhausted', observation, analysis, canonicalAddress, trace };
  }

  gapFrom({ observation, analysis, canonicalAddress, cycle }) {
    const required = observation?.missingCapabilities || observation?.requirements || analysis?.missingCapabilities || [];
    const effects = observation?.effects || analysis?.behavior || analysis?.effects || [];
    return {
      targetGate: canonicalAddress?.gate ?? null,
      canonicalAddress,
      requiredCapability: required.length ? required.join('+') : `observed-gap-${cycle}`,
      requirements: required,
      evidence: observation,
      probe: observation,
      behavioralContract: {
        before: observation?.before ?? null,
        operation: observation?.operation ?? analysis?.operation ?? null,
        after: observation?.expectedAfter ?? null,
        effects,
      },
      analysis,
    };
  }

  scoreObservation(before = {}, after = {}) {
    const beforeMissing = new Set(before?.missingCapabilities || before?.requirements || []);
    const afterMissing = new Set(after?.missingCapabilities || after?.requirements || []);
    let satisfied = 0;
    for (const x of beforeMissing) if (!afterMissing.has(x)) satisfied++;
    const progress = Number(after?.progress ?? (beforeMissing.size ? satisfied / beforeMissing.size : (after?.ok ? 1 : 0))) || 0;
    return {
      ok: Boolean(after?.ok || progress > 0 || satisfied > 0),
      progress,
      behaviorMatch: Number(after?.behaviorMatch ?? 0) || 0,
      newFailures: Math.max(0, afterMissing.size - beforeMissing.size),
      observation: after,
    };
  }
}

export default ExecutionLoopOrchestrator;

