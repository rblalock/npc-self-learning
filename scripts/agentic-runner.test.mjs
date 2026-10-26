import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './evaluate-agentic-v1.mjs';
import { verify } from './verify-agentic-v1.mjs';
import { sha } from './agentic-v1/design.mjs';

const p=JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-pilot-v1.protocol.json',import.meta.url),'utf8'));
const protocol={...p,cases:[p.cases[0]],histories:['stable'],postRounds:2,agentReplicates:1,agent:{...p.agent,maxCalls:2,maxReportedCostUsd:.2}};
const valid={status:'ok',decision:{planId:'baseline',reason:'Keep NPC configuration.',prediction:'No change expected.',memory:''},metadata:{models:['test-fixture'],durationMs:1,costUsd:.01}};

test('durable run refuses overwrites, replays saved calls and never resends a pending request',async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-runner-test-'));let dispatched=0;
  try {
    const provider={async decide(){dispatched++;return structuredClone(valid);}};
    const first=await run({out,provider,protocol,log:()=>{}});
    assert.equal(dispatched,2);assert.equal(first.summary.scoredFights,18);
    assert.equal((await verify(first.results)).verified,true);
    await assert.rejects(run({out,provider,protocol,log:()=>{}}),/Completed result exists/);
    await rm(join(out,'results.json'));await rm(join(out,'summary.json'));
    const names=(await readdir(join(out,'calls'))).sort();
    const firstCall=join(out,'calls',names[0]);const pending=JSON.parse(await readFile(firstCall,'utf8'));
    pending.response=null;await writeFile(firstCall,JSON.stringify(pending));
    await rm(join(out,'calls',names[1]));
    const resumed=await run({out,resume:true,provider,protocol,log:()=>{}});
    assert.equal(dispatched,3,'Pending first request must not be resent');
    assert.equal(resumed.summary.failedCalls,1);assert.equal(resumed.summary.unknownCostCalls,1);
    assert.equal(resumed.summary.reportedCostUsd,null);
    assert.equal((await verify(resumed.results)).verified,true);
  } finally {await rm(out,{recursive:true,force:true});}
});

test('no live call is made once the declared request budget is exhausted',async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-budget-test-'));let dispatched=0;
  try {
    const limited={...protocol,agent:{...protocol.agent,maxCalls:1}};
    await assert.rejects(run({out,protocol:limited,provider:{async decide(){dispatched++;return structuredClone(valid);}},log:()=>{}}),/request budget exhausted/);
    assert.equal(dispatched,1);
    const start=JSON.parse(await readFile(join(out,'started.json'),'utf8'));
    assert.equal(start.protocolSha256,sha(limited));
    assert.equal((await readdir(join(out,'calls'))).filter(n=>n.endsWith('.json')).length,1);
  } finally {await rm(out,{recursive:true,force:true});}
});

for(const kind of ['calls','cost'])test(`concurrent branches reserve the last ${kind} allowance before yielding`,async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-concurrent-test-'));let dispatched=0,settled=0;
  try {
    const limited={...protocol,postRounds:1,agentReplicates:2,agent:{...protocol.agent,maxCalls:kind==='calls'?1:2,maxReportedCostUsd:kind==='cost'?.1:.2}};
    const provider={async decide(){dispatched++;await new Promise(resolve=>setTimeout(resolve,30));settled++;return structuredClone(valid);}};
    await assert.rejects(run({out,protocol:limited,provider,log:()=>{}}),/budget exhausted/);
    assert.equal(dispatched,1);assert.equal(settled,1,'Runner must await the already-dispatched request before rejecting');
  } finally {await rm(out,{recursive:true,force:true});}
});

test('an in-flight success cannot reopen admission after the failure stop is latched',async()=>{
  const out=await mkdtemp(join(tmpdir(),'agentic-stop-test-'));let dispatched=0,settled=0;
  try {
    const limited={...protocol,postRounds:4,agentReplicates:2,agent:{...protocol.agent,maxCalls:8,maxReportedCostUsd:.8}};
    const provider={async decide(){const call=++dispatched;await new Promise(resolve=>setTimeout(resolve,call===2?60:1));settled++;
      return call===2?structuredClone(valid):{status:'error',error:{code:'test_failure'},metadata:{costUsd:0,durationMs:1,models:[]}};}};
    await assert.rejects(run({out,protocol:limited,provider,log:()=>{}}),/three consecutive provider failures/);
    assert.equal(dispatched,4,'Only the three failures and already-in-flight success may be dispatched');
    assert.equal(settled,4);
  } finally {await rm(out,{recursive:true,force:true});}
});
