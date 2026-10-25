import assert from 'node:assert/strict';
import { createPolicy, specification, rewardsFor } from '../research/policy.mjs';
import { seedFor } from '../synthetic/random.mjs';
import { combat } from './combat.mjs';
import { PLANS, sha, makeSchedule, makeObservation, planById, validateDecision, statisticalDecision, randomDecision } from './design.mjs';

export const SPEC = specification({roster:['ranger']});
export function fight(policy, scheduled, planId, round, {capture=false}={}) {
  const plan = planById(planId);
  const choice = policy.request({op:'choose',role:'ranger',context:'arena',allowed:plan.action?[plan.action]:['aim','lead'],baseline:false});
  const result = combat(scheduled.scenario,['ranger'],{ranger:choice.action},{tuning:plan.tuning,capture});
  const physical = capture ? result.row : result;
  const feedback = rewardsFor(SPEC,physical.enemies)[0];
  const accepted = policy.request({op:'feedback',decision_id:choice.decision_id,reward:feedback.reward,observed:feedback.observed});
  const after = policy.request({op:'commit'});
  const row = {round,planId,choice,physical,feedback:{...feedback,accepted:accepted.accepted},policy:after.cells};
  if(capture) row.frames = result.frames;
  return row;
}

export function warmup(c, protocol) {
  const policySeed = seedFor(c.seed,'agentic-ranger-policy-v1');
  const policy = createPolicy(policySeed,SPEC);
  try {
    const initial = policy.request({op:'snapshot'}), schedule = makeSchedule(c,protocol);
    const rows = schedule.map((s,i)=>fight(policy,s,'baseline',i+1));
    return {policySeed,initial,schedule,rows,checkpoint:policy.request({op:'snapshot'})};
  } finally {policy.dispose();}
}

export async function runBranch(c, protocol, training, history, arm, replicate, decide) {
  const policy = createPolicy(training.policySeed,SPEC);
  try {
    policy.request({op:'restore',snapshot:training.checkpoint});
    const initial = policy.request({op:'snapshot'});
    assert.deepEqual(initial,training.checkpoint);
    const rows=[],schedule=makeSchedule(c,protocol,history);
    let memory='',currentPlanId='baseline';
    for(let i=0;i<schedule.length;i++) {
      const observation=makeObservation([...training.rows,...rows.map(r=>r.fight)],policy.request({op:'inspect'}),currentPlanId,memory);
      let call=null,decision;
      if(arm==='agent') {
        call=await decide({caseSeed:c.seed,history,replicate,round:i+1},observation);
        try {if(call.status!=='ok') throw Error('Provider failed'); decision=validateDecision(call.decision);}
        catch {decision={planId:currentPlanId,reason:'Recorded provider failure: retain previous plan.',prediction:'No new prediction.',memory};}
      } else if(arm==='statistical') decision=statisticalDecision(observation);
      else if(arm==='random') decision=randomDecision(seedFor(c.seed,history,'agentic-random'),i);
      else {assert.equal(arm,'retained');decision={planId:'baseline',reason:'Ordinary learner only.',prediction:'No planner prediction.',memory:''};}
      validateDecision(decision);
      const changed=decision.planId!==currentPlanId;
      memory=decision.memory;currentPlanId=decision.planId;
      const played=fight(policy,schedule[i],currentPlanId,protocol.warmupRounds+i+1,{capture:i===0||i===schedule.length-1});
      rows.push({postRound:i+1,observation,observationSha256:sha(observation),call,decision,changed,fight:played});
    }
    return {arm,replicate,initial,schedule,rows,final:policy.request({op:'snapshot'})};
  } finally {policy.dispose();}
}

export function summarize(results) {
  const avg=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
  const pairs=[],calls=[];
  let scoredFights=0;
  for(const c of results.cases) {
    scoredFights+=c.training.rows.length;
    for(const [history,branches] of Object.entries(c.histories)) {
      const arms={};
      for(const b of branches) {
        const damage=b.rows.map(r=>r.fight.physical.damage);
        const row={replicate:b.replicate,meanDamage:avg(damage),totalDamage:damage.reduce((a,b)=>a+b,0),
          playerDefeats:b.rows.filter(r=>r.fight.physical.result==='down').length,
          npcSurvivals:b.rows.filter(r=>r.fight.physical.enemies[0].hp>0).length,
          changes:b.rows.filter(r=>r.changed).length,
          failures:b.rows.filter(r=>r.call&&r.call.status!=='ok').length,
          damage,plans:b.rows.map(r=>r.decision.planId)};
        (arms[b.arm]??=[]).push(row);
        calls.push(...b.rows.map(r=>r.call).filter(Boolean));scoredFights+=b.rows.length;
      }
      const agent=avg(arms.agent.map(a=>a.meanDamage));
      pairs.push({seed:c.seed,index:c.index,history,arms,agentMeanDamage:agent,
        versusRetained:agent-arms.retained[0].meanDamage,
        versusStatistical:agent-arms.statistical[0].meanDamage,
        versusRandom:agent-arms.random[0].meanDamage});
    }
  }
  const byHistory=Object.fromEntries(results.protocol.histories.map(h=>{
    const rows=pairs.filter(p=>p.history===h);
    return [h,Object.fromEntries(['agentMeanDamage','versusRetained','versusStatistical','versusRandom'].map(k=>[k,avg(rows.map(p=>p[k]))]))];
  }));
  const durations=calls.map(c=>c.metadata?.durationMs??0).sort((a,b)=>a-b);
  return {schema:1,id:results.protocol.id,scope:results.protocol.status,independentDevelopmentCases:results.cases.length,
    scoredFights,plannedCalls:results.protocol.agent.maxCalls,recordedCalls:calls.length,
    successfulCalls:calls.filter(c=>c.status==='ok').length,failedCalls:calls.filter(c=>c.status!=='ok').length,
    reportedCostUsd:calls.every(c=>Number.isFinite(c.metadata?.costUsd))?calls.reduce((s,c)=>s+c.metadata.costUsd,0):null,
    knownReportedCostUsd:calls.reduce((s,c)=>s+(c.metadata?.costUsd??0),0),
    unknownCostCalls:calls.filter(c=>!Number.isFinite(c.metadata?.costUsd)).length,
    meanLatencyMs:durations.length?avg(durations):0,p95LatencyMs:durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??0,
    models:[...new Set(calls.flatMap(c=>c.metadata?.models??[]))],byHistory,pairs,
    limits:results.protocol.claimLimits};
}
