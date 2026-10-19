import assert from 'node:assert/strict';
import { createArena, runSequence } from '../synthetic/runner.mjs';
import { verifyTrace } from '../synthetic/verify.mjs';
import { mean, pairedBootstrap } from '../evaluation-support.mjs';

export const identity = r => ({ damage:r.damage, result:r.result, duration:r.duration,
  enemies:r.enemies, inputs:r.inputs, inputSha256:r.inputSha256,
  choices:r.choices, steps:r.steps });

export function boundaryTrial(p, parent, old) {
  const manifest = parent.manifests.find(m => m.seed === old.seed), branches = {};
  for (const [id, schedule] of Object.entries(manifest.tests)) {
    branches[id] = {};
    for (const arm of p.arms) {
      const history = old.branches[id][`${arm}-online`],
        repeat = schedule.slice(0,p.boundary_round),
        switched = schedule.slice(p.boundary_round,p.boundary_round+p.evaluation_rounds),
        arena = createArena(old.seed,{snapshot:old.snapshots[arm]});
      let snapshot;
      try {
        assert.deepEqual(runSequence(arena,repeat),history.slice(0,p.boundary_round));
        snapshot = arena.policy.request({op:'snapshot'});
        assert.deepEqual(verifyTrace(old.seed,history.slice(0,p.boundary_round),{
          snapshot:old.snapshots[arm],learning:true,schedule:repeat}),snapshot);
        assert.deepEqual(runSequence(arena,switched),history.slice(p.boundary_round,p.boundary_round+p.evaluation_rounds));
      } finally { arena.policy.dispose(); }
      const frozen = createArena(old.seed,{snapshot,learning:false});
      let rows;
      try { rows = runSequence(frozen,switched); } finally { frozen.policy.dispose(); }
      const online = history.slice(p.boundary_round,p.boundary_round+p.evaluation_rounds);
      assert.deepEqual(identity(online[0]),identity(rows[0]),'First post-switch combat must match');
      for (const [learning, trace] of [[true,online],[false,rows]])
        verifyTrace(old.seed,trace,{snapshot,learning,schedule:switched});
      branches[id][arm] = {snapshot,online,frozen:rows};
    }
  }
  return {seed:old.seed,branches};
}
export function summarizeBoundary(p,trials) {
  assert.deepEqual(trials.map(t=>t.seed),p.seeds);
  const cases=Object.keys(trials[0].branches),groups={};
  for (const group of [...cases,'aggregate']) {
    const ids=group==='aggregate'?cases:[group];
    groups[group]={};
    for(const arm of p.arms) {
      const values=mode=>trials.map(t=>({seed:t.seed,value:mean(ids.flatMap(id=>
        t.branches[id][arm][mode].slice(-p.late_rounds).map(r=>r.damage)))}));
      groups[group][arm]={online:mean(values('online').map(r=>r.value)),
        frozen:mean(values('frozen').map(r=>r.value)),
        effect:pairedBootstrap(values('online'),values('frozen'),p.uncertainty)};
    }
  }
  const primary=groups.aggregate[p.primary_arm].effect,
    newEncounters=trials.reduce((n,t)=>n+Object.values(t.branches).reduce((s,c)=>s+Object.values(c).reduce((v,a)=>v+a.frozen.length,0),0),0);
  assert.equal(newEncounters,p.expected_new_encounters);
  return {groups,newEncounters,reusedOnlineEncounters:newEncounters,reconstructionReplays:newEncounters*2,
    primarySupported:primary.meanDifference>=p.criterion.minimum_gain && primary.interval[0]>p.criterion.lower_bound};
}
export function boundaryReport(p,s) {
  const fmt=c=>`${c.meanDifference.toFixed(2)} [${c.interval.map(v=>v.toFixed(2)).join(', ')}]`;
  return `# Exact strategy-switch control — v1\n\nPost-switch learning criterion: **${s.primarySupported?'met':'not met'}**. No learner change.\n\n${s.newEncounters} newly scored frozen encounters; ${s.reusedOnlineEncounters} reused online encounters; ${s.reconstructionReplays} reconstruction replays, excluded from new evidence.\n\n| Case | Training | Online damage | Boundary-frozen damage | Difference [95% CI] |\n|---|---|---:|---:|---:|\n`+
    Object.entries(s.groups).flatMap(([id,arms])=>Object.entries(arms).map(([a,v])=>`| ${id} | ${a} | ${v.online.toFixed(2)} | ${v.frozen.toFixed(2)} | ${fmt(v.effect)} |`)).join('\n')+
    `\n\nThe checkpoint is after repeat round 12, immediately before the switch. Values average switch rounds 9–12. First combat is identical in each pair.\n\n${p.limits.map(l=>'- '+l).join('\n')}\n\nReproduce: \`npm run evaluate:boundary -- --out target/boundary-replication\`. Verify: \`npm run verify:boundary\`.\n`;
}
