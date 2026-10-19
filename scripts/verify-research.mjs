import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,IDS,protocols,workers,sha } from './research/io.mjs';
import { checkHashes,writeNew } from './synthetic/io.mjs';
import { summarize } from './research/analysis.mjs';

const args=process.argv.slice(2);assert.ok(args.length<=1,'Use [results-directory]');
const directory=resolve(root,args[0]??'docs/experiments'),ps=await protocols();
for(const [i,id] of IDS.entries()) {
  const prefix=resolve(directory,id),bytes=await readFile(prefix+'.results.json'),r=JSON.parse(bytes),p=ps[i];
  assert.deepEqual(p,r.protocol);await checkHashes(r.provenance.sourceHashes);
  assert.equal(r.provenance.protocolSha256,sha(await readFile(resolve(root,`docs/experiments/${id}.protocol.json`))));
  assert.deepEqual(r.trials.map(t=>t.seed),p.seeds);
  const checks=await workers(r.trials.map(trial=>({mode:'verify',protocol:p,trial})),(done,total)=>console.error(`Verify ${id}: ${done}/${total}`));
  assert.deepEqual(summarize(p,r.trials),r.summary);
  const record={resultSha256:sha(bytes),protocolSha256:r.provenance.protocolSha256,fullCombatReplays:checks.reduce((s,c)=>s+c.encounters,0),
    independentPolicyDecisions:checks.reduce((s,c)=>s+c.decisions,0),matched:true};
  assert.equal(record.fullCombatReplays,p.expected_encounters);
  try {await writeNew(prefix+'.verification.json',{verifiedAt:new Date().toISOString(),...record});}
  catch(e) {if(e.code!=='EEXIST')throw e;const {verifiedAt,...previous}=JSON.parse(await readFile(prefix+'.verification.json'));assert.deepEqual(previous,record);}
  console.log(JSON.stringify({id,...record}));
}
