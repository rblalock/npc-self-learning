import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { enumerate } from './opportunity-v2/fixtures.mjs';
import { verifyBlock } from './research/verify.mjs';
import { trial } from './conservative-v1/trial.mjs';
import { verify } from './conservative-v1/verify.mjs';
import { analyze } from './conservative-v1/analysis.mjs';
const prefix=resolve(root,process.argv[2]??'docs/experiments/conservative-development-v1'), bytes=await readFile(prefix+'.results.json'),r=JSON.parse(bytes);
await checkHashes(r.sourceHashes);
let transitions=0,physicalTables=0,physicalTrajectories=0;
for(const [i,table] of r.tables.entries()) {
  assert.deepEqual(enumerate(table.fixture),table);
  for(const b of table.blocks.flat()){verifyBlock(b);physicalTables+=b.rows.length;}
  transitions+=verify(r.trials[i],table,r.protocol);
  if(i%16===0) {
    const actual=trial(table,r.protocol,{physical:true,histories:{abrupt:128,stable:256}}),recorded=r.trials[i];
    assert.deepEqual(actual.training,recorded.training); assert.deepEqual(actual.checkpoint,recorded.checkpoint);
    for(const h of ['abrupt','stable'])assert.deepEqual(actual.histories[h],recorded.histories[h]);
    physicalTrajectories+=32+r.protocol.arms.length*(128+256);
  }
  if((i+1)%8===0)console.error(`Verify ${i+1}/${r.tables.length}`);
}
assert.deepEqual(analyze(r.trials,r.tables,r.protocol),r.summary);
const record={resultSha256:sha(bytes),matched:true,cachedTransitions:transitions,physicalTableReplays:physicalTables,physicalTrajectoryReplays:physicalTrajectories,newScoredPhysicalEncounters:0};
try {await writeNew(prefix+'.verification.json',record);} catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(JSON.parse(await readFile(prefix+'.verification.json')),record);}
console.log(JSON.stringify(record,null,2));
