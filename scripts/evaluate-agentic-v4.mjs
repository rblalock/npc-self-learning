import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, PROTOCOL, sourceHashes, checkSources, atomicJson } from './agentic-v4/io.mjs';
import { sha } from './agentic-v2/design.mjs';
import { prepare, fixedBranch, algorithmBranch, startBranch, nextObservation, advance, summarize } from './agentic-v4/trial.mjs';
import { createJournal } from './agentic-v2/journal.mjs';
import { createClaudeProvider } from './agentic-v1/provider.mjs';
import { claimLiveStudy } from './agentic-v3/live-guard.mjs';

async function waves(items, concurrency, action) {
  for(let i=0;i<items.length;i+=concurrency) {
    const settled=await Promise.allSettled(items.slice(i,i+concurrency).map(action));
    const failed=settled.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  }
}
export async function run({out,resume=false,protocol,provider,log=console.log,liveRegistration=null}) {
  const dir=resolve(ROOT,out);await mkdir(dir,{recursive:true});
  const resultPath=resolve(dir,'results.json'),startPath=resolve(dir,'started.json');
  try {await access(resultPath);throw Error('Completed result exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  let started;
  try {
    started=JSON.parse(await readFile(startPath,'utf8'));assert.ok(resume,'Existing run requires --resume');
    assert.deepEqual(started.protocol,protocol,'Protocol differs');await checkSources(started.sources);
  } catch(e) {
    if(e.code!=='ENOENT')throw e;assert.ok(!resume,'No started run to resume');
    started={schema:2,startedAt:new Date().toISOString(),protocol,protocolSha256:sha(protocol),sources:await sourceHashes(),
      baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch,
      ...(liveRegistration?{liveRegistration}:{})};
    await writeFile(startPath,JSON.stringify(started)+'\n',{flag:'wx'});
  }
  if(liveRegistration)assert.deepEqual(started.liveRegistration,liveRegistration,'Run must use its registered journal');
  const fixedReference=JSON.parse(await readFile(resolve(ROOT,protocol.fixedReference.summary),'utf8'));
  for(const c of protocol.fixedReference.plans)assert.equal(fixedReference.selection.find(x=>x.seed===c.seed&&x.index===c.index)?.planId,c.planId,'Prior calibration differs');
  const journal=await createJournal({directory:resolve(dir,'calls'),provider,limits:{maxCalls:protocol.agent.maxCalls,
    maxReportedCostUsd:protocol.agent.maxReportedCostUsd,maxBudgetUsdPerCall:protocol.agent.maxBudgetUsdPerCall,
    maxConsecutiveFailures:protocol.agent.maxConsecutiveFailures},resume,log});
  const result={...started,fixedReferenceSha256:sha(fixedReference),cases:[],calls:[],algorithmRuntime:[]},jobs=[],calls=new Map();
  for(const c of protocol.cases) {
    const training=prepare(c,protocol),record={...c,training,histories:{}};result.cases.push(record);
    for(const history of protocol.histories) {
      const algorithm=algorithmBranch(c,protocol,training,history,{onTiming:timing=>result.algorithmRuntime.push({caseSeed:c.seed,caseIndex:c.index,history,...timing})});
      const held=fixedBranch(c,protocol,training,history,algorithm.rows[0].fight.planId,{arm:'algorithm-initial'});
      assert.deepEqual(algorithm.rows[0].fight,held.rows[0],'Algorithm first fight must equal held control');
      const branches=[fixedBranch(c,protocol,training,history,'baseline',{arm:'retained'}),
        fixedBranch(c,protocol,training,history,protocol.fixedReference.plans.find(x=>x.seed===c.seed&&x.index===c.index).planId),algorithm,held];
      record.histories[history]=branches;
      for(let replicate=1;replicate<=protocol.agentReplicates;replicate++) {
        const branch=startBranch(c,protocol,training,history,'agent',replicate);
        branches.push(branch);jobs.push({c,training,history,replicate,branches,branch});
      }
    }
  }
  const savePartial=async(error=null)=>{
    result.calls=[...calls.values()].sort((a,b)=>a.id.localeCompare(b.id));
    await atomicJson(resolve(dir,'partial.json'),{...result,incomplete:true,stop:error?'Execution stopped; preserved journal retains accounting.':null});
  };
  try {
    for(let round=1;round<=protocol.postRounds;round++) {
      const offset=(round-1)%jobs.length,ordered=[...jobs.slice(offset),...jobs.slice(0,offset)];
      await waves(ordered,protocol.maxConcurrency,async({c,training,history,replicate,branches,branch})=>{
        const key={caseSeed:c.seed,caseIndex:c.index,history,replicate,arm:'agent',round};
        const call=await journal.decide(key,nextObservation(training,branch,protocol));calls.set(call.id,call);
        advance(protocol,training,branch,{call});
        if(round===1) {
          const held=fixedBranch(c,protocol,training,history,branch.rows[0].fight.planId,{arm:'agent-initial',replicate,originCallId:call.id});
          assert.deepEqual(branch.rows[0].fight,held.rows[0],'Agent first fight must equal held control');branches.push(held);
        }
      });
      await savePartial();log(JSON.stringify({completedPostRound:round,recordedCalls:calls.size}));
    }
    const armOrder=['retained','fixed','algorithm','algorithm-initial','agent','agent-initial'];
    for(const c of result.cases)for(const bs of Object.values(c.histories))bs.sort((a,b)=>a.replicate-b.replicate||armOrder.indexOf(a.arm)-armOrder.indexOf(b.arm));
    await checkSources(started.sources);result.calls=[...calls.values()].sort((a,b)=>a.id.localeCompare(b.id));result.completedAt=new Date().toISOString();
    await atomicJson(resultPath,result);const summary=summarize(result);await atomicJson(resolve(dir,'summary.json'),summary);
    log(JSON.stringify({complete:true,scoredFights:summary.scoredFights,calls:summary.recordedCalls,reportedCostUsd:summary.reportedCostUsd,overall:summary.overall}));
    return {results:result,summary};
  } catch(e) {await savePartial(e);throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2);let out=null,resume=false;
  for(let i=0;i<args.length;i++) {if(args[i]==='--out')out=args[++i];else if(args[i]==='--resume')resume=true;else throw Error('Use --out <directory> [--resume]');}
  assert.ok(out,'Explicit output directory required');const protocol=JSON.parse(await readFile(resolve(ROOT,PROTOCOL),'utf8'));
  const auth=spawnSync('claude',['auth','status'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  let loggedIn=false;try {loggedIn=auth.status===0&&JSON.parse(auth.stdout).loggedIn===true;}catch{}
  assert.ok(loggedIn,'Claude authentication check failed or timed out; no model requests sent. Check claude auth status in a terminal.');
  const guard=await claimLiveStudy({registry:resolve(ROOT,'target/agentic-npc-matched-v4.study.json'),out:resolve(ROOT,out),protocol});
  try {await run({out,resume,protocol,liveRegistration:guard.publicRecord,provider:createClaudeProvider({model:protocol.agent.model,
    effort:protocol.agent.effort,timeoutMs:protocol.agent.timeoutMs,maxBudgetUsd:protocol.agent.maxBudgetUsdPerCall})});}
  finally {await guard.release();}
}
