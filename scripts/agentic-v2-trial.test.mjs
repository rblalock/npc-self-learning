import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { warmup,calibrate,fixedBranch,agentBranch,initialObservation } from './agentic-v2/trial.mjs';
import { observation,schedule,selectFixed,sha } from './agentic-v2/design.mjs';

const p=JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-ablation-v2.protocol.json',import.meta.url),'utf8'));
const c=p.cases[0];
const reply=(obs,key={})=>({id:sha(key),key,observation:obs,observationSha256:sha(obs),dispatched:true,response:{status:'ok',decision:{planId:'far',reason:'Keep distance.',prediction:'Observe next fight.',memory:'Earlier note'}}});

test('calibration and evaluation have separate streams; all planners receive the same evaluation schedule',()=>{
  const a=schedule(c,p,'recurring'),b=schedule(c,p,'recurring','calibration',0);
  assert.notDeepEqual(a,b);assert.deepEqual(a,schedule(c,p,'recurring'));
  assert.equal(a.length,24);const bs=a.filter(x=>x.probabilityB===.9).map(x=>x.round);
  assert.ok(bs[0]>=6&&bs[0]<=8);assert.ok(bs.at(-1)>=16&&bs.at(-1)<=18);
  assert.ok(schedule(c,p,'stable').every(x=>x.probabilityB===.1));
});

test('recent-only observation excludes older evidence and notes without resetting the true clock',()=>{
  const t=warmup(c,p),original=observation(t.rows,'far','secret note','recent'),mutated=structuredClone(t.rows);
  for(const row of mutated.slice(0,-1)){row.physical.damage=999;row.policy=[{secret:'old policy'}];row.feedback.reward=99;row.choice.action='forbidden-old';}
  assert.deepEqual(observation(mutated,'far','different older note','recent'),original);
  assert.equal(original.nextRound,11);assert.equal(original.history.length,1);assert.equal(original.memory,'');assert.ok(!('policy'in original));
  assert.equal(JSON.stringify(original).includes('secret'),false);assert.ok(!('reason'in original.history[0]));
  assert.equal(initialObservation(t).history.length,10);assert.ok(!('policy'in initialObservation(t)));
});

test('shared initial selection and held complete plan reproduce identical physical and policy trajectories',async()=>{
  const t=warmup(c,p),first=reply(initialObservation(t)),decide=async(k,o)=>reply(o,k);
  const full=await agentBranch(c,p,t,'recurring','full',1,first,decide),recent=await agentBranch(c,p,t,'recurring','recent',1,first,decide);
  const held=fixedBranch(c,p,t,'recurring','far',{arm:'initial',replicate:1,originCallId:first.id});
  assert.deepEqual(full.rows.map(x=>x.fight),held.rows);assert.deepEqual(recent.rows.map(x=>x.fight),held.rows);
  assert.deepEqual(full.final,held.final);assert.deepEqual(recent.final,held.final);
  assert.equal(full.rows[1].observation.memory,'Earlier note');assert.equal(recent.rows[1].observation.memory,'');
  assert.equal(full.rows[1].observation.history.length,11);assert.equal(recent.rows[1].observation.history.length,1);
});

test('initial failure freezes baseline immediately, and later failed review retains its previous plan',async()=>{
  const small={...p,postRounds:3},t=warmup(c,small),first=reply(initialObservation(t));first.response={status:'error',error:{code:'test'}};
  const b=await agentBranch(c,small,t,'stable','full',1,first,async(k,o)=>k.round===2?reply(o,k):{...reply(o,k),response:{status:'error'}});
  assert.deepEqual(b.rows.map(x=>x.decision.planId),['baseline','far','far']);
  const held=fixedBranch(c,small,t,'stable','baseline',{arm:'initial',replicate:1,originCallId:first.id});assert.deepEqual(b.rows[0].fight,held.rows[0]);
});

test('fixed selection uses all calibration histories equally and needs no evaluation outcomes',()=>{
  const small={...p,postRounds:3,calibrationReplicates:1},r=calibrate(c,small),independent=new Map();
  for(const batch of r.data.batches)for(const branches of Object.values(batch.histories))for(const branch of branches)for(const row of branch.rows){const values=independent.get(branch.planId)??[];values.push(row.physical.damage);independent.set(branch.planId,values);}
  for(const row of r.selection.means)assert.equal(row.meanDamage,independent.get(row.planId).reduce((a,b)=>a+b)/independent.get(row.planId).length);
  assert.deepEqual(selectFixed(r.data),r.selection);
  assert.equal(r.selection.means.length,7);assert.equal(r.data.batches[0].training.rows.length,10);
});
