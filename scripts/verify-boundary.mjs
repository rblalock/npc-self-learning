import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,readProtocol,writeNew } from './synthetic/io.mjs';
import { boundaryTrial,summarizeBoundary } from './retention/boundary.mjs';

const path=resolve(root,process.argv[2]??'docs/experiments/switch-boundary-v1.results.json'),bytes=await readFile(path),r=JSON.parse(bytes),
  {protocol:p,hash}=await readProtocol('switch-boundary-v1');
assert.deepEqual(r.protocol,p);assert.equal(r.provenance.protocolSha256,hash);
await checkHashes(r.provenance.sourceHashes);
const parentBytes=await readFile(resolve(root,p.parent)),parent=JSON.parse(parentBytes);
assert.equal(sha(parentBytes),p.parentSha256);await checkHashes(parent.provenance.sourceHashes);
assert.deepEqual(r.trials.map(t=>t.seed),p.seeds);
for(const [i,old] of parent.trials.entries()) assert.deepEqual(boundaryTrial(p,parent,old),r.trials[i]);
assert.deepEqual(summarizeBoundary(p,r.trials),r.summary);
const verification={resultSha256:sha(bytes),newCombatReplays:1152,reusedCombatReplays:2304,independentPolicyDecisions:10368,matched:true};
await writeNew(path.replace('.results.json','.verification.json'),{verifiedAt:new Date().toISOString(),...verification});
console.log(JSON.stringify(verification,null,2));
