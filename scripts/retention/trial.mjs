import assert from 'node:assert/strict';
import { retentionArena } from './policy.mjs';
import { runSequence } from './runner.mjs';
import { trainingSchedule,syntheticSchedules,legacySchedule } from './scenarios.mjs';
import { identity } from './boundary.mjs';

function sequence(seed,variant,schedule,options={}) {
  const arena=retentionArena(seed,{variant,...options});
  try {const rows=runSequence(arena,schedule);return {rows,snapshot:arena.policy.request({op:'snapshot'})};}
  finally {arena.policy.dispose();}
}
function fork(seed,variant,snapshot,schedule) {
  const online=sequence(seed,variant,schedule,{snapshot}),frozen=sequence(seed,variant,schedule,{snapshot,learning:false});
  assert.deepEqual(identity(online.rows[0]),identity(frozen.rows[0]));
  return {snapshot,online:online.rows,frozen:frozen.rows,endSnapshot:online.snapshot};
}
export function retentionTrial(p,seed,suite) {
  const training={},branches={},manifests={training:suite==='legacy'?legacySchedule('orbit',p.legacy_training_rounds,'training'):trainingSchedule(p,seed,'diverse'),
    tests:suite==='legacy'?Object.fromEntries(['reverse','feint','cover'].map(s=>[s,legacySchedule(s,p.legacy_switch_rounds,'switch')])):syntheticSchedules(p,seed)};
  for(const variant of p.variants) {
    training[variant]=sequence(seed,variant,manifests.training);
    for(const [id,schedule] of Object.entries(manifests.tests)) {
      branches[id]??={};
      if(suite==='legacy') {
        branches[id][variant]={switch:fork(seed,variant,training[variant].snapshot,schedule)};
      } else {
        const repeat=sequence(seed,variant,schedule.filter(s=>s.phase==='repeat'),{snapshot:training[variant].snapshot}),
          switched=fork(seed,variant,repeat.snapshot,schedule.filter(s=>s.phase==='switch')),
          returned=fork(seed,variant,switched.endSnapshot,schedule.filter(s=>s.phase==='return'));
        branches[id][variant]={repeat,switch:switched,return:returned};
      }
    }
  }
  return {seed,suite,manifests,training,branches};
}
