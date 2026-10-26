import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT,checkSources } from './agentic-v2/io.mjs';
import { sha,decisionFrom,validateDecision } from './agentic-v2/design.mjs';
import { calibrate,warmup,fixedBranch,agentBranch,initialObservation,summarize } from './agentic-v2/trial.mjs';

export async function verify(r,{sources=true}={}) {
  assert.equal(r.protocolSha256,sha(r.protocol));if(sources)await checkSources(r.sources);
  assert.equal(r.calibration.length,r.protocol.cases.length);assert.equal(r.cases.length,r.protocol.cases.length);
  assert.equal(sha(r.calibration),r.calibrationSha256);
  const byKey=new Map(),used=new Set();
  for(const call of r.calls) {
    const key=sha(call.key);assert.equal(call.id,key,'Call identity differs from key hash');assert.ok(!byKey.has(key),'Duplicate call key');byKey.set(key,call);
    assert.equal(call.observationSha256,sha(call.observation));assert.ok(call.response);
    if(call.response.status==='ok')validateDecision(call.response.decision);
    if(call.response.call) {
      const t=call.response.call;
      assert.equal(t.prompt,`Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(call.observation)}`);
      for(const field of ['prompt','systemPrompt','schema'])assert.equal(sha(t[field]),t[field+'Sha256']);
      assert.deepEqual(JSON.parse(t.schema).properties.planId.enum,call.observation.plans.map(p=>p.id));
      assert.equal(call.response.metadata.requestedModel,r.protocol.agent.model);assert.equal(call.response.metadata.effort,r.protocol.agent.effort);
    }
  }
  assert.equal(new Set(r.calls.map(x=>x.id)).size,r.calls.length,'Duplicate call identity');
  const lookup=(key,obs)=>{const call=byKey.get(sha(key));assert.ok(call,'Missing call');assert.deepEqual(call.key,key);assert.deepEqual(call.observation,obs);used.add(call.id);return call;};
  let calibrationFights=0,evaluationFights=0;
  for(let ci=0;ci<r.protocol.cases.length;ci++) {
    const spec=r.protocol.cases[ci],calibration=calibrate(spec,r.protocol);assert.deepEqual(calibration,r.calibration[ci],'Calibration replay mismatch');
    for(const b of calibration.data.batches)calibrationFights+=b.training.rows.length+Object.values(b.histories).flat().reduce((n,x)=>n+x.rows.length,0);
    const c=r.cases[ci];assert.equal(c.seed,spec.seed);assert.equal(c.index,spec.index);
    const training=warmup(spec,r.protocol);assert.deepEqual(c.training,training);evaluationFights+=training.rows.length;
    assert.deepEqual(Object.keys(c.histories),r.protocol.histories);
    for(const [h,bs]of Object.entries(c.histories)) {
      const identities=[['retained',0],['fixed',0],...Array.from({length:r.protocol.agentReplicates},(_,i)=>[['initial',i+1],['full',i+1],['recent',i+1]]).flat()];
      assert.deepEqual(bs.map(b=>[b.arm,b.replicate]),identities);
      for(const b of bs) {
        let replay;
        if(b.arm==='retained'||b.arm==='fixed')replay=fixedBranch(spec,r.protocol,training,h,b.arm==='retained'?'baseline':calibration.selection.planId,{arm:b.arm});
        else {
          const first=lookup({caseSeed:c.seed,caseIndex:c.index,history:h,replicate:b.replicate,arm:'shared',round:1},initialObservation(training));
          if(b.arm==='initial')replay=fixedBranch(spec,r.protocol,training,h,decisionFrom(first.response,'baseline','').planId,{arm:'initial',replicate:b.replicate,originCallId:first.id});
          else replay=await agentBranch(spec,r.protocol,training,h,b.arm,b.replicate,first,async(key,obs)=>lookup(key,obs));
        }
        assert.deepEqual(b,replay,`Trajectory replay mismatch: ${c.seed}/${h}/${b.arm}/${b.replicate}`);evaluationFights+=b.rows.length;
      }
      for(let rep=1;rep<=r.protocol.agentReplicates;rep++) {
        const first=bs.find(b=>b.arm==='initial'&&b.replicate===rep).rows[0];
        for(const arm of ['full','recent'])assert.deepEqual(bs.find(b=>b.arm===arm&&b.replicate===rep).rows[0].fight,first);
      }
    }
  }
  assert.equal(used.size,r.calls.length,'Orphan call in results');
  const expectedCalls=r.protocol.cases.length*r.protocol.histories.length*r.protocol.agentReplicates*(1+2*(r.protocol.postRounds-1));
  assert.equal(r.calls.length,expectedCalls);const s=summarize(r);
  assert.equal(s.calibrationFights,calibrationFights);assert.equal(s.evaluationFights,evaluationFights);
  return {schema:1,verified:true,resultsSha256:sha(r),calibrationFightsReplayed:calibrationFights,evaluationFightsReplayed:evaluationFights,totalPhysicalFightsReplayed:calibrationFights+evaluationFights,uniqueAgentDecisionsReplayed:used.size,sourceHashesChecked:sources,modelCallsMade:0,scope:'Exact replay of recorded model decisions; not independent replication or regenerated model outputs.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=process.argv[2];assert.ok(file,'Supply results.json[.gz]');const raw=await readFile(resolve(ROOT,file));
  console.log(JSON.stringify(await verify(JSON.parse((file.endsWith('.gz')?gunzipSync(raw):raw).toString())),null,2));
}
