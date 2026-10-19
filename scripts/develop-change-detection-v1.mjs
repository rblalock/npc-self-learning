import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, sha, hashes, writeNew } from './synthetic/io.mjs';
import { protocol, SOURCES, jobs } from './change-detection-v1/io.mjs';
import { GROUPS } from './change-detection-v1/design.mjs';
import { analyze } from './change-detection-v1/analysis.mjs';
import { verify } from './change-detection-v1/verify.mjs';
const p=await protocol(),bytes=await readFile(resolve(root,'docs/experiments/opportunity-validation-v2.audit.json'));
const v=JSON.parse(await readFile(resolve(root,'docs/experiments/opportunity-validation-v2.verification.json')));
assert.equal(sha(bytes),v.auditSha256);assert.equal(v.matched,true);
const records=JSON.parse(bytes).records,tables=GROUPS.flatMap(group=>p.development_seeds.map(seed=>records.find(a=>a.fixture.group===group&&a.fixture.seed===seed&&a.admission.accepted)).filter(Boolean));
const sourceHashes=await hashes([...SOURCES,'scripts/develop-change-detection-v1.mjs','scripts/verify-change-development-v1.mjs']);
const trials=await jobs(tables.map(table=>({mode:'trial',table,protocol:p,cached:true})),(n,t)=>console.error(`Cached development ${n}/${t}`));
for(const [i,t] of trials.entries())verify(t,tables[i],p);
const summary=analyze(p,tables,trials),result={schema:1,createdAt:new Date().toISOString(),sourceHashes,sourceAuditSha256:sha(bytes),
  note:'Previously verified physical tables, now development. All generated histories use cached outcomes. Zero new scored physical fights; table entries are reused, not new evidence. One detector rule, no sweep.',
  protocol:p,tables,trials,summary,newPhysicalEncounters:0};
await writeNew(resolve(root,'docs/experiments/change-detection-development-v1.json'),result);
console.log(JSON.stringify({cases:tables.length,cachedTransitions:summary.budget.learningEncounters,comparisons:Object.fromEntries(Object.entries(summary.groups).map(([g,v])=>[g,v.comparisons]))},null,2));
