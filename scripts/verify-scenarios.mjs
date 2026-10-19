import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root,makePolicy,TACTICS,verifyBaseline,createExperimentRunner} from './evidence-baseline.mjs';
import {summarizeScenarios} from './scenario-analysis.mjs';
import {scenarioArena,runScenarioTrial} from './scenario-trial.mjs';
import {fixedProfiles,mean} from './evaluation-support.mjs';
const path=resolve(root,process.argv[2]??'docs/experiments/scenario-transfer-v1.results.json');
const result=JSON.parse(await readFile(path,'utf8'));
const {protocol:p,trials,summary}=result;
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=await readFile(resolve(root,'docs/experiments/scenario-transfer-v1.protocol.json'));
assert.deepEqual(p,JSON.parse(bytes));assert.equal(sha(bytes),summary.protocolSha256);
for(const [name,hash] of Object.entries(result.provenance.sourceHashes))assert.equal(sha(await readFile(resolve(root,name))),hash,`Source changed: ${name}`);
console.error(verifyBaseline());
assert.equal(trials.length,p.seeds.length*p.scenarios.length*2);
const roles=Object.keys(TACTICS),clamp=n=>Math.max(-1,Math.min(1,n));let count=0;
function verifyTrace(seed, rows, length, style, learning, snapshot, mode = 'additive-team') {
  assert.equal(rows.length, length);
  const policy = makePolicy(seed);
  if (snapshot) policy.request({ op: 'restore', snapshot });
  const frozen = policy.request({ op: 'inspect' }).cells;
  try {
    rows.forEach((row, index) => {
      assert.equal(row.phaseRound, index + 1);
      assert.equal(row.style, style); assert.equal(row.control, 'demo');
      assert.equal(row.communication, 'direct'); assert.equal(row.baseline, false);
      assert.equal(row.learning, learning); assert.equal(row.rewardMode, mode);
      assert.ok(row.duration > 0 && row.duration < 27 && row.damage >= 0 && row.damage <= 100);
      assert.equal(row.damage + row.health, 100);
      assert.deepEqual(row.feedbackAudit.map(a => a.role), roles);
      assert.deepEqual(row.recap.map(a => a.role), roles);
      assert.deepEqual(row.rewards.map(a => a.role), roles);
      const before = policy.request({ op: 'inspect' }).cells;
      const decisions = roles.map(role => policy.request({ op: 'choose', role, context: 'arena', allowed: TACTICS[role], baseline: false }));
      const teamDamage = row.feedbackAudit.filter(a => a.observed).reduce((sum, a) => sum + a.damage, 0);
      row.feedbackAudit.forEach((a, i) => {
        assert.ok(Number.isFinite(a.damage) && a.damage >= 0);
        assert.equal(a.teamDamage, teamDamage);
        assert.equal(a.decisionId, decisions[i].decision_id);
        assert.equal(a.tactic, decisions[i].action);
        const reward = clamp(a.damage / 32 + (mode === 'additive-team' ? .5 * (teamDamage - (a.observed ? a.damage : 0)) / 96 : 0) - .22 - (a.defeated ? .18 : 0));
        const original = clamp(a.damage / 32 - .22 - (a.defeated ? .18 : 0));
        assert.equal(a.reward, reward); assert.equal(a.originalReward, original);
        assert.equal(a.submittedObserved, a.observed && learning);
        assert.equal(a.accepted, policy.request({ op: 'feedback', decision_id: a.decisionId, reward, observed: a.submittedObserved }).accepted);
        assert.equal(row.recap[i].reward, reward); assert.equal(row.rewards[i].reward, reward);
        assert.equal(row.recap[i].originalReward, original); assert.equal(row.rewards[i].originalReward, original);
        assert.equal(row.recap[i].damage, a.damage); assert.equal(row.recap[i].hits, a.damage / 12);
        assert.equal(row.recap[i].accepted, a.accepted); assert.equal(row.recap[i].observed, a.observed);
        assert.equal(row.recap[i].before, before.find(c => c.role === a.role && c.action === a.tactic).probability);
      });
      const after = policy.request({ op: 'commit' });
      assert.equal(row.encounter, after.encounter);
      assert.deepEqual(row.policy, after.cells);
      for (const r of row.recap) assert.equal(r.after, after.cells.find(c => c.role === r.role && c.action === r.tactic).probability);
      if (!learning) assert.deepEqual(after.cells, frozen);
      count++;
    });
    return policy.request({ op: 'snapshot' });
  } finally { policy.dispose(); }
}

const expected=p.scenarios.flatMap(s=>p.seeds.flatMap(seed=>['individual','additive-team'].map(mode=>`${s.id}/${seed}/${mode}`)));
assert.deepEqual(trials.map(t=>`${t.scenario}/${t.seed}/${t.mode}`),expected);
for(const t of trials){
  const trained=verifyTrace(t.seed,t.training.online,p.training_rounds,p.training_style,true,undefined,t.mode);
  assert.deepEqual(trained,t.snapshots.online);assert.deepEqual(Object.keys(t.branches),p.switches);
  for(const style of p.switches){
    assert.deepEqual(Object.keys(t.branches[style]),['online','trained-frozen']);
    for(const condition of ['online','trained-frozen'])verifyTrace(t.seed,t.branches[style][condition],p.post_switch_rounds,style,condition==='online',trained,t.mode);
  }
}
assert.equal(count,11520);
// Independently execute every fixed calibration and fixed trace in actual combat.
const runner=createExperimentRunner({...p,primary_switch:p.switches[0],secondary_switches:p.switches.slice(1)});
assert.deepEqual(result.calibration.map(c=>c.id),fixedProfiles().map(c=>c.id));
for(const c of result.calibration){
  for(const scenario of p.scenarios){
    const a=scenarioArena(scenario,p.fixed_baseline.seed,{actions:c.actions,learning:false});
    try{assert.deepEqual(runner.trace(a,1,p.training_style,true),c.worlds.find(w=>w.scenario===scenario.id).trace);}finally{a.policy.dispose();}
  }
  assert.equal(c.damage,mean(c.worlds.map(w=>w.trace[0].damage)));
}
const selected=[...result.calibration].sort((a,b)=>b.damage-a.damage||a.id.localeCompare(b.id))[0];
assert.deepEqual(result.selectedFixed,{id:selected.id,actions:selected.actions});
for(const scenario of p.scenarios){
  const f=result.fixed.find(f=>f.scenario===scenario.id);assert.ok(f);
  for(const style of [p.training_style,...p.switches]){
    const a=scenarioArena(scenario,p.fixed_baseline.seed,{actions:selected.actions,learning:false});
    try{assert.deepEqual(runner.trace(a,style===p.training_style?p.training_rounds:p.post_switch_rounds,style,true),style===p.training_style?f.training:f.branches[style]);}finally{a.policy.dispose();}
  }
  // Replay a full trial per rule in every world as a combat/source integration check.
  for(const mode of ['individual','additive-team']){
    const original=trials.find(t=>t.scenario===scenario.id&&t.seed===p.seeds[0]&&t.mode===mode);
    assert.deepEqual(runScenarioTrial(p,scenario,p.seeds[0],mode).trial,original);
    console.error(`Full combat replay matched ${scenario.id}/${mode}/${p.seeds[0]}`);
  }
}
assert.equal(runner.encounterCount(),240);
const reconstructed={...summarizeScenarios(p,trials,result.fixed),actualEncounters:count+runner.encounterCount(),protocolSha256:sha(bytes)};
assert.deepEqual(reconstructed,summary);
assert.deepEqual(summary,JSON.parse(await readFile(path.replace(/\.results\.json$/,'.summary.json'),'utf8')));
console.log(JSON.stringify({verifiedEncounters:11760,replayedPolicyDecisions:count*3,fullCombatReplays:960,sourceHashes:Object.keys(result.provenance.sourceHashes).length,disposition:summary.disposition,gates:summary.gates},null,2));
