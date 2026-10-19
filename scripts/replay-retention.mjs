import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,writeNew,hashes } from './synthetic/io.mjs';
import { retentionArena } from './retention/policy.mjs';
import { runEncounter } from './retention/runner.mjs';

assert.ok(!process.argv[2] || (process.argv[2]==='--out' && process.argv.length===4),'Use --out <new-prefix>');
const prefix=resolve(root,process.argv[3]??'docs/experiments/retention-v1-view'),
  bytes=await readFile(resolve(root,'docs/experiments/retention-v1.results.json')),r=JSON.parse(bytes),d=r.protocol.demonstration;
await checkHashes(r.provenance.sourceHashes);
const t=r.trials.find(t=>t.seed===d.seed&&t.suite===d.suite),schedule=t.manifests.tests[d.case].filter(s=>s.phase===d.phase),recordings={};
let combatReplays=0;
for(const variant of r.protocol.variants)for(const mode of ['online','frozen']) {
  const b=t.branches[d.case][variant][d.phase],arena=retentionArena(t.seed,{variant,snapshot:b.snapshot,learning:mode==='online'});
  try {
    for(let i=0;i<d.round;i++) {
      const value=runEncounter(arena,schedule[i],{capture:i===d.round-1}),row=i===d.round-1?value.row:value;
      assert.deepEqual(row,b[mode][i]);combatReplays++;
      if(i===d.round-1)recordings[`${variant}-${mode}`]=value;
    }
  } finally{arena.policy.dispose();}
}
const c=r.summary.groups.synthetic.fresh.switch.candidateGain,
  payload={schema:1,experiment:r.protocol.id,resultsSha256:sha(bytes),seed:d.seed,case:d.case,round:d.round,scenario:schedule[d.round-1],recordings,combatReplays,
    selection:d.selection,aggregate:`Across the fresh suite: no decay − original = ${c.meanDifference.toFixed(2)} HP [${c.interval.map(v=>v.toFixed(2)).join(', ')}], 95% interval. This one encounter is not the average. No decay disables automatic fading; rewards still update scores.`};
await writeNew(prefix+'.json',payload);
const template=await readFile(resolve(root,'scripts/retention-replay-view.html'),'utf8'),html=template.replace('__PAYLOAD__',JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeNew(prefix+'.html',html);
await writeNew(prefix+'.view.json',{resultsSha256:sha(bytes),payloadSha256:sha(JSON.stringify(payload)+'\n'),htmlSha256:sha(html),
  sources:await hashes(['scripts/replay-retention.mjs','scripts/retention-replay-view.html']),combatReplays});
console.log(JSON.stringify({html:prefix+'.html',combatReplays,selection:d.selection}));
