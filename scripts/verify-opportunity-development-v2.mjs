import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { block } from './research/combat.mjs';
import { verifyBlock } from './research/verify.mjs';
import { sha,writeNew,root } from './synthetic/io.mjs';
import { resolve } from 'node:path';
const path=resolve(root,'docs/experiments/opportunity-development-v2.json'),bytes=await readFile(path),r=JSON.parse(bytes);
for(const [path,source] of Object.entries(r.sources))assert.equal(sha(source),r.sourceHashes[path]);
let encounters=0,decisions=0;
for(const a of r.records)for(const b of a.blocks.flat()) {
  const v=verifyBlock(b);encounters+=v.encounters;decisions+=v.decisions;
  assert.deepEqual(block(b.seed,b.spec,b.scenarios,{...b.options,snapshot:b.initial}),b);
}
assert.equal(encounters,r.scoredEncounters);
const result={resultSha256:sha(bytes),fullCombatReplays:encounters,independentDecisions:decisions,matched:true,
  scope:'Development action tables, with their embedded pre-refinement generator sources. Not reserved learning evidence.'};
await writeNew(resolve(root,'docs/experiments/opportunity-development-v2.verification.json'),result);console.log(JSON.stringify(result));
