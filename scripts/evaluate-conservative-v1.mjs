import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, sha, hashes, checkHashes, writeNew, outputPrefix } from './synthetic/io.mjs';
import { SOURCES as previousSources } from './change-detection-v1/io.mjs';
import { trial } from './conservative-v1/trial.mjs';
import { analyze } from './conservative-v1/analysis.mjs';
import { verify } from './conservative-v1/verify.mjs';

const id='conservative-development-v1', protocolPath=`docs/experiments/${id}.protocol.json`;
const p=JSON.parse(await readFile(resolve(root,protocolPath))), prefix=await outputPrefix(id);
const paths=[...previousSources,protocolPath,p.source_audit,p.source_selection,p.source_verification,
  ...['intervention','trial','analysis','verify','stress'].map(n=>`scripts/conservative-v1/${n}.mjs`),
  'scripts/evaluate-conservative-v1.mjs','scripts/verify-conservative-v1.mjs','scripts/conservative-v1.test.mjs','scripts/check-conservative-arithmetic-v1.py'];
const sourceHashes=await hashes(paths), old=JSON.parse(await readFile(resolve(root,p.source_verification)));
assert.equal(old.matched,true); assert.equal(sourceHashes[p.source_audit],old.auditSha256);
const audit=JSON.parse(await readFile(resolve(root,p.source_audit))), selection=JSON.parse(await readFile(resolve(root,p.source_selection)));
await checkHashes(audit.sourceHashes);
const tables=selection.selection.filter(s=>s.index!==null).map(s=>audit.records.find(a=>a.fixture.group===s.group&&a.fixture.seed===s.seed&&a.fixture.index===s.index));
assert.equal(tables.length,48); assert.ok(tables.every(a=>a.admission.accepted));
for(const group of ['solo-vanguard','solo-flanker','solo-ranger']) {
  const selected=tables.filter(t=>t.fixture.group===group);
  assert.equal(selected.length,16); assert.equal(new Set(selected.map(t=>t.fixture.seed)).size,16);
  for(const t of selected)assert.equal(t.fixture.index,audit.records.find(a=>a.fixture.group===group&&a.fixture.seed===t.fixture.seed&&a.admission.accepted).fixture.index);
}
await writeNew(prefix+'.started.json',{startedAt:new Date().toISOString(),sourceHashes,sourceAuditSha256:old.auditSha256,caseCount:tables.length});
const trials=[];
for(const [i,table] of tables.entries()) {
  const t=trial(table,p); verify(t,table,p); trials.push(t);
  if((i+1)%4===0)console.error(`Development ${i+1}/${tables.length}`);
}
const summary=analyze(trials,tables,p); await checkHashes(sourceHashes);
const result={schema:1,completedAt:new Date().toISOString(),node:process.version,protocol:p,sourceHashes,tables,trials,summary};
await writeNew(prefix+'.results.json',result); await writeNew(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({disposition:summary.disposition,selected:summary.selected,budget:summary.budget,
  groups:Object.fromEntries(Object.entries(summary.groups).map(([g,v])=>[g,Object.fromEntries(p.candidates.map(a=>{const c=v.comparisons[a];return[a,{gain:c.gain.meanDifference,stable:c.stable.meanDifference,rate:c.interventionRate,gates:c.gates}]}))]))},null,2));
