import assert from 'node:assert/strict';
import { readFile, mkdir, readdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ROOT, PROTOCOL, sourceHashes, checkSources, atomicJson } from './agentic-v1/io.mjs';
import { sha, validateDecision } from './agentic-v1/design.mjs';
import { warmup, runBranch, summarize } from './agentic-v1/trial.mjs';
import { createClaudeProvider } from './agentic-v1/provider.mjs';

export async function run({out, resume=false, provider, protocol, log=console.log}) {
  const directory=resolve(ROOT,out), callsDir=resolve(directory,'calls');
  await mkdir(callsDir,{recursive:true});
  const startPath=resolve(directory,'started.json'),resultPath=resolve(directory,'results.json');
  try {await access(resultPath);throw Error('Completed result exists; use a new output directory');} catch(e) {if(e.code!=='ENOENT')throw e;}
  let started;
  try {
    started=JSON.parse(await readFile(startPath,'utf8'));assert.ok(resume,'Existing run requires --resume');
    assert.deepEqual(started.protocol,protocol,'Protocol differs from started run');await checkSources(started.sources);
  } catch(e) {
    if(e.code!=='ENOENT')throw e;
    assert.ok(!resume,'No started run to resume');
    started={schema:1,startedAt:new Date().toISOString(),protocol,protocolSha256:sha(protocol),sources:await sourceHashes(),
      baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
      node:process.version,platform:process.platform,arch:process.arch};
    await writeFile(startPath,JSON.stringify(started)+'\n',{flag:'wx'});
  }
  let dispatched=0,cost=0,accountedCost=0,reserved=0,consecutiveFailures=0,stoppedReason=null;
  for(const name of await readdir(callsDir)) if(name.endsWith('.json')) {
    const record=JSON.parse(await readFile(resolve(callsDir,name),'utf8'));
    if(record.dispatched)dispatched++;
    cost+=record.response?.metadata?.costUsd??0;
    accountedCost+=record.response?.metadata?.costUsd??protocol.agent.maxBudgetUsdPerCall;
  }
  const decide=async(key,observation)=>{
    const filename=`${key.caseSeed}-${key.history}-${key.replicate}-${key.round}.json`,path=resolve(callsDir,filename);
    let record;
    try {
      record=JSON.parse(await readFile(path,'utf8'));
      assert.deepEqual(record.observation,observation,'Resume observation changed');
      if(record.response)return record.response;
      record.response={status:'error',error:{code:'interrupted-request-outcome-unknown'},metadata:{durationMs:0,costUsd:null,models:[]}};
      await atomicJson(path,record);return record.response;
    } catch(e) {if(e.code!=='ENOENT')throw e;}
    assert.equal(stoppedReason,null,'Stopped after three consecutive provider failures; inspect preserved calls');
    assert.ok(dispatched<protocol.agent.maxCalls,'Agent request budget exhausted');
    assert.ok(accountedCost+reserved+protocol.agent.maxBudgetUsdPerCall<=protocol.agent.maxReportedCostUsd+1e-9,'Agent cost-accounting budget exhausted');
    // Reserve synchronously: another branch must not pass the same remaining
    // allowance while this branch yields to the journal write.
    dispatched++;reserved+=protocol.agent.maxBudgetUsdPerCall;
    record={key,observation,observationSha256:sha(observation),dispatched:true,response:null};
    await atomicJson(path,record);
    let response;
    try {response=await provider.decide(observation);} catch {response={status:'error',error:{code:'provider-exception'},metadata:{durationMs:0,costUsd:null,models:[]}};}
    if(response.status==='ok') {
      try {validateDecision(response.decision);} catch {response={...response,status:'error',error:{code:'invalid-decision'}};}
    }
    reserved-=protocol.agent.maxBudgetUsdPerCall;cost+=response.metadata?.costUsd??0;
    accountedCost+=response.metadata?.costUsd??protocol.agent.maxBudgetUsdPerCall;
    consecutiveFailures=response.status==='ok'?0:consecutiveFailures+1;
    if(consecutiveFailures>=3)stoppedReason='provider-failure-threshold';
    record.response=response;await atomicJson(path,record);
    log(JSON.stringify({case:key.caseSeed,history:key.history,replicate:key.replicate,round:key.round,status:response.status,
      plan:response.status==='ok'?response.decision.planId:null,dispatchedCalls:dispatched,reportedCostUsd:+cost.toFixed(4)}));
    return response;
  };
  const results={...started,cases:[]};
  for(const c of protocol.cases) {
    const training=warmup(c,protocol),caseResult={...c,training,histories:{}};
    for(const history of protocol.histories) {
      const branches=[];
      for(const arm of protocol.controls)branches.push(await runBranch(c,protocol,training,history,arm,0,decide));
      // Independent agent contexts; synchronous combat sections never overlap.
      const attempts=await Promise.allSettled(Array.from({length:protocol.agentReplicates},(_,i)=>runBranch(c,protocol,training,history,'agent',i+1,decide)));
      const failed=attempts.find(a=>a.status==='rejected');
      if(failed)throw failed.reason; // All in-flight CLI calls have settled first.
      branches.push(...attempts.map(a=>a.value));
      caseResult.histories[history]=branches;
    }
    results.cases.push(caseResult);
  }
  await checkSources(started.sources);
  results.completedAt=new Date().toISOString();
  await atomicJson(resultPath,results);
  const summary=summarize(results);await atomicJson(resolve(directory,'summary.json'),summary);
  log(JSON.stringify({complete:true,scoredFights:summary.scoredFights,calls:summary.recordedCalls,reportedCostUsd:summary.reportedCostUsd,byHistory:summary.byHistory}));
  return {results,summary};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);let out=null,resume=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--out')out=args[++i];else if(args[i]==='--resume')resume=true;else throw Error('Use --out <new-directory> [--resume]');
  }
  assert.ok(out,'Explicit --out directory is required for live model calls');
  const protocol=JSON.parse(await readFile(resolve(ROOT,PROTOCOL),'utf8'));
  const provider=createClaudeProvider({model:protocol.agent.model,effort:protocol.agent.effort,timeoutMs:protocol.agent.timeoutMs,maxBudgetUsd:protocol.agent.maxBudgetUsdPerCall});
  await run({out,resume,provider,protocol});
}
