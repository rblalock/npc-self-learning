import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,enumerate,opportunity,GROUPS,actionKey } from './opportunity-v2/fixtures.mjs';
import { trial } from './opportunity-v2/trial.mjs';
import { metrics,recovery,analyze } from './opportunity-v2/metrics.mjs';
import { verifyTrial } from './research/verify.mjs';
import { terrainContext } from './research/policy.mjs';
import { jobs,protocol } from './opportunity-v2/io.mjs';

test('geometry and public context change while context opponents remain identical',()=>{
  for(const group of GROUPS)for(let i=0;i<32;i++) {
    const f=fixture(group,201,i);assert.equal(f.valid,true);
    if(group.startsWith('context')) {assert.deepEqual(f.scenarios[0].player,f.scenarios[1].player);assert.deepEqual(f.scenarios.map(s=>terrainContext(s.world)),['sparse','dense']);}
    else assert.deepEqual(f.scenarios[0].world,f.scenarios[1].world);
  }
});
test('admission preserves ties, rejects saturated feedback, and requires real optimal response changes',()=>{
  const table=(a,b,ra,rb)=>[{rows:[{damage:a,actions:{ranger:'aim'},feedback:[{reward:ra,observed:true}]}]},
    {rows:[{damage:b,actions:{ranger:'lead'},feedback:[{reward:rb,observed:true}]}]}];
  assert.equal(opportunity([table(24,12,.4,.1),table(0,12,-.4,.1)]).accepted,true);
  assert.equal(opportunity([table(24,24,.4,.4),table(0,12,-.4,.1)]).accepted,false);
  assert.equal(opportunity([table(60,48,1,1),table(48,60,1,1)]).accepted,false);
  const no=table(24,12,.4,.1);no[0].rows[0].feedback[0].observed=false;
  assert.equal(opportunity([no,table(0,12,-.4,.1)]).accepted,false);
});
test('solo histories preserve exact forks, counterfactual outcomes and memory-only resets',()=>{
  const a=enumerate(fixture('solo-flanker',201,5));assert.equal(a.admission.accepted,true);
  const t=trial(a.fixture,{phase_rounds:4});assert.equal(verifyTrial(t).encounters,40);
  for(const b of Object.values(t.blocks))for(const r of metrics(b,a))assert.ok(r.regret>=0&&r.expectedRegret>=0&&r.optimalProbability<=1);
  for(const phase of ['switch','return','sham'])assert.deepEqual(t.blocks[phase+'/online'].rows[0].choices,t.blocks[phase+'/frozen'].rows[0].choices);
  const bad=structuredClone(t.blocks['switch/online']);bad.rows[0].damage++;
  assert.throws(()=>metrics(bad,a));
});
test('joint probability regret and independent-product regret use identical physical tables',()=>{
  const a=enumerate(fixture('squad',201,1));assert.equal(a.admission.accepted,true);
  const t=trial(a.fixture,{phase_rounds:4});assert.equal(verifyTrial(t).encounters,52);
  for(const b of Object.values(t.blocks))metrics(b,a);
  const uniform=metrics(t.blocks['switch/uniform'],a),average=a.blocks[1].reduce((n,b)=>n+b.rows[0].damage,0)/8;
  assert.ok(uniform.every(m=>Math.abs(m.expectedDamage-average)<1e-8));
});
test('terrain and sham controls share capacity, observe no private phase, and freeze test memory',()=>{
  const a=enumerate(fixture('context-flanker',201,5));assert.equal(a.admission.accepted,true);
  const t=trial(a.fixture,{phase_rounds:4});assert.equal(verifyTrial(t).encounters,24);
  for(const mode of ['pooled','terrain','shuffled'])assert.deepEqual(t.blocks[mode+'/test'].initial.cells,t.blocks[mode+'/test'].snapshot.cells);
  assert.deepEqual(t.blocks['terrain/train'].initial.config,t.blocks['shuffled/train'].initial.config);
});
test('recovery retains unrecovered cases, requires a streak, and separates initial competence',()=>{
  const rows=values=>values.map((normalizedRegret,i)=>({round:i+1,normalizedRegret}));
  assert.deepEqual(recovery(rows([.8,.2,.4,.2,.1,.3])),{initiallyDisplaced:true,reached:true,endingRound:6,restrictedChecks:6,initialNormalizedRegret:.8});
  assert.equal(recovery(rows([.8,.8,.8])).restrictedChecks,4);
  assert.equal(recovery(rows([.1,.1,.1])).initiallyDisplaced,false);
});
test('analysis uses paired case seeds and enforces the qualification sample-size gate',async()=>{
  const p=await protocol(),a=enumerate(fixture('solo-flanker',201,5)),t=trial(a.fixture,{phase_rounds:4}),
    s=analyze({...p,seeds:[201],phase_rounds:4},[a],[t]);
  assert.equal(s.groups['solo-flanker'].primary.seedCount,1);assert.equal(s.groups['solo-flanker'].gates.enough_qualified_seeds,false);
  assert.throws(()=>analyze({...p,seeds:[202],phase_rounds:4},[a],[t]));
});
test('worker results are identical and reserved seeds are separated from development',async()=>{
  const p=await protocol();assert.ok(p.seeds.every(s=>!p.development_seeds.includes(s)));
  const f=fixture('solo-flanker',201,5),[t]=await jobs([{mode:'trial',fixture:f,protocol:{phase_rounds:4}}]);
  assert.deepEqual(t,trial(f,{phase_rounds:4}));
});
