import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,hashes,writeNew } from './synthetic/io.mjs';
import { combat } from './research/combat.mjs';
import { sequence } from './change-detection-v1/design.mjs';
const id='conservative-development-v1',bytes=await readFile(resolve(root,`docs/experiments/${id}.results.json`)),r=JSON.parse(bytes);
const verification=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.verification.json`)));
assert.equal(verification.matched,true);assert.equal(verification.resultSha256,sha(bytes));await checkHashes(r.sourceHashes);
const recordings=[];
for(const table of r.tables.filter(t=>t.fixture.seed===31001)) {
  const t=r.trials.find(t=>t.group===table.fixture.group&&t.seed===31001);
  for(const [history,rounds] of Object.entries({abrupt:[1,32,128],stable:[1,128,256]})) {
    const schedule=sequence(table.fixture,history,r.protocol.histories[history]);
    for(const arm of r.protocol.arms)for(const round of rounds) {
      const rows=t.histories[history].arms[arm].rows,row=rows[round-1],s=schedule[round-1];
      const actual=combat(s.scenario,[table.fixture.group.slice(5)],{[row.choice.request.role]:row.choice.action},{capture:true});
      const measured=table.blocks[row.side].find(b=>b.rows[0].choices[0].action===row.choice.action).rows[0];
      for(const key of ['damage','health','duration','enemies','inputSha256'])assert.deepEqual(actual.row[key],measured[key]);
      const before=row.signal?t.checkpoint.cells.map(()=>[0,0]):round===1?t.checkpoint.cells.map(c=>[c.score,c.samples]):rows[round-2].after;
      recordings.push({group:t.group,history,arm,round,seed:t.seed,index:t.index,world:s.scenario.world,row,before,
        duration:actual.row.duration,result:actual.row.result,frames:actual.frames});
    }
  }
}
assert.equal(recordings.length,126);
const payload={id,summary:r.summary,recordings,verification,arms:r.protocol.arms,
 selection:'First known seed 31001 for all three roles. Abrupt rounds 1, 32, 128; stable rounds 1, 128, 256. This display rule was chosen after aggregate results, without searching for favorable encounters. All-seed tables accompany it. These are development cases.'};
const json=JSON.stringify(payload),html=(await readFile(resolve(root,'scripts/conservative-v1-view.html'),'utf8')).replace('__PAYLOAD__',json.replaceAll('<','\\u003c'));
await writeNew(resolve(root,`docs/experiments/${id}-view.html`),html);
await writeNew(resolve(root,`docs/experiments/${id}-view.json`),payload);
await writeNew(resolve(root,`docs/experiments/${id}-view.view.json`),{recordings:126,resultSha256:sha(bytes),htmlSha256:sha(html),payloadSha256:sha(json+'\n'),sources:await hashes(['scripts/replay-conservative-v1.mjs','scripts/conservative-v1-view.html'])});
console.log(JSON.stringify({recordings:126,htmlBytes:Buffer.byteLength(html)}));
