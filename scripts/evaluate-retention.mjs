import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { readProtocol,outputPrefix,hashes,checkHashes,writeNew,SOURCE_PATHS } from './synthetic/io.mjs';
import { summarizeRetention,retentionReport } from './retention/analysis.mjs';

const {protocol:p,path,hash}=await readProtocol('retention-v1'),prefix=await outputPrefix(p.id),
  sources=[...SOURCE_PATHS,path,...['policy','players','runner','scenarios','trial','analysis','verify-trace','worker','boundary'].map(n=>`scripts/retention/${n}.mjs`),
    'scripts/evaluate-retention.mjs','scripts/verify-retention.mjs','scripts/retention.test.mjs'],
  sourceHashes=await hashes(sources),startedAt=new Date().toISOString(),start=performance.now(),cpu=process.cpuUsage();
await writeNew(prefix+'.started.json',{startedAt,protocolSha256:hash,sourceHashes});
const jobs=['legacy','synthetic'].flatMap(suite=>p[`${suite}_seeds`].map(seed=>({suite,seed}))),trials=Array(jobs.length);
let next=0,done=0;
await Promise.all(Array.from({length:4},async()=>{
  while(next<jobs.length) {
    const i=next++,job=jobs[i];
    trials[i]=await new Promise((resolve,reject)=>{
      const w=new Worker(new URL('./retention/worker.mjs',import.meta.url),{workerData:{protocol:p,...job}});let received=false;
      w.once('message',v=>{received=true;resolve(v);});w.once('error',reject);
      w.once('exit',code=>{if(code || !received)reject(Error(`Worker ${i} exited ${code}`));});
    });
    console.error(`Retention ${++done}/${jobs.length}: ${job.suite}/${job.seed}`);
  }
}));
await checkHashes(sourceHashes);
const summary=summarizeRetention(p,trials),r={schema:1,protocol:p,provenance:{startedAt,completedAt:new Date().toISOString(),sourceHashes,
  protocolSha256:hash,node:process.version,platform:process.platform,arch:process.arch,workers:4,elapsedSeconds:(performance.now()-start)/1000,cpuMicroseconds:process.cpuUsage(cpu)},trials,summary};
await writeNew(prefix+'.results.json',r);await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');
await writeNew(prefix+'.md',retentionReport(p,summary));
console.log(JSON.stringify({counts:summary.totalEncounters,gates:summary.gates,disposition:summary.disposition,elapsedSeconds:r.provenance.elapsedSeconds},null,2));
