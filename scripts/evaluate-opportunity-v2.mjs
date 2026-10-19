import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { root,sha,hashes,checkHashes,writeNew,outputPrefix } from './synthetic/io.mjs';
import { GROUPS } from './opportunity-v2/fixtures.mjs';
import { ID,SOURCES,protocol,jobs,report } from './opportunity-v2/io.mjs';
import { analyze } from './opportunity-v2/metrics.mjs';

const p=await protocol(),prefix=await outputPrefix(ID),sourceHashes=await hashes(SOURCES),
  protocolSha256=sha(await readFile(resolve(root,`docs/experiments/${ID}.protocol.json`))),startedAt=new Date().toISOString(),start=performance.now(),cpu=process.cpuUsage();
await writeNew(prefix+'.started.json',{startedAt,sourceHashes,protocolSha256});
const batches=await jobs(GROUPS.flatMap(group=>p.seeds.map(seed=>({mode:'audit',group,seed,count:p.candidates_per_seed}))),
  (done,total)=>{if(done%8===0)console.error(`Admission ${done}/${total}`);}),records=batches.flat();
await checkHashes(sourceHashes);await writeNew(prefix+'.audit.json',{protocolSha256,sourceHashes,records});
const selection=GROUPS.flatMap(group=>p.seeds.map(seed=>{
  const accepted=records.find(a=>a.fixture.group===group&&a.fixture.seed===seed&&a.admission.accepted);
  return {group,seed,index:accepted?.fixture.index??null};
}));
await writeNew(prefix+'.selection.json',{selectedBeforeLearningAt:new Date().toISOString(),selection});
const selected=selection.filter(s=>s.index!==null).map(s=>records.find(a=>a.fixture.group===s.group&&a.fixture.seed===s.seed&&a.fixture.index===s.index));
console.error(JSON.stringify({admission:Object.fromEntries(GROUPS.map(g=>[g,selected.filter(a=>a.fixture.group===g).length]))}));
const trials=await jobs(selected.map(a=>({mode:'trial',fixture:a.fixture,protocol:p})),(done,total)=>{if(done%8===0)console.error(`Learning ${done}/${total}`);});
await checkHashes(sourceHashes);const summary=analyze(p,records,trials),result={schema:1,protocol:p,
  provenance:{startedAt,completedAt:new Date().toISOString(),sourceHashes,protocolSha256,auditSha256:sha(await readFile(prefix+'.audit.json')),
    node:process.version,elapsedSeconds:(performance.now()-start)/1000,cpuMicroseconds:process.cpuUsage(cpu)},selection,trials,summary};
await writeNew(prefix+'.results.json',result);await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');await writeNew(prefix+'.md',report(p,summary));
console.log(JSON.stringify({budget:summary.budget,groups:Object.fromEntries(Object.entries(summary.groups).map(([g,v])=>[g,{qualified:v.qualified,effect:v.primary?.meanDifference,interval:v.primary?.interval,gates:v.gates}]))},null,2));
