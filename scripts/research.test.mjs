import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createArena,runSequence } from './synthetic/runner.mjs';
import { observe } from './synthetic/players.mjs';
import { ORIGINAL } from './synthetic/scenarios.mjs';
import { specification,configFor,createPolicy,ROLES,PROFILES,rewardsFor,terrainContext,contextFor,alignedMemory } from './research/policy.mjs';
import { combat,block } from './research/combat.mjs';
import { worldFor,history,trainingSchedule,FRESH_CASES,TRAIN_MAPS } from './research/scenarios.mjs';
import { runTrial } from './research/trials.mjs';
import { verifyBlock,verifyTrial } from './research/verify.mjs';
import { summarize } from './research/analysis.mjs';
import { workers,protocols } from './research/io.mjs';

test('policy configurations isolate architecture, reward routing and context capacity',()=>{
  const base=specification(),shared=specification({reward:'shared'}),joint=specification({architecture:'joint',reward:'shared'});
  assert.deepEqual(configFor(19,base),configFor(19,shared));
  assert.equal(configFor(19,joint).roles[0].actions.length,8);assert.equal(new Set(PROFILES.map(p=>JSON.stringify(p.actions))).size,8);
  assert.equal(configFor(19,specification({roster:['ranger'],context:'terrain'})).roles.length,1);
  assert.deepEqual(configFor(19,specification({context:'terrain'})).contexts,['sparse','dense']);
  assert.throws(()=>specification({architecture:'joint'}));assert.throws(()=>specification({roster:['unknown']}));
});
test('physical host reproduces archived three-enemy combat and policy exactly',()=>{
  const scenarios=Array.from({length:5},(_,i)=>({id:`identity/${i}`,phase:'qa',world:ORIGINAL,legacyStyle:['orbit','reverse','feint','cover','weave'][i]})),
    a=createArena(19),b=block(19,specification(),scenarios);
  try {
    const old=runSequence(a,scenarios);
    for(const [i,row] of b.rows.entries()) {
      const expected=old[i];
      for(const k of ['damage','health','duration','result','steps','enemies','policy'])assert.deepEqual(row[k],expected[k],k);
      assert.deepEqual(row.choices.map(c=>c.action),expected.choices.map(c=>c.action));
      assert.deepEqual(row.feedback.map(f=>f.reward),expected.rewards.map(f=>f.reward));
    }
    assert.deepEqual(b.snapshot,a.policy.request({op:'snapshot'}));verifyBlock(b);
  }finally{a.policy.dispose();}
});
test('isolated roles have one physical participant, one choice and no teammate reward',()=>{
  for(const role of ROLES) {
    const spec=specification({roster:[role]}),s={id:role,world:ORIGINAL,legacyStyle:'orbit'},b=block(19,spec,[s]);
    assert.equal(b.rows[0].choices.length,1);assert.deepEqual(b.rows[0].enemies.map(e=>e.role),[role]);
    const capture=combat(s,[role],b.rows[0].actions,{capture:true});assert.ok(capture.frames.every(f=>f.enemies.length===1));
    assert.equal(capture.row.damage,Math.min(100,capture.row.enemies[0].damage));verifyBlock(b);
  }
});
test('shared reward is identical for joint and independent hosts and requires all reports',()=>{
  const enemies=ROLES.map((role,i)=>({role,hp:72,damage:i*12,sightings:1})),
    independent=specification({reward:'shared'}),joint=specification({architecture:'joint',reward:'shared'}),
    a=rewardsFor(independent,enemies),b=rewardsFor(joint,enemies);
  assert.ok(a.every(r=>r.reward===b[0].reward&&r.observed===b[0].observed));
  enemies[1].sightings=0;assert.ok(rewardsFor(independent,enemies).every(r=>!r.observed));assert.equal(rewardsFor(joint,enemies)[0].observed,false);
});
test('joint choice uses real legal masks, actual mapped tactics and a single core feedback',()=>{
  const spec=specification({architecture:'joint',reward:'shared'}),s={id:'qa-joint',world:ORIGINAL,legacyStyle:'feint'},
    b=block(19,spec,[s],{baseline:true,learning:false,forced:{squad:'combo-3'}});
  assert.deepEqual(b.rows[0].actions,PROFILES[3].actions);assert.equal(b.rows[0].choices.length,1);assert.equal(b.rows[0].feedback.length,1);verifyBlock(b);
  assert.throws(()=>block(19,spec,[s],{forced:{squad:'combo-99'}}));
});
test('terrain labels use public geometry only; shuffled control has the same capacity',()=>{
  for(const map of TRAIN_MAPS) {
    const world=worldFor(map,19);assert.equal(terrainContext(world),map.endsWith('dense')?'dense':'sparse');
    const s={id:'same',world,player:{family:'hidden',direction:1}},changed={...s,player:{family:'another',direction:-1},legacyStyle:'feint'};
    for(const context of ['terrain','shuffled'])assert.equal(contextFor(specification({context}),s,19),contextFor(specification({context}),changed,19));
  }
  assert.deepEqual(configFor(19,specification({context:'terrain'})),configFor(19,specification({context:'shuffled'})));
});
test('generator validity, reserved separation, direction changes and balanced terrain before measurement',async()=>{
  const ps=await protocols();assert.equal(ps.reduce((n,p)=>n+p.expected_encounters,0),72000);
  for(const p of ps)for(const seed of p.seeds)for(const id of FRESH_CASES) {
    const a=history(seed,id,'a',1,1)[0],b=history(seed,id,'b',1,-1)[0];
    assert.equal(a.world.validation.valid,true);assert.deepEqual(a.world,b.world);
    assert.deepEqual({...a.player,direction:-1},b.player);
  }
  const train=trainingSchedule(19);assert.equal(train.length,48);
  assert.equal(train.filter(s=>terrainContext(s.world)==='dense').length,24);
  assert.ok(train.every(s=>!FRESH_CASES.some(c=>c.startsWith(s.player.family+'/'))));
});
test('fresh players use restricted observations and deterministic bounded commands through combat',()=>{
  const hidden={player:{x:460,y:300,hp:100,dashCooldown:0},time:0,enemies:[],bullets:[],policy:{secret:true}},o=observe(hidden,[]);
  assert.deepEqual(Object.keys(o).sort(),['bullets','enemies','player','time']);assert.ok(!('policy' in o));
  for(const id of FRESH_CASES) {
    const s=history(19,id,'qa',1),spec=specification({roster:['ranger']}),a=block(19,spec,s),b=block(19,spec,s);
    assert.deepEqual(a,b);assert.ok(a.rows[0].inputs.distance>0);verifyBlock(a);
  }
});
test('frozen boundary is exact and independent policy verifier rejects altered feedback',()=>{
  const spec=specification({roster:['ranger'],context:'terrain'}),s=history(19,FRESH_CASES[0],'qa',3),train=block(19,spec,s),
    online=block(19,spec,s,{snapshot:train.snapshot}),frozen=block(19,spec,s,{snapshot:train.snapshot,learning:false});
  assert.deepEqual(online.rows[0].choices,frozen.rows[0].choices);assert.equal(online.rows[0].damage,frozen.rows[0].damage);
  assert.deepEqual(frozen.initial.cells,frozen.snapshot.cells);verifyBlock(frozen);
  const bad=structuredClone(online);bad.rows[0].feedback[0].reward+=.1;assert.throws(()=>verifyBlock(bad));
});
test('return histories actually continue A into B and memory interventions preserve RNG/counters',()=>{
  const t=runTrial({kind:'return'},19);assert.equal(Object.values(t.blocks).reduce((s,b)=>s+b.rows.length,0),576);
  for(const id of FRESH_CASES)assert.deepEqual(t.blocks[id+'/b'].initial,t.blocks[id+'/a'].snapshot);
  for(const i of t.interventions) {
    const current=t.blocks[i.current].snapshot;assert.equal(i.snapshot.rng_state,current.rng_state);assert.equal(i.snapshot.encounter,current.encounter);assert.equal(i.snapshot.next_decision_id,current.next_decision_id);
    if(i.cells==='empty')assert.ok(i.snapshot.cells.every(c=>c.score===0&&c.samples===0));
  }
  assert.equal(verifyTrial(t).encounters,576);
  const bad=structuredClone(t);bad.blocks[FRESH_CASES[0]+'/b'].initial.cells[0].score+=.1;assert.throws(()=>verifyTrial(bad));
});
test('curriculum counts all probes, cannot mutate checkpoints with probes, and uses training-only selection',()=>{
  const t=runTrial({kind:'curriculum'},19);assert.equal(Object.values(t.blocks).reduce((s,b)=>s+b.rows.length,0),288);
  for(const arm of ['uniform48','uniform24','adaptive24']) {
    const bs=Object.entries(t.blocks).filter(([k])=>k.startsWith(arm+'/'));assert.equal(bs.reduce((s,[,b])=>s+b.rows.length,0),96);
    assert.equal(bs.filter(([k])=>k.includes('/probe/')).length,arm==='uniform48'?0:24);
  }
  assert.equal(verifyTrial(t).encounters,288);
});
test('worker and serial combat hosts are identical',async()=>{
  const args=[19,specification(),history(19,FRESH_CASES[0],'qa',2)],expected=block(...args);
  const [actual]=await workers([{mode:'block',args}]);assert.deepEqual(actual,expected);
});
test('analysis averages independent seed endpoints, excludes early rounds and rejects missing seeds',()=>{
  const p={kind:'test',seeds:[1,2],fresh_cases:['fixture'],primary_key:'gain',minimum_gain:3,maximum_case_loss:6,expected_encounters:24,
    primary_uncertainty:{resamples:100,interval:.99},secondary_uncertainty:{resamples:100,interval:.95}};
  const trials=p.seeds.map(seed=>({seed,comparisons:[{key:'gain',group:'fresh',case:'fixture',role:'solo',left:'a',right:'b',window:'late',rounds:4}],
    blocks:Object.fromEntries(['a','b'].map(k=>[k,{scenarios:Array.from({length:6},()=>({phase:'test'})),rows:Array.from({length:6},(_,i)=>({damage:i<2?(k==='a'?100:0):(k==='a'?7:3),result:'survived',duration:26,steps:1560,choices:[{}]}))}]))}));
  const s=summarize(p,trials);assert.equal(s.primary.meanDifference,4);assert.equal(s.primary.seedCount,2);assert.equal(s.gates.meaningful_primary,true);
  assert.throws(()=>summarize(p,trials.slice(1)));
});
