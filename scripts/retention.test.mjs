import test from 'node:test';
import assert from 'node:assert/strict';
import { makePolicy } from './evidence-baseline.mjs';
import { configFor,makeRetentionPolicy,retentionArena } from './retention/policy.mjs';
import { createArena,runSequence } from './synthetic/runner.mjs';
import { ORIGINAL } from './synthetic/scenarios.mjs';
import { identity,summarizeBoundary } from './retention/boundary.mjs';
import { runSequence as newSequence } from './retention/runner.mjs';
import { verifyTrace } from './retention/verify-trace.mjs';
import { freshWorld,FRESH_MAPS,syntheticSchedules } from './retention/scenarios.mjs';
import { freshPlayerConfig,FRESH_FAMILIES } from './retention/players.mjs';
import { requireWorld } from './synthetic/geometry.mjs';
import { readFile } from 'node:fs/promises';

test('retention variant changes only automatic score decay',()=>{
  const a=configFor(19),b=configFor(19,'no-decay');
  assert.equal(a.decay,.025);assert.equal(b.decay,0);assert.deepEqual({...a,decay:0},b);
});
test('original wrapper and archived wrapper have exact snapshot identity',()=>{
  const a=makePolicy(19),b=makeRetentionPolicy(19);
  try{assert.deepEqual(a.request({op:'snapshot'}),b.request({op:'snapshot'}));}
  finally{a.dispose();b.dispose();}
});
test('snapshots cannot cross configuration variants',()=>{
  const a=makePolicy(19),b=makeRetentionPolicy(19,'no-decay');
  try{assert.throws(()=>b.request({op:'restore',snapshot:a.request({op:'snapshot'})}));}
  finally{a.dispose();b.dispose();}
});
test('default wrapper reproduces archived combat and exact boundary pairing',()=>{
  const schedule=Array.from({length:3},(_,i)=>({id:`qa-${i}`,phase:'qa',world:ORIGINAL,legacyStyle:'orbit'}));
  const a=createArena(19),b=retentionArena(19);
  try {
    assert.deepEqual(runSequence(a,schedule),runSequence(b,schedule));
    const snapshot=b.policy.request({op:'snapshot'}),f=retentionArena(19,{snapshot,learning:false});
    try{assert.deepEqual(identity(runSequence(b,schedule)[0]),identity(runSequence(f,schedule)[0]));}
    finally{f.policy.dispose();}
  } finally{a.policy.dispose();b.policy.dispose();}
});
test('boundary analysis pairs seeds and only uses specified late switch rounds',()=>{
  const p={seeds:[1,2],arms:['diverse'],primary_arm:'diverse',late_rounds:1,uncertainty:{resamples:100},criterion:{minimum_gain:3,lower_bound:0},expected_new_encounters:4};
  const trials=p.seeds.map(seed=>({seed,branches:{fixture:{diverse:{online:[{damage:99},{damage:8}],frozen:[{damage:0},{damage:4}]}}}}));
  const s=summarizeBoundary(p,trials);assert.equal(s.groups.aggregate.diverse.effect.meanDifference,4);assert.equal(s.primarySupported,true);
  assert.throws(()=>summarizeBoundary(p,trials.slice(1)));
});
test('removing decay preserves an unsampled score while still updating sampled actions',()=>{
  for(const variant of ['original','no-decay']) {
    const p=makeRetentionPolicy(19,variant);
    try {
      let c=p.request({op:'choose',role:'vanguard',context:'arena',allowed:['rush']});
      p.request({op:'feedback',decision_id:c.decision_id,reward:1,observed:true});p.request({op:'commit'});
      const before=p.request({op:'inspect'}).cells.find(c=>c.role==='vanguard'&&c.action==='rush').score;
      c=p.request({op:'choose',role:'ranger',context:'arena',allowed:['aim']});
      p.request({op:'feedback',decision_id:c.decision_id,reward:-1,observed:true});p.request({op:'commit'});
      const after=p.request({op:'inspect'}).cells;
      assert.equal(after.find(c=>c.role==='vanguard'&&c.action==='rush').score,before*(variant==='original'?.975:1));
      assert.ok(after.find(c=>c.role==='ranger'&&c.action==='aim').score<0);
    }finally{p.dispose();}
  }
});
test('new host is identical on an existing controller; independent reward verifier rejects tampering',()=>{
  const schedule=Array.from({length:4},(_,i)=>({id:`qa-${i}`,phase:'qa',world:ORIGINAL,legacyStyle:'feint'}));
  const a=createArena(19),b=retentionArena(19);
  try {
    const rows=newSequence(b,schedule);assert.deepEqual(rows,runSequence(a,schedule));
    assert.deepEqual(verifyTrace(19,rows,{schedule,learning:true}),b.policy.request({op:'snapshot'}));
    const bad=structuredClone(rows);bad[0].enemies[0].damage+=12;
    assert.throws(()=>verifyTrace(19,bad,{schedule,learning:true}));
  }finally{a.policy.dispose();b.policy.dispose();}
});
test('reserved geometry validates without measuring combat; fresh families absent from training',async()=>{
  const p=JSON.parse(await readFile(new URL('../docs/experiments/retention-v1.protocol.json',import.meta.url)));
  for(const seed of p.synthetic_seeds) {
    const schedules=syntheticSchedules(p,seed);
    assert.equal(Object.keys(schedules).length,8);
    for(const schedule of Object.values(schedules)) {
      requireWorld(schedule[0].world);
      assert.equal(schedule.length,36);
      assert.equal(schedule[0].player.direction,1);assert.equal(schedule[12].player.direction,-1);assert.equal(schedule[24].player.direction,1);
    }
  }
});
test('fresh controllers run deterministically through the original combat with bounded inputs',()=>{
  // QA seed is disjoint from all measured seeds. Do not use outcomes to tune rules.
  for(const family of FRESH_FAMILIES)for(const map of FRESH_MAPS) {
    const s=[{id:'qa-fresh',phase:'qa',world:freshWorld(map,19),player:freshPlayerConfig(family,19)}],
      a=retentionArena(19),b=retentionArena(19);
    try{const rows=newSequence(a,s);assert.deepEqual(rows,newSequence(b,s));assert.ok(rows[0].inputs.distance>0);
      verifyTrace(19,rows,{schedule:s,learning:true});
    }finally{a.policy.dispose();b.policy.dispose();}
  }
});
