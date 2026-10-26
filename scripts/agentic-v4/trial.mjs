import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createPolicy } from '../research/policy.mjs';
import { SPEC, fight } from '../agentic-v1/trial.mjs';
import { warmup as previousWarmup } from '../agentic-v2/trial.mjs';
import { schedule, sha, mean, decisionFrom } from '../agentic-v2/design.mjs';
import { surveySchedule, observation, algorithmDecision } from './design.mjs';

export function prepare(c, p) {
  const warmup = previousWarmup(c, p);
  const policy = createPolicy(warmup.policySeed, SPEC);
  try {
    policy.request({op:'restore', snapshot:warmup.checkpoint});
    const survey = surveySchedule(c, p);
    const rows = survey.map((s, i) => fight(policy, s, s.planId, warmup.rows.length + i + 1));
    return {policySeed:warmup.policySeed, warmup, survey:{schedule:survey, rows},
      rows:[...warmup.rows, ...rows], checkpoint:policy.request({op:'snapshot'})};
  } finally { policy.dispose(); }
}
export function initialObservation(training, p) {
  return observation(training.rows, training.rows.at(-1).planId, '', p);
}
export function startBranch(c, p, training, history, arm, replicate=0) {
  return {arm, replicate, initial:structuredClone(training.checkpoint),
    schedule:schedule(c, p, history), rows:[], final:structuredClone(training.checkpoint)};
}
export function nextObservation(training, branch, p) {
  const last = branch.rows.at(-1);
  return last ? observation([...training.rows, ...branch.rows.map(r => r.fight)], last.fight.planId, last.decision.memory, p)
    : initialObservation(training, p);
}
export function advance(p, training, branch, {call=null, decision=null}={}) {
  const i = branch.rows.length, obs = nextObservation(training, branch, p);
  assert.ok(i < branch.schedule.length, 'Branch is already complete');
  if (call) {
    assert.deepEqual(call.observation, obs, 'Call observation differs from own history');
    decision = decisionFrom(call.response, obs.currentPlanId, obs.memory);
  } else assert.deepEqual(decision, algorithmDecision(obs, p.selector), 'Algorithm decision differs');
  const policy = createPolicy(training.policySeed, SPEC);
  try {
    policy.request({op:'restore', snapshot:branch.final});
    const played = fight(policy, branch.schedule[i], decision.planId, training.rows.length+i+1,
      {capture:i===0 || i===branch.schedule.length-1});
    branch.rows.push({postRound:i+1, observation:obs, observationSha256:sha(obs), callId:call?.id ?? null,
      decision, changed:decision.planId!==obs.currentPlanId, fight:played});
    branch.final = policy.request({op:'snapshot'});
  } finally { policy.dispose(); }
}
export function fixedBranch(c, p, training, history, planId, {arm='fixed',replicate=0,originCallId=null}={}) {
  const branch = startBranch(c,p,training,history,arm,replicate);
  const policy = createPolicy(training.policySeed,SPEC);
  try {
    policy.request({op:'restore',snapshot:training.checkpoint});
    branch.rows=branch.schedule.map((s,i)=>fight(policy,s,planId,training.rows.length+i+1,{capture:i===0||i===branch.schedule.length-1}));
    branch.final=policy.request({op:'snapshot'});
    return {...branch,planId,originCallId};
  } finally {policy.dispose();}
}
export function algorithmBranch(c,p,training,history,{onTiming=null}={}) {
  const branch=startBranch(c,p,training,history,'algorithm');
  for(let i=0;i<p.postRounds;i++) {
    const obs=nextObservation(training,branch,p),start=performance.now(),decision=algorithmDecision(obs,p.selector);
    onTiming?.({round:i+1,durationMs:performance.now()-start});
    advance(p,training,branch,{decision});
  }
  return branch;
}
export async function agentBranch(c,p,training,history,replicate,decide) {
  const b=startBranch(c,p,training,history,'agent',replicate);
  for(let round=1;round<=p.postRounds;round++) {
    const call=await decide({caseSeed:c.seed,caseIndex:c.index,history,replicate,arm:'agent',round},nextObservation(training,b,p));
    advance(p,training,b,{call});
  }
  return b;
}
export function summarize(r) {
  const pairs=[];let preparationFights=0,evaluationFights=0;
  for(const c of r.cases) {
    preparationFights+=c.training.rows.length;
    for(const [history,branches] of Object.entries(c.histories)) {
      const arms={};
      for(const b of branches) {
        const fights=b.rows.map(x=>x.fight??x),damage=fights.map(x=>x.physical.damage),plans=fights.map(x=>x.planId);
        (arms[b.arm]??=[]).push({replicate:b.replicate,planId:b.planId??null,meanDamage:mean(damage),damage,plans,
          totalDamage:damage.reduce((a,b)=>a+b,0),subsequentSwitches:plans.filter((x,i)=>i>0&&x!==plans[i-1]).length,
          playerDefeats:fights.filter(x=>x.physical.result==='down').length,npcSurvivals:fights.filter(x=>x.physical.enemies[0].hp>0).length});
        evaluationFights+=fights.length;
      }
      const means=Object.fromEntries(Object.entries(arms).map(([k,v])=>[k,mean(v.map(x=>x.meanDamage))]));
      const paired=arms.agent.map(a=>({replicate:a.replicate,agentVsAlgorithm:a.meanDamage-means.algorithm,
        agentVsInitial:a.meanDamage-arms['agent-initial'].find(x=>x.replicate===a.replicate).meanDamage,
        agentVsAlgorithmInitial:a.meanDamage-means['algorithm-initial'],
        heldAgentVsHeldAlgorithm:arms['agent-initial'].find(x=>x.replicate===a.replicate).meanDamage-means['algorithm-initial']}));
      const surveyDamage=c.training.survey.rows.reduce((n,x)=>n+x.physical.damage,0);
      const cumulativeMeans=Object.fromEntries(Object.entries(means).map(([k,v])=>[k,(surveyDamage+v*r.protocol.postRounds)/(c.training.survey.rows.length+r.protocol.postRounds)]));
      pairs.push({seed:c.seed,index:c.index,history,arms,means,cumulativeMeans,surveyDamage,paired,differences:{agentVsAlgorithm:means.agent-means.algorithm,
        agentVsInitial:means.agent-means['agent-initial'],algorithmVsInitial:means.algorithm-means['algorithm-initial'],
        agentVsFixed:means.agent-means.fixed,agentVsRetained:means.agent-means.retained,
        agentVsAlgorithmInitial:means.agent-means['algorithm-initial'],heldAgentVsHeldAlgorithm:means['agent-initial']-means['algorithm-initial']}});
    }
  }
  const aggregate=ps=>({cumulativeMeans:Object.fromEntries(Object.keys(ps[0].cumulativeMeans).map(k=>[k,mean(ps.map(x=>x.cumulativeMeans[k]))])),means:Object.fromEntries(Object.keys(ps[0].means).map(k=>[k,mean(ps.map(x=>x.means[k]))])),
    differences:Object.fromEntries(Object.keys(ps[0].differences).map(k=>[k,mean(ps.map(x=>x.differences[k]))]))});
  const costs=r.calls.map(x=>x.response.metadata.costUsd),durations=r.calls.map(x=>x.response.metadata.durationMs).sort((a,b)=>a-b);
  const overall=aggregate(pairs),gate=r.protocol.advanceGates;
  const contrasts=['agentVsAlgorithm','agentVsAlgorithmInitial','agentVsInitial'];
  const perReplicate=Array.from({length:r.protocol.agentReplicates},(_,i)=>({replicate:i+1,...Object.fromEntries([...contrasts,'heldAgentVsHeldAlgorithm'].map(k=>[k,mean(pairs.map(x=>x.paired.find(y=>y.replicate===i+1)[k]))]))}));
  const reviewChecks={gainOverActiveAlgorithm:overall.differences.agentVsAlgorithm>=gate.agentVsAlgorithmHp,
    gainOverHeldAlgorithm:overall.differences.agentVsAlgorithmInitial>=gate.agentVsAlgorithmInitialHp,
    gainOverOwnInitial:overall.differences.agentVsInitial>=gate.agentVsInitialHp,
    positiveEachReplicate:perReplicate.every(x=>contrasts.every(k=>x[k]>0)),
    cellHarm: pairs.every(x=>contrasts.every(k=>x.differences[k]>=-gate.maximumCellHarmHp))};
  const heldChecks={gain:overall.differences.heldAgentVsHeldAlgorithm>=gate.agentVsAlgorithmInitialHp,
    positiveEachReplicate:perReplicate.every(x=>x.heldAgentVsHeldAlgorithm>0),
    cellHarm:pairs.every(x=>x.differences.heldAgentVsHeldAlgorithm>=-gate.maximumCellHarmHp)};
  const algorithmChecks={gain:overall.differences.algorithmVsInitial>=1,cellHarm:pairs.every(x=>x.differences.algorithmVsInitial>=-gate.maximumCellHarmHp)};
  const advanceReview=Object.values(reviewChecks).every(Boolean),advanceHeld=!advanceReview&&Object.values(heldChecks).every(Boolean);
  const algorithmDurations=(r.algorithmRuntime??[]).map(x=>x.durationMs).sort((a,b)=>a-b);
  return {schema:1,id:r.protocol.id,independentDevelopmentCases:r.cases.length,preparationFights,evaluationFights,
    scoredFights:preparationFights+evaluationFights,recordedCalls:r.calls.length,successfulCalls:r.calls.filter(x=>x.response.status==='ok').length,
    failedCalls:r.calls.filter(x=>x.response.status!=='ok').length,knownReportedCostUsd:costs.filter(Number.isFinite).reduce((a,b)=>a+b,0),
    reportedCostUsd:costs.every(Number.isFinite)?costs.reduce((a,b)=>a+b,0):null,unknownCostCalls:costs.filter(x=>!Number.isFinite(x)).length,
    meanLatencyMs:mean(durations),p95LatencyMs:durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??null,
    models:[...new Set(r.calls.flatMap(x=>x.response.metadata.models??[]))],
    algorithmSelectionCalls:algorithmDurations.length,meanAlgorithmLatencyMs:mean(algorithmDurations),p95AlgorithmLatencyMs:algorithmDurations[Math.max(0,Math.ceil(algorithmDurations.length*.95)-1)]??null,
    byHistory:Object.fromEntries(r.protocol.histories.map(h=>[h,aggregate(pairs.filter(x=>x.history===h))])),overall,pairs,perReplicate,
    decision:{reviewChecks,heldChecks,algorithmChecks,advanceContinuousReview:advanceReview,advanceHeldAgent:advanceHeld,
      algorithmReviewEarned:Object.values(algorithmChecks).every(Boolean),agentDevelopmentStop:!advanceReview&&!advanceHeld},limits:r.protocol.claimLimits};
}
