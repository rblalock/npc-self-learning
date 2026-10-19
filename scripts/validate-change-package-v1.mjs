import assert from 'node:assert/strict';
import { readFile,mkdtemp,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root,sha,writeNew } from './synthetic/io.mjs';
const manifest=JSON.parse(await readFile(resolve(root,'docs/releases/change-detection-v1.package.json'))),archive=resolve(root,manifest.artifact);
assert.equal(sha(await readFile(archive)),manifest.sha256);const directory=await mkdtemp(resolve(root,'target/change-validation-'));
execFileSync('tar',['-xzf',archive,'-C',directory]);
const sums=execFileSync('shasum',['-a','256','-c','SHA256SUMS'],{cwd:directory,encoding:'utf8'}),
 tests=execFileSync(process.execPath,['--test','--test-reporter=tap','scripts/change-detection-v1.test.mjs'],{cwd:directory,encoding:'utf8',maxBuffer:4e6});
assert.match(tests,/# fail 0/);await writeFile(resolve(directory,'cold-tests.log'),tests);
const checked=execFileSync(process.execPath,['--input-type=module','-e',`
import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {checkHashes} from './scripts/synthetic/io.mjs';import {enumerate} from './scripts/opportunity-v2/fixtures.mjs';
import {GROUPS} from './scripts/change-detection-v1/design.mjs';import {trial} from './scripts/change-detection-v1/trial.mjs';
import {verify} from './scripts/change-detection-v1/verify.mjs';import {verifyBlock} from './scripts/research/verify.mjs';
const r=JSON.parse(await readFile('docs/experiments/change-detection-v1.results.json')),a=JSON.parse(await readFile('docs/experiments/change-detection-v1.audit.json'));
await checkHashes(r.provenance.sourceHashes);let auditCombats=0,learningCombats=0;
for(const x of a.records.filter(a=>a.fixture.seed===r.protocol.seeds[0])){for(const b of x.blocks.flat())auditCombats+=verifyBlock(b).encounters;assert.deepEqual(enumerate(x.fixture),x);}
for(const group of GROUPS){const t=r.trials.find(t=>t.group===group&&t.seed===r.protocol.seeds[0]);assert.ok(t);const x=a.records.find(a=>a.fixture.group===group&&a.fixture.seed===t.seed&&a.fixture.index===t.index);
 learningCombats+=verify(t,x,r.protocol).encounters;assert.deepEqual(trial(x,r.protocol),t);}
console.log(JSON.stringify({auditCombats,learningCombats}));
`],{cwd:directory,encoding:'utf8',maxBuffer:4e6});
const development=execFileSync(process.execPath,['scripts/verify-change-development-v1.mjs'],{cwd:directory,encoding:'utf8',maxBuffer:4e6});
const replay=execFileSync(process.execPath,['scripts/replay-change-detection-v1.mjs','--out','target/cold-view'],{cwd:directory,encoding:'utf8'});
for(const ext of ['json','html'])assert.equal(sha(await readFile(resolve(directory,'target/cold-view.'+ext))),sha(await readFile(resolve(directory,'docs/experiments/change-detection-v1-view.'+ext))));
const result={validatedAt:new Date().toISOString(),archiveSha256:manifest.sha256,checksumFiles:sums.trim().split('\n').length,tests:Number(tests.match(/# tests (\d+)/)[1]),
 ...JSON.parse(checked),development:JSON.parse(development),replay:JSON.parse(replay),identicalReplay:true,extraction:directory};
await writeNew(resolve(root,'docs/releases/change-detection-v1.validation.json'),result);console.log(JSON.stringify(result,null,2));
