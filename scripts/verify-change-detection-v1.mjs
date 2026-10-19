import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, sha, checkHashes, writeNew } from './synthetic/io.mjs';
import { ID, protocol, jobs } from './change-detection-v1/io.mjs';
import { GROUPS } from './change-detection-v1/design.mjs';
import { analyze } from './change-detection-v1/analysis.mjs';
assert.ok(process.argv.length <= 3);
const prefix = resolve(root, process.argv[2] ?? `docs/experiments/${ID}`), bytes = await readFile(prefix + '.results.json'), r = JSON.parse(bytes);
const p = await protocol(), auditBytes = await readFile(prefix + '.audit.json'), audit = JSON.parse(auditBytes);
await checkHashes(r.provenance.sourceHashes); assert.deepEqual(r.protocol, p);
assert.equal(r.provenance.protocolSha256, sha(await readFile(resolve(root, `docs/experiments/${ID}.protocol.json`))));
assert.equal(r.provenance.auditSha256, sha(auditBytes)); assert.deepEqual(audit.sourceHashes, r.provenance.sourceHashes);
assert.equal(audit.protocolSha256, r.provenance.protocolSha256);
const batches = GROUPS.flatMap(group => p.seeds.map(seed => {
  const records = audit.records.filter(a => a.fixture.group === group && a.fixture.seed === seed);
  assert.deepEqual(records.map(a => a.fixture.index), Array.from({ length:p.candidates_per_seed },(_,i)=>i)); return records;
}));
assert.equal(batches.flat().length, audit.records.length);
const selection = batches.map(rs => ({ group:rs[0].fixture.group, seed:rs[0].fixture.seed, index:rs.find(a=>a.admission.accepted)?.fixture.index??null }));
assert.deepEqual(r.selection, selection); assert.deepEqual(JSON.parse(await readFile(prefix+'.selection.json')).selection, selection);
assert.deepEqual(r.trials.map(t=>({group:t.group,seed:t.seed,index:t.index})), selection.filter(s=>s.index!==null));
const av = await jobs(batches.map(records=>({mode:'verify-audit',records})),(n,t)=>{if(n%8===0)console.error(`Verify admission ${n}/${t}`);});
const tv = await jobs(r.trials.map(trial=>({mode:'verify-trial',trial,protocol:p,
  table:audit.records.find(a=>a.fixture.group===trial.group&&a.fixture.seed===trial.seed&&a.fixture.index===trial.index)})),
  (n,t)=>{if(n%4===0)console.error(`Verify learning ${n}/${t}`);});
assert.deepEqual(analyze(p,audit.records,r.trials),r.summary);
assert.deepEqual(JSON.parse(await readFile(prefix+'.summary.json')),r.summary);
const record = { resultSha256:sha(bytes),auditSha256:sha(auditBytes),auditReplays:av.reduce((n,v)=>n+v.encounters,0),
  learningReplays:tv.reduce((n,v)=>n+v.encounters,0),independentDecisions:[...av,...tv].reduce((n,v)=>n+v.decisions,0),matched:true };
assert.equal(record.auditReplays+record.learningReplays,r.summary.budget.total);
try { await writeNew(prefix+'.verification.json',{verifiedAt:new Date().toISOString(),...record}); }
catch(e) { if(e.code!=='EEXIST')throw e; const {verifiedAt,...previous}=JSON.parse(await readFile(prefix+'.verification.json'));assert.deepEqual(previous,record); }
console.log(JSON.stringify(record,null,2));
