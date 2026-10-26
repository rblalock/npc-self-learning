import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './evaluate-agentic-v2.mjs';
import { verify,verifyAdmissions } from './verify-agentic-v2.mjs';

const original=JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-ablation-v2.protocol.json',import.meta.url),'utf8'));
const protocol={...original,cases:[original.cases[0]],histories:['stable'],postRounds:3,agentReplicates:1,calibrationReplicates:1,agent:{...original.agent,maxCalls:5,maxReportedCostUsd:1}};
const response={status:'ok',decision:{planId:'far',reason:'Use the chosen NPC plan.',prediction:'Measure next outcome.',memory:'Recorded note'},metadata:{costUsd:.01,durationMs:1,models:['test']}};

test('admission verification permits already-admitted cost overruns but rejects later dispatches',()=>{
  const calls=[1,2].map(i=>({dispatched:true,admissionOrder:i,completedBeforeAdmission:0,completionOrder:i,response:{status:'ok',metadata:{costUsd:i===1?100:0}}}));
  const limits={maxCalls:3,maxReportedCostUsd:.2,maxBudgetUsdPerCall:.1,maxConsecutiveFailures:3};
  assert.doesNotThrow(()=>verifyAdmissions(calls,limits));
  calls.push({dispatched:true,admissionOrder:3,completedBeforeAdmission:2,completionOrder:3,response:{status:'ok',metadata:{costUsd:0}}});
  assert.throws(()=>verifyAdmissions(calls,limits),/cost cap/);
});

test('paired study counts shared initialization once and exactly verifies calibration, controls, observations and fights',async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-v2-runner-'));let calls=0;
  try {
    const {results,summary}=await run({out,protocol,provider:{async decide(){calls++;return structuredClone(response);}},log:()=>{}});
    assert.equal(calls,5);assert.equal(summary.recordedCalls,5);assert.equal(summary.calibrationFights,31);assert.equal(summary.evaluationFights,25);
    await assert.rejects(verify(results),/frozen protocol/);
    const report=await verify(results,{allowProtocolOverride:true});assert.equal(report.totalPhysicalFightsReplayed,56);
    const bs=results.cases[0].histories.stable,full=bs.find(b=>b.arm==='full'),recent=bs.find(b=>b.arm==='recent');
    assert.equal(full.rows[0].callId,recent.rows[0].callId);assert.notEqual(full.rows[1].callId,recent.rows[1].callId);
    assert.equal(full.rows[1].observation.history.length,11);assert.equal(recent.rows[1].observation.history.length,1);
    const corrupted=structuredClone(results);corrupted.calibration[0].selection.planId=corrupted.calibration[0].selection.planId==='lead'?'aim':'lead';await assert.rejects(verify(corrupted,{sources:false,allowProtocolOverride:true}));
    const modified=structuredClone(results);modified.cases[0].histories.stable.find(b=>b.arm==='recent').rows[1].observation.history.push(full.rows[0].observation.history[0]);await assert.rejects(verify(modified,{sources:false,allowProtocolOverride:true}));
    for(const mutation of [c=>{c.dispatched=false;},c=>{c.response.metadata.costUsd=-1;},c=>{c.response.metadata.costUsd=100;}]){
      const bad=structuredClone(results.calls),first=bad.find(c=>c.admissionOrder===1);mutation(first);assert.throws(()=>verifyAdmissions(bad,protocol.agent));
    }
    const impossible=structuredClone(results),initial=impossible.calls.find(c=>c.key.arm==='shared');
    initial.response.metadata.costUsd=100;
    for(const c of impossible.calls){c.completedBeforeAdmission=0;c.completionOrder=c===initial?impossible.calls.length:c.completionOrder-1;}
    assert.doesNotThrow(()=>verifyAdmissions(impossible.calls,protocol.agent),'Generic ordering alone misses the dependency');
    await assert.rejects(verify(impossible,{sources:false,allowProtocolOverride:true}),/before predecessor completed/);
    await assert.rejects(run({out,protocol,provider:{decide(){throw Error('Must not call');}},log:()=>{}}),/Completed result exists/);
  }finally{await rm(out,{recursive:true,force:true});}
});

test('budget exhaustion preserves incomplete evidence and does not silently shorten the study',async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-v2-budget-'));let calls=0;
  try {
    const limited={...protocol,agent:{...protocol.agent,maxCalls:2}};
    await assert.rejects(run({out,protocol:limited,provider:{async decide(){calls++;return structuredClone(response);}},log:()=>{}}));
    assert.equal(calls,2);const partial=JSON.parse(await readFile(join(out,'partial.json'),'utf8'));assert.equal(partial.incomplete,true);assert.equal(partial.protocol.postRounds,3);
    assert.equal(partial.calls.length,2);await assert.rejects(readFile(join(out,'results.json')));
  }finally{await rm(out,{recursive:true,force:true});}
});
