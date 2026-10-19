import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { root,readProtocol,outputPrefix,hashes,SOURCE_PATHS,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { boundaryTrial,summarizeBoundary,boundaryReport } from './retention/boundary.mjs';

const {protocol:p,path,hash}=await readProtocol('switch-boundary-v1'),
  prefix=await outputPrefix(p.id), bytes=await readFile(resolve(root,p.parent)),parent=JSON.parse(bytes);
assert.equal(sha(bytes),p.parentSha256);
await checkHashes(parent.provenance.sourceHashes);
const sourceHashes=await hashes([...SOURCE_PATHS,path,'scripts/retention/boundary.mjs','scripts/evaluate-boundary.mjs','scripts/verify-boundary.mjs']),
  startedAt=new Date().toISOString(),start=performance.now(),cpu=process.cpuUsage();
await writeNew(prefix+'.started.json',{startedAt,protocolSha256:hash,sourceHashes,parentSha256:sha(bytes)});
const trials=[];
for(const old of parent.trials) {
  trials.push(boundaryTrial(p,parent,old));
  console.error(`Boundary ${trials.length}/${p.seeds.length}: ${old.seed}`);
}
await checkHashes(sourceHashes);
const summary=summarizeBoundary(p,trials),result={schema:1,protocol:p,
  provenance:{startedAt,completedAt:new Date().toISOString(),sourceHashes,protocolSha256:hash,parentSha256:sha(bytes),node:process.version,platform:process.platform,arch:process.arch,elapsedSeconds:(performance.now()-start)/1000,cpuMicroseconds:process.cpuUsage(cpu)},trials,summary};
await writeNew(prefix+'.results.json',result);
await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');
await writeNew(prefix+'.md',boundaryReport(p,summary));
console.log(JSON.stringify(summary.groups.aggregate,null,2));
