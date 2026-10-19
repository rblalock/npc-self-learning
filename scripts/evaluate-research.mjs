import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { verifyBaseline } from './evidence-baseline.mjs';
import { hashes,checkHashes,writeNew } from './synthetic/io.mjs';
import { protocols,newDirectory,RESEARCH_SOURCES,workers,sha,root } from './research/io.mjs';
import { readFile } from 'node:fs/promises';
import { summarize,report } from './research/analysis.mjs';

const ps=await protocols(),directory=await newDirectory();
console.error(verifyBaseline());
const sourceHashes=await hashes(RESEARCH_SOURCES),startedAt=new Date().toISOString();
await writeNew(resolve(directory,'research-program-v1.started.json'),{startedAt,sourceHashes,protocols:ps.map(p=>p.id),expectedEncounters:ps.reduce((s,p)=>s+p.expected_encounters,0)});
for(const p of ps) {
  const prefix=resolve(directory,p.id),start=performance.now(),cpu=process.cpuUsage(),studyStartedAt=new Date().toISOString(),
    protocolSha256=sha(await readFile(resolve(root,`docs/experiments/${p.id}.protocol.json`)));
  await writeNew(prefix+'.started.json',{startedAt:studyStartedAt,programStartedAt:startedAt,sourceHashes,protocolSha256});
  const trials=await workers(p.seeds.map(seed=>({protocol:p,seed})),(done,total,j)=>console.error(`${p.id}: ${done}/${total}, seed ${j.seed}`));
  await checkHashes(sourceHashes);
  const summary=summarize(p,trials),result={schema:1,protocol:p,provenance:{startedAt:studyStartedAt,completedAt:new Date().toISOString(),
    sourceHashes,protocolSha256,node:process.version,platform:process.platform,arch:process.arch,workers:4,
    elapsedSeconds:(performance.now()-start)/1000,cpuMicroseconds:process.cpuUsage(cpu)},trials,summary};
  await writeNew(prefix+'.results.json',result);await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');
  await writeNew(prefix+'.md',report(p,summary));
  console.log(JSON.stringify({id:p.id,encounters:summary.budget.encounters,primary:summary.primary.meanDifference,interval:summary.primary.interval,gates:summary.gates,disposition:summary.disposition}));
}
