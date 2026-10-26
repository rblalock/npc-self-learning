import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { ROOT,PROTOCOL,checkSources } from './agentic-v2/io.mjs';
import { sha,decisionFrom } from './agentic-v2/design.mjs';
import { calibrate,warmup,fixedBranch,startAgent,advanceAgent,initialObservation } from './agentic-v2/trial.mjs';
import { verifyAdmissions } from './verify-agentic-v2.mjs';

const input=process.argv[2];assert.ok(input,'Supply incomplete attempt JSON or gzip');
const bytes=await readFile(resolve(ROOT,input)),r=JSON.parse((input.endsWith('.gz')?gunzipSync(bytes):bytes).toString());
assert.equal(r.incomplete,true);assert.equal(r.protocolSha256,sha(r.protocol));
assert.deepEqual(r.protocol,JSON.parse(await readFile(resolve(ROOT,PROTOCOL),'utf8')));await checkSources(r.sources);
verifyAdmissions(r.calls,r.protocol.agent);
assert.equal(sha(r.calibration),r.calibrationSha256);
const calls=new Map(r.calls.map(c=>[c.id,c]));assert.equal(calls.size,r.calls.length);
let calibrationFights=0,evaluationFights=0;
for(let i=0;i<r.protocol.cases.length;i++) {
  const spec=r.protocol.cases[i],cal=calibrate(spec,r.protocol);assert.deepEqual(cal,r.calibration[i]);
  for(const b of cal.data.batches)calibrationFights+=b.training.rows.length+Object.values(b.histories).flat().reduce((n,x)=>n+x.rows.length,0);
  const c=r.cases[i];assert.equal(c.seed,spec.seed);assert.equal(c.index,spec.index);
  const training=warmup(spec,r.protocol);assert.deepEqual(training,c.training);evaluationFights+=training.rows.length;
  for(const [history,branches]of Object.entries(c.histories))for(const b of branches) {
    let replay;
    if(b.arm==='retained'||b.arm==='fixed')replay=fixedBranch(spec,r.protocol,training,history,b.arm==='retained'?'baseline':cal.selection.planId,{arm:b.arm});
    else if(b.arm==='initial') {
      const call=calls.get(b.originCallId);assert.ok(call);assert.deepEqual(call.observation,initialObservation(training));
      replay=fixedBranch(spec,r.protocol,training,history,decisionFrom(call.response,'baseline','').planId,{arm:'initial',replicate:b.replicate,originCallId:call.id});
    } else {
      replay=startAgent(spec,r.protocol,training,history,b.arm,b.replicate);
      for(const row of b.rows){const call=calls.get(row.callId);assert.ok(call);advanceAgent(r.protocol,training,replay,call);}
    }
    assert.deepEqual(replay,b);evaluationFights+=b.rows.length;
  }
}
for(const c of calls.values()) {
  assert.equal(c.id,sha(c.key));assert.equal(c.observationSha256,sha(c.observation));
  assert.equal(c.key.arm,'shared');assert.equal(c.key.round,1);
  assert.equal(c.response.status,'error');assert.equal(c.response.metadata.costUsd,0);
  const transcript=c.response.call;assert.ok(transcript);
  assert.equal(transcript.prompt,`Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(c.observation)}`);
  for(const field of ['prompt','systemPrompt','schema'])assert.equal(sha(transcript[field]),transcript[field+'Sha256']);
}
console.log(JSON.stringify({schema:1,verified:true,incomplete:true,resultsSha256:sha(r),calibrationFightsReplayed:calibrationFights,evaluationFightsReplayed:evaluationFights,totalPhysicalFightsReplayed:calibrationFights+evaluationFights,failedInitializationRequests:calls.size,reportedCostUsd:0,modelCallsMade:0,scope:'Recorded infrastructure-failure attempt only; no completed agent comparison or effectiveness conclusion.'},null,2));
