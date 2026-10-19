import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,readProtocol,writeNew } from './synthetic/io.mjs';
import { retentionTrial } from './retention/trial.mjs';
import { verifyTrace } from './retention/verify-trace.mjs';
import { summarizeRetention } from './retention/analysis.mjs';

const path=resolve(root,process.argv[2]??'docs/experiments/retention-v1.results.json'),bytes=await readFile(path),r=JSON.parse(bytes),
  {protocol:p,hash}=await readProtocol('retention-v1');
assert.deepEqual(p,r.protocol);assert.equal(r.provenance.protocolSha256,hash);await checkHashes(r.provenance.sourceHashes);
let policyEncounters=0,combatReplays=0;
for(const t of r.trials) {
  // This uses the host for full physical reconstruction; policy verification below bypasses it.
  assert.deepEqual(retentionTrial(p,t.seed,t.suite),t);
  for(const variant of p.variants) {
    const verify=(rows,schedule,snapshot,learning=true)=>{
      policyEncounters+=rows.length;combatReplays+=rows.length;
      return verifyTrace(t.seed,rows,{schedule,snapshot,learning,variant});
    };
    const training=verify(t.training[variant].rows,t.manifests.training);
    assert.deepEqual(training,t.training[variant].snapshot);
    for(const [id,versions] of Object.entries(t.branches)) {
      const schedule=t.manifests.tests[id],v=versions[variant];let checkpoint=training;
      if(v.repeat) {
        checkpoint=verify(v.repeat.rows,schedule.filter(s=>s.phase==='repeat'),training);
        assert.deepEqual(checkpoint,v.repeat.snapshot);
      }
      for(const phase of t.suite==='legacy'?['switch']:['switch','return']) {
        const b=v[phase],scenarios=schedule.filter(s=>s.phase===phase);
        assert.deepEqual(b.snapshot,checkpoint);
        checkpoint=verify(b.online,scenarios,b.snapshot);assert.deepEqual(checkpoint,b.endSnapshot);
        verify(b.frozen,scenarios,b.snapshot,false);
      }
    }
  }
  console.error(`Verified ${t.suite}/${t.seed}`);
}
assert.equal(policyEncounters,p.expected_encounters);assert.deepEqual(summarizeRetention(p,r.trials),r.summary);
const verification={resultsSha256:sha(bytes),protocolSha256:hash,combatReplays,independentPolicyDecisions:policyEncounters*3,matched:true};
await writeNew(path.replace('.results.json','.verification.json'),{verifiedAt:new Date().toISOString(),...verification});
console.log(JSON.stringify(verification,null,2));
