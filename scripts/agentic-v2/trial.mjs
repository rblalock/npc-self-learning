import assert from 'node:assert/strict';
import { createPolicy } from '../research/policy.mjs';
import { seedFor } from '../synthetic/random.mjs';
import { SPEC, fight } from '../agentic-v1/trial.mjs';
import { PLANS,sha,mean,schedule,observation,decisionFrom,selectFixed } from './design.mjs';

export function warmup(c,p,partition='evaluation',replicate=0) {
  const policySeed=seedFor(c.seed,c.index,'agentic-policy-v2',partition,replicate);
  const policy=createPolicy(policySeed,SPEC);
  try {
    const initial=policy.request({op:'snapshot'}),s=schedule(c,p,'warmup',partition,replicate);
    const rows=s.map((item,i)=>fight(policy,item,'baseline',i+1));
    return {policySeed,initial,schedule:s,rows,checkpoint:policy.request({op:'snapshot'})};
  } finally {policy.dispose();}
}

export function fixedBranch(c,p,training,history,planId,{partition='evaluation',replicate=0,arm='fixed',capture=true,originCallId=null}={}) {
  const policy=createPolicy(training.policySeed,SPEC);
  try {
    policy.request({op:'restore',snapshot:training.checkpoint});
    const initial=policy.request({op:'snapshot'}),s=schedule(c,p,history,partition,partition==='calibration'?replicate:0);
    const rows=s.map((item,i)=>fight(policy,item,planId,p.warmupRounds+i+1,{capture:capture&&(i===0||i===s.length-1)}));
    return {arm,replicate,planId,originCallId,initial,schedule:s,rows,final:policy.request({op:'snapshot'})};
  } finally {policy.dispose();}
}

export function calibrate(c,p) {
  const batches=Array.from({length:p.calibrationReplicates},(_,replicate)=>{
    const training=warmup(c,p,'calibration',replicate),histories={};
    for(const h of p.histories)histories[h]=PLANS.map(plan=>fixedBranch(c,p,training,h,plan.id,{partition:'calibration',replicate,capture:false}));
    return {replicate,training,histories};
  });
  const data={seed:c.seed,index:c.index,batches};
  return {data,selection:selectFixed(data)};
}

export function initialObservation(training) {return observation(training.rows,'baseline','','initial');}

export function startAgent(c,p,training,history,arm,replicate) {
  assert.ok(['full','recent'].includes(arm));
  return {arm,replicate,initial:structuredClone(training.checkpoint),schedule:schedule(c,p,history),rows:[],final:structuredClone(training.checkpoint)};
}

export function nextObservation(training,branch) {
  const last=branch.rows.at(-1);
  return last?observation([...training.rows,...branch.rows.map(x=>x.fight)],last.decision.planId,branch.arm==='full'?last.decision.memory:'',branch.arm):initialObservation(training);
}

export function advanceAgent(p,training,branch,call) {
  const policy=createPolicy(training.policySeed,SPEC);
  try {
    policy.request({op:'restore',snapshot:branch.final});
    const i=branch.rows.length,obs=nextObservation(training,branch),last=branch.rows.at(-1);
    assert.ok(i<branch.schedule.length);assert.deepEqual(call.observation,obs,'Call observation mismatch');
    const currentPlanId=last?.decision.planId??'baseline',memory=branch.arm==='full'?(last?.decision.memory??''):'';
    const decision=decisionFrom(call.response,currentPlanId,memory),changed=decision.planId!==currentPlanId;
    const played=fight(policy,branch.schedule[i],decision.planId,p.warmupRounds+i+1,{capture:i===0||i===branch.schedule.length-1});
    branch.rows.push({postRound:i+1,observation:obs,observationSha256:sha(obs),callId:call.id,decision,changed,fight:played});
    branch.final=policy.request({op:'snapshot'});
  } finally {policy.dispose();}
}

export async function agentBranch(c,p,training,history,arm,replicate,initialCall,decide) {
  const branch=startAgent(c,p,training,history,arm,replicate);
  for(let i=0;i<branch.schedule.length;i++) {
    const call=i===0?initialCall:await decide({caseSeed:c.seed,caseIndex:c.index,history,replicate,arm,round:i+1},nextObservation(training,branch));
    advanceAgent(p,training,branch,call);
  }
  return branch;
}

export function summarize(r) {
  const pairs=[];let evaluationFights=0,calibrationFights=0;
  for(const c of r.calibration)for(const b of c.data.batches)calibrationFights+=b.training.rows.length+Object.values(b.histories).flat().reduce((n,x)=>n+x.rows.length,0);
  for(const c of r.cases) {
    evaluationFights+=c.training.rows.length;
    for(const [history,bs]of Object.entries(c.histories)) {
      const arms={};
      for(const b of bs) {
        const rows=b.rows.map(x=>x.fight??x),damage=rows.map(x=>x.physical.damage);
        const plans=rows.map(x=>x.planId);
        const windows={early:mean(damage.slice(0,6)),middle:mean(damage.slice(6,18)),late:mean(damage.slice(18))};
        (arms[b.arm]??=[]).push({replicate:b.replicate,planId:b.planId??null,meanDamage:mean(damage),totalDamage:damage.reduce((a,b)=>a+b,0),damage,plans,windows,
          playerDefeats:rows.filter(x=>x.physical.result==='down').length,npcSurvivals:rows.filter(x=>x.physical.enemies[0].hp>0).length,
          changes:plans.filter((x,i)=>x!==(i?plans[i-1]:'baseline')).length});
        evaluationFights+=rows.length;
      }
      const values=Object.fromEntries(Object.entries(arms).map(([k,v])=>[k,mean(v.map(x=>x.meanDamage))]));
      pairs.push({seed:c.seed,index:c.index,history,arms,means:values,differences:{fullVsRetained:values.full-values.retained,fullVsFixed:values.full-values.fixed,fullVsInitial:values.full-values.initial,fullVsRecent:values.full-values.recent,recentVsFixed:values.recent-values.fixed}});
    }
  }
  const byHistory=Object.fromEntries(r.protocol.histories.map(h=>{
    const ps=pairs.filter(x=>x.history===h);
    return [h,{means:Object.fromEntries(Object.keys(ps[0].means).map(k=>[k,mean(ps.map(x=>x.means[k]))])),differences:Object.fromEntries(Object.keys(ps[0].differences).map(k=>[k,mean(ps.map(x=>x.differences[k]))]))}];
  }));
  const calls=r.calls.map(x=>x.response),costs=calls.map(x=>x.metadata?.costUsd),durations=calls.map(x=>x.metadata?.durationMs).filter(Number.isFinite).sort((a,b)=>a-b);
  return {schema:1,id:r.protocol.id,scope:r.protocol.status,independentDevelopmentCases:r.cases.length,calibrationFights,evaluationFights,scoredFights:calibrationFights+evaluationFights,
    recordedCalls:calls.length,successfulCalls:calls.filter(x=>x.status==='ok').length,failedCalls:calls.filter(x=>x.status!=='ok').length,
    reportedCostUsd:costs.every(Number.isFinite)?costs.reduce((a,b)=>a+b,0):null,knownReportedCostUsd:costs.filter(Number.isFinite).reduce((a,b)=>a+b,0),unknownCostCalls:costs.filter(x=>!Number.isFinite(x)).length,
    meanLatencyMs:mean(durations),p95LatencyMs:durations[Math.max(0,Math.ceil(durations.length*.95)-1)]??null,
    models:[...new Set(calls.flatMap(x=>x.metadata?.models??[]))],byHistory,pairs,selection:r.calibration.map(c=>({seed:c.data.seed,index:c.data.index,...c.selection})),limits:r.protocol.claimLimits};
}
