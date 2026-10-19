import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { ID,protocol,jobs } from './opportunity-v2/io.mjs';
import { GROUPS } from './opportunity-v2/fixtures.mjs';
import { analyze } from './opportunity-v2/metrics.mjs';

assert.ok(process.argv.length<=3);const prefix=resolve(root,process.argv[2]??`docs/experiments/${ID}`),bytes=await readFile(prefix+'.results.json'),r=JSON.parse(bytes),p=await protocol(),auditBytes=await readFile(prefix+'.audit.json'),a=JSON.parse(auditBytes);
assert.deepEqual(r.protocol,p);await checkHashes(r.provenance.sourceHashes);assert.equal(sha(auditBytes),r.provenance.auditSha256);
assert.deepEqual(a.sourceHashes,r.provenance.sourceHashes);assert.equal(a.protocolSha256,r.provenance.protocolSha256);
assert.equal(r.provenance.protocolSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}.protocol.json`))));
const batches=GROUPS.flatMap(group=>p.seeds.map(seed=>{
  const records=a.records.filter(a=>a.fixture.group===group&&a.fixture.seed===seed);
  assert.deepEqual(records.map(a=>a.fixture.index),Array.from({length:p.candidates_per_seed},(_,i)=>i));return records;
}));
assert.equal(batches.flat().length,a.records.length);
const selection=batches.map(rs=>({group:rs[0].fixture.group,seed:rs[0].fixture.seed,index:rs.find(a=>a.admission.accepted)?.fixture.index??null}));
assert.deepEqual(selection,r.selection);assert.deepEqual(JSON.parse(await readFile(prefix+'.selection.json')).selection,selection);
assert.deepEqual(r.trials.map(t=>({group:t.group,seed:t.seed,index:t.index})),selection.filter(s=>s.index!==null));
const av=await jobs(batches.map(records=>({mode:'verify-audit',records})),(d,t)=>{if(d%16===0)console.error(`Audit verification ${d}/${t}`);});
const tv=await jobs(r.trials.map(t=>({mode:'verify-trial',trial:t,protocol:p,fixture:a.records.find(a=>a.fixture.group===t.group&&a.fixture.seed===t.seed&&a.fixture.index===t.index).fixture})),
  (d,t)=>{if(d%16===0)console.error(`Learning verification ${d}/${t}`);});
assert.deepEqual(analyze(p,a.records,r.trials),r.summary);
const record={resultSha256:sha(bytes),auditSha256:sha(auditBytes),auditReplays:av.reduce((n,v)=>n+v.encounters,0),learningReplays:tv.reduce((n,v)=>n+v.encounters,0),
  independentDecisions:[...av,...tv].reduce((n,v)=>n+v.decisions,0),matched:true};
assert.equal(record.auditReplays+record.learningReplays,r.summary.budget.total);
try{await writeNew(prefix+'.verification.json',{verifiedAt:new Date().toISOString(),...record});}catch(e){if(e.code!=='EEXIST')throw e;const {verifiedAt,...previous}=JSON.parse(await readFile(prefix+'.verification.json'));assert.deepEqual(previous,record);}
console.log(JSON.stringify(record,null,2));
