import assert from 'node:assert/strict';
import { readFile,mkdtemp,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root,sha,writeNew } from './synthetic/io.mjs';

const manifest=JSON.parse(await readFile(resolve(root,'docs/releases/research-lab-v1-r2.package.json'))),archive=resolve(root,manifest.artifact);
assert.equal(sha(await readFile(archive)),manifest.sha256);
const directory=await mkdtemp(resolve(root,'target/research-lab-validation-'));
execFileSync('tar',['-xzf',archive,'-C',directory]);
const sums=execFileSync('shasum',['-a','256','-c','SHA256SUMS'],{cwd:directory,encoding:'utf8'});
const tests=execFileSync(process.execPath,['--test','--test-reporter=tap','scripts/research.test.mjs','scripts/opportunity-audit.test.mjs'],{cwd:directory,encoding:'utf8',maxBuffer:4e6});
await writeFile(resolve(directory,'cold-tests.log'),tests);
assert.match(tests,/# fail 0/);
const checks=execFileSync(process.execPath,['--input-type=module','-e',`
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDS} from './scripts/research/io.mjs';
import {checkHashes} from './scripts/synthetic/io.mjs';
import {runTrial} from './scripts/research/trials.mjs';
import {verifyTrial,verifyBlock} from './scripts/research/verify.mjs';
import {block} from './scripts/research/combat.mjs';
const checks=[];let mainCombats=0,auditCombats=0;
for(const id of IDS){const r=JSON.parse(await readFile('docs/experiments/'+id+'.results.json'));await checkHashes(r.provenance.sourceHashes);
 const t=r.trials[0],v=verifyTrial(t);assert.deepEqual(runTrial(r.protocol,t.seed),t);mainCombats+=v.encounters;checks.push({id,seed:t.seed,...v});}
const audit=JSON.parse(await readFile('docs/experiments/learning-opportunity-audit-v1.results.json'));await checkHashes(audit.provenance.sourceHashes);
const firstSeeds=Object.fromEntries(IDS.map(id=>[id,audit.records.find(r=>r.study===id).seed]));
for(const rec of audit.records){if(rec.seed!==firstSeeds[rec.study])continue;
 verifyBlock(rec.block);const b=rec.block;assert.deepEqual(block(b.seed,b.spec,b.scenarios,{...b.options,snapshot:b.initial}),b);auditCombats+=b.rows.length;}
console.log(JSON.stringify({checks,mainCombats,auditCombats}));
`],{cwd:directory,encoding:'utf8',maxBuffer:4e6});
const replay=execFileSync(process.execPath,['scripts/replay-research.mjs','--out','target/cold-view'],{cwd:directory,encoding:'utf8'});
for(const ext of ['json','html'])assert.equal(sha(await readFile(resolve(directory,'target/cold-view.'+ext))),sha(await readFile(resolve(directory,'docs/experiments/research-program-v1-view-2.'+ext))));
const result={validatedAt:new Date().toISOString(),archiveSha256:manifest.sha256,checksumFiles:sums.trim().split('\n').length,
  tests:Number(tests.match(/# tests (\d+)/)[1]),...JSON.parse(checks),replay:JSON.parse(replay),replayHtmlAndPayloadIdentical:true,extraction:directory};
await writeNew(resolve(root,'docs/releases/research-lab-v1-r2.validation.json'),result);console.log(JSON.stringify(result,null,2));
