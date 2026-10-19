import assert from 'node:assert/strict';
import { readFile,access,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { root,sha,SOURCE_PATHS } from '../synthetic/io.mjs';
export { root,sha };
export const IDS=['individual-adaptation-v1','team-coordination-v1','situational-memory-v1','return-memory-v1','deception-stress-v1','curriculum-budget-v1'];
export const RESEARCH_SOURCES=[...SOURCE_PATHS,
  ...['policy','combat','players','scenarios','trials','analysis','verify','worker','io'].map(n=>`scripts/research/${n}.mjs`),
  'scripts/research.test.mjs','scripts/evaluate-research.mjs','scripts/verify-research.mjs',
  ...IDS.map(id=>`docs/experiments/${id}.protocol.json`)];
export async function protocols() {
  return Promise.all(IDS.map(async id=>JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.protocol.json`)))));
}
export async function newDirectory() {
  const args=process.argv.slice(2);assert.ok(args.length===0||(args.length===2&&args[0]==='--out'),'Use --out <new-directory>');
  const directory=resolve(root,args[1]??'docs/experiments');await mkdir(directory,{recursive:true});
  for(const file of ['research-program-v1.started.json',...IDS.flatMap(id=>[id+'.started.json',id+'.results.json',id+'.summary.json',id+'.md'])]) {
    try {await access(resolve(directory,file));throw Error(`Refusing to overwrite ${file}`);}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return directory;
}
export async function workers(jobs,onDone=()=>{}) {
  const results=Array(jobs.length);let next=0,done=0;
  await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
    while(next<jobs.length) {
      const i=next++;results[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:jobs[i]});let received=false;
        w.once('message',v=>{received=true;resolve(v);});w.once('error',reject);
        w.once('exit',code=>{if(code||!received)reject(Error(`Worker ${i} exited ${code}`));});
      });onDone(++done,jobs.length,jobs[i]);
    }
  }));
  return results;
}
