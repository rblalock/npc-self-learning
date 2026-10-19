import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { root, sha, hashes, checkHashes, writeNew } from './synthetic/io.mjs';
import { ID } from './change-detection-v1/io.mjs';
import { GROUPS, HISTORIES, ARMS } from './change-detection-v1/design.mjs';
import { createPolicy } from './research/policy.mjs';
import { encounter } from './research/combat.mjs';
const args=process.argv.slice(2);assert.ok(!args.length||(args.length===2&&args[0]==='--out'));
const prefix=resolve(root,args[1]??`docs/experiments/${ID}-view`),bytes=await readFile(resolve(root,`docs/experiments/${ID}.results.json`)),r=JSON.parse(bytes);
const verification=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}.verification.json`)));
assert.equal(verification.resultSha256,sha(bytes));assert.equal(verification.matched,true);await checkHashes(r.provenance.sourceHashes);
const groups=[];let reconstructed=0;
for(const group of GROUPS) {
 const trial=r.trials.find(t=>t.group===group&&t.seed===r.protocol.demonstration.seed),summary=r.summary.groups[group];
 if(!trial){groups.push({id:group,summary,missing:true});continue;}
 const metrics=r.summary.cases.find(t=>t.group===group&&t.seed===trial.seed),histories={};
 for(const h of HISTORIES) {
  const source=trial.histories[h],rounds=new Set([1,8,32,64]);
  // Diagnostic selection is explicit: first false alarm for each detector, plus
  // the next decision. No search for strongest harm or best-looking fight.
  if(h==='stable')for(const a of ['detector-reset','detector-selective']) {
   const first=source.arms[a].steps.find(s=>s.event)?.round;
   if(first){rounds.add(first);if(first<64)rounds.add(first+1);}
  }
  const recordings={};
  for(const a of ARMS) {
   recordings[a]={};
   for(const round of [...rounds].sort((a,b)=>a-b)) {
    const step=source.arms[a].steps[round-1],b=step.block,policy=createPolicy(b.seed,b.spec);
    try {
     policy.request({op:'restore',snapshot:b.initial});
     const value=encounter(policy,b.spec,b.scenarios[0],{...b.options,capture:true});
     assert.deepEqual(value.row,b.rows[0]);assert.deepEqual(policy.request({op:'snapshot'}),b.snapshot);reconstructed++;
     recordings[a][round]={...value,scenario:b.scenarios[0],initial:b.initial,afterIntervention:step.afterIntervention,
      event:step.event,signal:step.signal,metric:metrics.histories[h][a].rows[round-1]};
    } finally {policy.dispose();}
   }
  }
  histories[h]={recordings,rounds:[...rounds].sort((a,b)=>a-b),metrics:metrics.histories[h],signals:source.signals};
 }
 groups.push({id:group,seed:trial.seed,index:trial.index,missing:false,summary,histories});
}
const payload={id:ID,groups,verification,budget:r.summary.budget,reconstructed,
 selection:'First reserved seed 31001, first qualifying candidate in each role. Fixed replay rounds 1, 8, 32, 64. Extra stable-history rounds show the first false alarm of each detector and its next decision; these are labeled diagnostics, not representative samples.',
 primaryInterval:r.protocol.primary_uncertainty.interval};
await mkdir(dirname(prefix),{recursive:true});await writeNew(prefix+'.json',payload);
const html=(await readFile(resolve(root,'scripts/change-detection-v1-view.html'),'utf8')).replace('__PAYLOAD__',JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeNew(prefix+'.html',html);
await writeNew(prefix+'.view.json',{resultSha256:sha(bytes),htmlSha256:sha(html),payloadSha256:sha(JSON.stringify(payload)+'\n'),
 sources:await hashes(['scripts/replay-change-detection-v1.mjs','scripts/change-detection-v1-view.html']),reconstructed,recordings:reconstructed});
console.log(JSON.stringify({html:prefix+'.html',reconstructed}));
