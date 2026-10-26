import assert from 'node:assert/strict';
import { createPolicy } from '../research/policy.mjs';
import { SPEC, fight } from '../agentic-v1/trial.mjs';
import { warmup, fixedBranch } from '../agentic-v2/trial.mjs';
import { sha, mean, schedule, observation, decisionFrom, validateDecision, initialGate, applyGate } from './design.mjs';
export { warmup, fixedBranch };

export function initialObservation(training) { return observation(training.rows, 'baseline', '', true); }
export function startAgent(c, p, training, history, arm, replicate) {
  assert.ok(['immediate', 'gated'].includes(arm));
  return { arm, replicate, initial: structuredClone(training.checkpoint), schedule: schedule(c, p, history), rows: [], final: structuredClone(training.checkpoint), gate: initialGate() };
}
export function nextObservation(training, branch) {
  const last = branch.rows.at(-1);
  return last ? observation([...training.rows, ...branch.rows.map(x => x.fight)], last.fight.planId, last.decision.memory) : initialObservation(training);
}
export function advanceAgent(p, training, branch, call) {
  const i = branch.rows.length, obs = nextObservation(training, branch);
  assert.ok(i < branch.schedule.length); assert.deepEqual(call.observation, obs, 'Call observation mismatch');
  const currentPlanId = branch.rows.at(-1)?.fight.planId ?? 'baseline';
  const decision = decisionFrom(call.response, currentPlanId, branch.rows.at(-1)?.decision.memory ?? '');
  let successful = call.response.status === 'ok';
  try { validateDecision(call.response.decision); } catch { successful = false; }
  const gate = applyGate(branch.gate, currentPlanId, decision, successful, i === 0, branch.arm, p.gate);
  const policy = createPolicy(training.policySeed, SPEC);
  try {
    policy.request({op: 'restore', snapshot: branch.final});
    const played = fight(policy, branch.schedule[i], gate.executedPlanId, p.warmupRounds + i + 1, {capture: i === 0 || i === branch.schedule.length - 1});
    if (played.feedback.observed) gate.after.observedOnPlan++;
    branch.rows.push({postRound: i + 1, observation: obs, observationSha256: sha(obs), callId: call.id, decision, gate, changed: gate.changed, fight: played});
    branch.gate = structuredClone(gate.after); branch.final = policy.request({op: 'snapshot'});
  } finally { policy.dispose(); }
}
export async function agentBranch(c, p, training, history, arm, replicate, initialCall, decide) {
  const branch = startAgent(c, p, training, history, arm, replicate);
  for (let i = 0; i < branch.schedule.length; i++) {
    const call = i === 0 ? initialCall : await decide({caseSeed: c.seed, caseIndex: c.index, history, replicate, arm, round: i + 1}, nextObservation(training, branch));
    advanceAgent(p, training, branch, call);
  }
  return branch;
}
export function summarize(r) {
  const pairs = []; let evaluationFights = 0;
  for (const c of r.cases) {
    evaluationFights += c.training.rows.length;
    for (const [history, branches] of Object.entries(c.histories)) {
      const arms = {};
      for (const b of branches) {
        const fights = b.rows.map(x => x.fight ?? x), damage = fights.map(x => x.physical.damage), plans = fights.map(x => x.planId);
        (arms[b.arm] ??= []).push({replicate: b.replicate, planId: b.planId ?? null, meanDamage: mean(damage), damage, plans,
          subsequentSwitches: plans.filter((x, i) => i > 0 && x !== plans[i - 1]).length,
          proposalsToSwitch: b.rows.filter((x, i) => i > 0 && x.decision && x.decision.planId !== fights[i - 1].planId).length,
          blockedProposals: b.rows.filter(x => x.gate?.reason === 'gate-wait').length,
          playerDefeats: fights.filter(x => x.physical.result === 'down').length,
          npcSurvivals: fights.filter(x => x.physical.enemies[0].hp > 0).length});
        evaluationFights += fights.length;
      }
      const values = Object.fromEntries(Object.entries(arms).map(([k,v]) => [k, mean(v.map(x => x.meanDamage))]));
      const paired = arms.gated.map(g => ({replicate: g.replicate,
        gatedVsImmediate: g.meanDamage - arms.immediate.find(x => x.replicate === g.replicate).meanDamage,
        gatedVsInitial: g.meanDamage - arms.initial.find(x => x.replicate === g.replicate).meanDamage}));
      pairs.push({seed: c.seed, index: c.index, history, arms, means: values, paired,
        differences: {gatedVsImmediate: values.gated-values.immediate, gatedVsInitial: values.gated-values.initial, gatedVsFixed: values.gated-values.fixed, gatedVsRetained: values.gated-values.retained}});
    }
  }
  const aggregate = ps => ({means: Object.fromEntries(Object.keys(ps[0].means).map(k => [k, mean(ps.map(x => x.means[k]))])),
    differences: Object.fromEntries(Object.keys(ps[0].differences).map(k => [k, mean(ps.map(x => x.differences[k]))]))});
  const durations = r.calls.map(x => x.response.metadata.durationMs).filter(Number.isFinite).sort((a,b) => a-b);
  const costs = r.calls.map(x => x.response.metadata.costUsd);
  return {schema: 1, id: r.protocol.id, independentDevelopmentCases: r.cases.length, evaluationFights, scoredFights: evaluationFights,
    reusedCalibrationFights: 1384, recordedCalls: r.calls.length, successfulCalls: r.calls.filter(x => x.response.status === 'ok').length,
    failedCalls: r.calls.filter(x => x.response.status !== 'ok').length, knownReportedCostUsd: costs.filter(Number.isFinite).reduce((a,b) => a+b,0),
    reportedCostUsd: costs.every(Number.isFinite) ? costs.reduce((a,b) => a+b,0) : null, unknownCostCalls: costs.filter(x => !Number.isFinite(x)).length,
    meanLatencyMs: mean(durations), p95LatencyMs: durations[Math.max(0,Math.ceil(durations.length*.95)-1)] ?? null,
    models: [...new Set(r.calls.flatMap(x => x.response.metadata.models ?? []))],
    byHistory: Object.fromEntries(r.protocol.histories.map(h => [h, aggregate(pairs.filter(x => x.history === h))])), overall: aggregate(pairs), pairs, limits: r.protocol.claimLimits};
}
