import assert from 'node:assert/strict';
import { TACTICS } from '../evidence-baseline.mjs';
import { seedFor,randomAt } from '../synthetic/random.mjs';
import { createPolicy,PROFILES } from './policy.mjs';

// Reconstruct core calls from physical evidence, bypassing the combat/reward host.
export function verifyBlock(b) {
  const policy=createPolicy(b.seed,b.spec);
  let decisions=0;
  try {
    policy.request({op:'restore',snapshot:b.initial});
    assert.deepEqual(policy.request({op:'snapshot'}),b.initial);
    assert.equal(b.rows.length,b.scenarios.length);
    const frozen=policy.request({op:'inspect'}).cells;
    for(const [i,row] of b.rows.entries()) {
      const scenario=b.scenarios[i];assert.equal(row.scenario,scenario.id);
      assert.ok(Number.isInteger(row.steps)&&row.steps>0&&row.steps<=1561);
      assert.ok(Math.abs(row.duration-row.steps/60)<1e-8);
      assert.equal(row.health+row.damage,100);
      assert.deepEqual(row.enemies.map(e=>e.role),b.spec.roster);
      assert.equal(row.damage,Math.min(100,row.enemies.reduce((s,e)=>s+e.damage,0)));
      for(const e of row.enemies) {
        assert.ok(e.hp<=72&&e.hp>=-18&&e.hp%18===0);
        assert.ok(e.damage>=0&&e.damage%12===0);
        assert.ok(e.sightings>=0&&e.sightings<=row.duration+1e-8);
      }
      if(row.result==='down')assert.equal(row.health,0);
      else if(row.result==='cleared')assert.ok(row.enemies.every(e=>e.hp<=0));
      else {assert.equal(row.result,'survived');assert.ok(row.duration>=26);}
      if(scenario.player) {
        assert.match(row.inputSha256,/^[0-9a-f]{64}$/);assert.ok(row.inputs.distance>=0);
        assert.ok(row.inputs.fireFrames<=row.steps&&row.inputs.dashFrames<=row.steps);
      } else {assert.equal(row.inputSha256,null);assert.equal(row.inputs,null);}
      let context='arena';
      if(b.spec.context==='terrain')context=scenario.world.walls.reduce((s,w)=>s+w.w*w.h,0)>920*600*.055?'dense':'sparse';
      if(b.spec.context==='shuffled')context=randomAt(seedFor(b.seed,scenario.id),'sham-context')<.5?'sparse':'dense';
      const roles=b.spec.architecture==='joint'?['squad']:b.spec.roster;
      assert.equal(row.choices.length,roles.length);assert.equal(row.feedback.length,roles.length);
      for(const [j,role] of roles.entries()) {
        const allowed=b.options.forced?[b.options.forced[role]]:role==='squad'?PROFILES.map(p=>p.action):TACTICS[role],
          request={op:'choose',role,context,allowed,baseline:b.options.baseline};
        assert.deepEqual(row.choices[j],{request,...policy.request(request)});decisions++;
      }
      const actions=b.spec.architecture==='joint'?PROFILES.find(p=>p.action===row.choices[0].action).actions:
        Object.fromEntries(row.choices.map(c=>[c.request.role,c.action]));
      assert.deepEqual(row.actions,actions);
      for(const [j,role] of roles.entries()) {
        const enemy=row.enemies.find(e=>e.role===role),shared=b.spec.reward==='shared',
          reward=shared?2*Math.min(100,row.enemies.reduce((s,e)=>s+e.damage,0))/100-1:
            Math.max(-1,Math.min(1,enemy.damage/32-.22-(enemy.hp<=0?.18:0))),
          observed=shared?row.enemies.every(e=>e.sightings>0):enemy.sightings>0,
          request={op:'feedback',decision_id:row.choices[j].decision_id,reward,observed:observed&&b.options.learning},
          response=policy.request(request);
        assert.deepEqual(row.feedback[j],{role,reward,observed,request,...response});
      }
      const after=policy.request({op:'commit'});
      assert.equal(row.encounter,after.encounter);assert.deepEqual(row.policy,after.cells);
      if(!b.options.learning||b.options.baseline)assert.deepEqual(after.cells,frozen);
    }
    assert.deepEqual(policy.request({op:'snapshot'}),b.snapshot);
    return {encounters:b.rows.length,decisions};
  } finally {policy.dispose();}
}
export function verifyTrial(t) {
  let encounters=0,decisions=0;
  for(const [id,b] of Object.entries(t.blocks)) {
    const policy=createPolicy(b.seed,b.spec),empty=policy.request({op:'snapshot'});policy.dispose();
    if(b.initialKind==='fresh') {assert.equal(b.parent,null);assert.deepEqual(b.initial,empty);}
    else if(b.initialKind==='continuation') assert.deepEqual(b.initial,t.blocks[b.parent].snapshot);
    else {
      assert.equal(b.initialKind,'intervention');const intervention=t.interventions.find(i=>i.block===id);assert.ok(intervention);
      const expected={...t.blocks[intervention.current].snapshot,cells:intervention.cells==='empty'?empty.cells:t.blocks[intervention.cells].snapshot.cells};
      assert.deepEqual(intervention.snapshot,expected);assert.deepEqual(b.initial,expected);
    }
    const v=verifyBlock(b);encounters+=v.encounters;decisions+=v.decisions;
  }
  for(const s of t.selections) {
    if(s.kind==='greedy-at-switch') {
      const b=t.blocks[s.source],best=[...b.snapshot.cells].sort((a,b)=>b.score-a.score||a.action.localeCompare(b.action))[0];
      assert.deepEqual(s.forced,{[best.role]:best.action});assert.deepEqual(t.blocks[s.block].options.forced,s.forced);
    } else {
      assert.equal(s.kind,'curriculum');assert.equal(s.candidates.length,3);
      for(const c of s.candidates) {
        const probe=t.blocks[c.id];assert.equal(probe.options.learning,false);assert.equal(probe.rows.length,1);
        assert.equal(c.damage,probe.rows[0].damage);assert.equal(c.family,probe.scenarios[0].player.family);assert.equal(c.map,probe.scenarios[0].world.family);
        assert.deepEqual(probe.initial,t.blocks[s.trainingBlock].initial);
      }
      if(s.variant==='adaptive24') {
        assert.deepEqual(s.selected,[...s.candidates].sort((a,b)=>a.damage-b.damage||a.id.localeCompare(b.id))[0]);
        assert.ok(t.blocks[s.trainingBlock].scenarios.every(x=>x.player.family===s.selected.family&&x.world.family===s.selected.map));
      } else assert.equal(s.selected,null);
    }
  }
  return {encounters,decisions};
}
