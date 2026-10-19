import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { verifyBlock } from './research/verify.mjs';
import { enumerate } from './opportunity-v2/fixtures.mjs';
import { trial } from './change-detection-v1/trial.mjs';
import { verify } from './change-detection-v1/verify.mjs';
import { analyze } from './change-detection-v1/analysis.mjs';
const path=resolve(root,'docs/experiments/change-detection-development-v1.json'),bytes=await readFile(path),d=JSON.parse(bytes);
await checkHashes(d.sourceHashes);let physical=0,decisions=0;
for(const [i,t] of d.trials.entries()) {
  const a=d.tables[i];assert.deepEqual(enumerate(a.fixture),a);
  for(const b of a.blocks.flat()){verifyBlock(b);physical+=b.rows.length;}
  decisions+=verify(t,a,d.protocol).decisions;assert.deepEqual(trial(a,d.protocol,{cached:true}),t);
}
assert.deepEqual(analyze(d.protocol,d.tables,d.trials),d.summary);
const record={artifactSha256:sha(bytes),physicalTableReplays:physical,cachedTransitions:decisions,matched:true};
try{await writeNew(path.replace(/\.json$/,'.verification.json'),record);}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(JSON.parse(await readFile(path.replace(/\.json$/,'.verification.json'))),record);}
console.log(JSON.stringify(record,null,2));
