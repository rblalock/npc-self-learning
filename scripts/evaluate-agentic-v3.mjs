import assert from 'node:assert/strict';
import { access,mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync,spawnSync } from 'node:child_process';
import { ROOT,PROTOCOL,sourceHashes,checkSources,atomicJson } from './agentic-v3/io.mjs';
import { sha,decisionFrom } from './agentic-v3/design.mjs';
import { warmup,fixedBranch,startAgent,nextObservation,advanceAgent,initialObservation,summarize } from './agentic-v3/trial.mjs';
import { createJournal } from './agentic-v2/journal.mjs';
import { createClaudeProvider } from './agentic-v1/provider.mjs';
import { claimLiveStudy } from './agentic-v3/live-guard.mjs';

async function waves(items,concurrency,run) {
  for(let i=0;i<items.length;i+=concurrency) {
    const settled=await Promise.allSettled(items.slice(i,i+concurrency).map(run));
    const failed=settled.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  }
}

export async function run({out,resume=false,protocol,provider,log=console.log,liveRegistration=null}) {
  const dir=resolve(ROOT,out);await mkdir(dir,{recursive:true});
  const resultPath=resolve(dir,'results.json'),startPath=resolve(dir,'started.json');
  try {await access(resultPath);throw Error('Completed result exists; use a new output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
  let started;
  try {
    started=JSON.parse(await readFile(startPath,'utf8'));assert.ok(resume,'Existing run requires --resume');
    assert.deepEqual(started.protocol,protocol,'Protocol differs');await checkSources(started.sources);
  }catch(e){
    if(e.code!=='ENOENT')throw e;assert.ok(!resume,'No started run to resume');
    started={schema:2,startedAt:new Date().toISOString(),protocol,protocolSha256:sha(protocol),sources:await sourceHashes(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch,...(liveRegistration?{liveRegistration}: {})};
    await writeFile(startPath,JSON.stringify(started)+'\n',{flag:'wx'});
  }
  if(liveRegistration)assert.deepEqual(started.liveRegistration,liveRegistration,'Resume must use the registered live journal, not an offline fixture');
  const fixedReference=JSON.parse(await readFile(resolve(ROOT,protocol.fixedReference.summary),'utf8'));
  for(const c of protocol.fixedReference.plans)assert.equal(fixedReference.selection.find(x=>x.seed===c.seed&&x.index===c.index)?.planId,c.planId,'Prior calibration differs');
  const journal=await createJournal({directory:resolve(dir,'calls'),provider,limits:{maxCalls:protocol.agent.maxCalls,maxReportedCostUsd:protocol.agent.maxReportedCostUsd,maxBudgetUsdPerCall:protocol.agent.maxBudgetUsdPerCall,maxConsecutiveFailures:protocol.agent.maxConsecutiveFailures},resume,log});
  const result={...started,fixedReferenceSha256:sha(fixedReference),cases:[],calls:[]},pairs=[],calls=new Map();
  for(let ci=0;ci<protocol.cases.length;ci++) {
    const c=protocol.cases[ci],training=warmup(c,protocol),record={...c,training,histories:{}};result.cases.push(record);
    for(const history of protocol.histories) {
      const branches=[fixedBranch(c,protocol,training,history,'baseline',{arm:'retained'}),fixedBranch(c,protocol,training,history,protocol.fixedReference.plans.find(x=>x.seed===c.seed&&x.index===c.index).planId)];
      record.histories[history]=branches;
      for(let replicate=1;replicate<=protocol.agentReplicates;replicate++)pairs.push({c,training,history,replicate,branches,immediate:startAgent(c,protocol,training,history,'immediate',replicate),gated:startAgent(c,protocol,training,history,'gated',replicate)});
    }
  }
  const request=async(key,obs)=>{const record=await journal.decide(key,obs);calls.set(record.id,record);return record;};
  const savePartial=async(error=null)=>{
    result.calls=[...calls.values()].sort((a,b)=>a.id.localeCompare(b.id));
    await atomicJson(resolve(dir,'partial.json'),{...result,incomplete:true,stop:error?'Execution stopped; inspect preserved journal and limits.':null});
  };
  try {
    await waves(pairs,protocol.maxConcurrency,async pair=>{
      const {c,training,history,replicate}=pair;
      const call=await request({caseSeed:c.seed,caseIndex:c.index,history,replicate,arm:'shared',round:1},initialObservation(training));
      const plan=decisionFrom(call.response,'baseline','').planId;
      const initial=fixedBranch(c,protocol,training,history,plan,{arm:'initial',replicate,originCallId:call.id});
      advanceAgent(protocol,training,pair.immediate,call);advanceAgent(protocol,training,pair.gated,call);
      assert.deepEqual(pair.immediate.rows[0].fight,pair.gated.rows[0].fight);assert.deepEqual(pair.immediate.rows[0].fight,initial.rows[0]);
      pair.branches.push(initial,pair.immediate,pair.gated);
    });
    await savePartial();
    for(let round=2;round<=protocol.postRounds;round++) {
      const jobs=pairs.flatMap(pair=>['immediate','gated'].map(arm=>({pair,arm})));
      const offset=(round-2)%jobs.length,ordered=[...jobs.slice(offset),...jobs.slice(0,offset)];
      await waves(ordered,protocol.maxConcurrency,async({pair,arm})=>{
        const {c,training,history,replicate}=pair,b=pair[arm];
        const call=await request({caseSeed:c.seed,caseIndex:c.index,history,replicate,arm,round},nextObservation(training,b));
        advanceAgent(protocol,training,b,call);
      });
      await savePartial();log(JSON.stringify({completedPostRound:round,recordedCalls:calls.size}));
    }
    for(const c of result.cases)for(const bs of Object.values(c.histories))bs.sort((a,b)=>a.replicate-b.replicate||['retained','fixed','initial','immediate','gated'].indexOf(a.arm)-['retained','fixed','initial','immediate','gated'].indexOf(b.arm));
    await checkSources(started.sources);result.calls=[...calls.values()].sort((a,b)=>a.id.localeCompare(b.id));result.completedAt=new Date().toISOString();
    await atomicJson(resultPath,result);const summary=summarize(result);await atomicJson(resolve(dir,'summary.json'),summary);
    log(JSON.stringify({complete:true,scoredFights:summary.scoredFights,calls:summary.recordedCalls,reportedCostUsd:summary.reportedCostUsd,byHistory:summary.byHistory}));
    return {results:result,summary};
  }catch(e){await savePartial(e);throw e;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);let out=null,resume=false;
  for(let i=0;i<args.length;i++){if(args[i]==='--out')out=args[++i];else if(args[i]==='--resume')resume=true;else throw Error('Use --out <new-directory> [--resume]');}
  assert.ok(out,'Explicit output directory required');const protocol=JSON.parse(await readFile(resolve(ROOT,PROTOCOL),'utf8'));
  // Authentication diagnostics can contain account and local-path details.
  // Check privately before creating an experiment; never print the envelope.
  const auth=spawnSync('claude',['auth','status'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  assert.notEqual(auth.error?.code,'ETIMEDOUT','Claude authentication check timed out before the study started. Check claude auth status in a terminal; no model requests were sent.');
  let signedIn=false;try{signedIn=auth.status===0&&JSON.parse(auth.stdout).loggedIn===true;}catch{}
  assert.ok(signedIn,'Claude CLI is signed out or its authentication check failed. Run claude auth login before starting a new study directory.');
  const guard=await claimLiveStudy({registry:resolve(ROOT,'target/agentic-npc-switching-v3.study.json'),out:resolve(ROOT,out),protocol});
  try {
    await run({out,resume,protocol,liveRegistration:guard.publicRecord,provider:createClaudeProvider({model:protocol.agent.model,effort:protocol.agent.effort,timeoutMs:protocol.agent.timeoutMs,maxBudgetUsd:protocol.agent.maxBudgetUsdPerCall})});
  } finally {await guard.release();}
}
