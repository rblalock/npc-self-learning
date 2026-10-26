import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeObservation, makeSchedule, publicRound, validateDecision, PLANS, sha } from './agentic-v1/design.mjs';
import { warmup, runBranch, summarize } from './agentic-v1/trial.mjs';
import { verify } from './verify-agentic-v1.mjs';

const sourceProtocol=JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-pilot-v1.protocol.json',import.meta.url),'utf8'));
const protocol={...sourceProtocol,cases:[sourceProtocol.cases[0]],histories:['recurring'],postRounds:8,agentReplicates:1};
const c=protocol.cases[0],training=warmup(c,protocol);
const decision=(planId,memory='test note')=>({planId,reason:'Probe the other NPC plan.',prediction:'NPC damage will improve.',memory});

test('ten complete warm-up fights precede all agent requests and each branch restores the exact checkpoint',async()=>{
  let calls=0;
  const b=await runBranch(c,protocol,training,'recurring','agent',1,async(key,o)=>{
    calls++;assert.equal(o.history.length,10+key.round-1);assert.equal(o.nextRound,10+key.round);
    assert.equal(o.history[0].planId,'baseline');
    assert.equal(o.memory,key.round===1?'':'test note');
    return {status:'ok',decision:decision(key.round%2?'far':'aim'),metadata:{models:['test-fixture'],costUsd:0,durationMs:0}};
  });
  assert.equal(calls,protocol.postRounds);assert.equal(training.rows.length,10);
  assert.deepEqual(b.initial,training.checkpoint);
  assert.equal(b.rows[0].fight.choice.decision_id,training.checkpoint.next_decision_id);
  assert.equal(b.rows[0].fight.planId,'far');
});

test('observations strip evaluator labels, RNG and hidden scenario data',()=>{
  const polluted=structuredClone(training.rows[0]);
  polluted.side='SECRET_SIDE';polluted.scenario={family:'SECRET_FAMILY'};polluted.rng_state='SECRET_RNG';
  polluted.physical.scenario='SECRET_ID';polluted.physical.inputs={seed:'SECRET_SEED'};
  polluted.physical.npcTelemetry[0].family='SECRET_TELEMETRY';
  const o=makeObservation([polluted],{cells:polluted.policy,seed:'SECRET_SEED',rng_state:'SECRET_RNG'},'baseline');
  assert.ok(!JSON.stringify(o).includes('SECRET'));
  assert.deepEqual(Object.keys(publicRound(polluted)),['round','planId','tactic','reward','observed','npcDamage','npcRemainingHealth','duration','telemetry']);
  polluted.feedback.observed=false;
  assert.equal(publicRound(polluted).npcDamage,null);assert.equal(publicRound(polluted).reward,null);
});

test('invalid model decisions cannot inject tuning, alter the player, or change memory',async()=>{
  assert.throws(()=>validateDecision({...decision('aim'),playerSpeed:0}));
  assert.throws(()=>validateDecision(decision('make-player-weak')));
  assert.throws(()=>validateDecision(decision('aim','x'.repeat(1501))));
  let i=0;
  const b=await runBranch(c,protocol,training,'recurring','agent',1,async()=>++i===1?
    {status:'ok',decision:decision('far')}:{status:'error',error:{code:'timeout'},metadata:{models:[],costUsd:0,durationMs:1}});
  assert.ok(b.rows.every(r=>r.fight.planId==='far'));
  assert.equal(b.rows[1].decision.memory,'test note');
  assert.equal(b.rows[1].changed,false);
});

test('all controllers share the realized schedule and every plan has explicit bounded settings',async()=>{
  const a=await runBranch(c,protocol,training,'recurring','retained',0);
  const b=await runBranch(c,protocol,training,'recurring','statistical',0);
  assert.deepEqual(a.schedule,b.schedule);assert.deepEqual(a.initial,b.initial);
  assert.deepEqual(makeSchedule(c,protocol),training.schedule);
  for(const p of PLANS)assert.deepEqual(Object.keys(p.tuning).sort(),['rangerDistance','rangerLeadScale']);
  assert.ok(b.rows.some(r=>r.fight.planId!=='baseline'));
  for(const row of b.rows) {
    const plan=PLANS.find(p=>p.id===row.fight.planId);
    if(plan.action)assert.equal(row.fight.choice.action,plan.action);
  }
});

test('recorded agent trajectories replay exactly and reject modified evidence',async()=>{
  const branches=[];
  for(const arm of protocol.controls)branches.push(await runBranch(c,protocol,training,'recurring',arm,0));
  branches.push(await runBranch(c,protocol,training,'recurring','agent',1,async(key)=>({status:'ok',decision:decision(key.round%2?'short-lead':'baseline'),metadata:{models:['test-fixture'],costUsd:0,durationMs:1}})));
  const results={protocol,protocolSha256:sha(protocol),cases:[{...c,training,histories:{recurring:branches}}]};
  const checked=await verify(results,{sources:false});
  assert.equal(checked.scoredPhysicalFightsReplayed,42);assert.equal(checked.recordedAgentDecisionsReplayed,8);
  assert.equal(summarize(results).recordedCalls,8);
  const corrupt=structuredClone(results);corrupt.cases[0].histories.recurring[3].rows[0].fight.physical.damage+=1;
  await assert.rejects(verify(corrupt,{sources:false}),/mismatch/);
  const leak=structuredClone(results);leak.cases[0].histories.recurring[3].rows[0].observation.side=1;
  await assert.rejects(verify(leak,{sources:false}),/observations/);
});
