import assert from 'node:assert/strict';
import { access,mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync,spawnSync } from 'node:child_process';
import { ROOT,PROTOCOL,sourceHashes,checkSources,atomicJson } from './agentic-v2/io.mjs';
import { sha,decisionFrom } from './agentic-v2/design.mjs';
import { calibrate,warmup,fixedBranch,startAgent,nextObservation,advanceAgent,initialObservation,summarize } from './agentic-v2/trial.mjs';
import { createJournal } from './agentic-v2/journal.mjs';
import { createClaudeProvider } from './agentic-v1/provider.mjs';

async function waves(items,concurrency,run) {
  for(let i=0;i<items.length;i+=concurrency) {
    const settled=await Promise.allSettled(items.slice(i,i+concurrency).map(run));
    const failed=settled.find(x=>x.status==='rejected');if(failed)throw failed.reason;
  }
}

export async function run({out,resume=false,protocol,provider,log=console.log}) {
  const dir=resolve(ROOT,out);await mkdir(dir,{recursive:true});
  const resultPath=resolve(dir,'results.json'),startPath=resolve(dir,'started.json');
  try {await access(resultPath);throw Error('Completed result exists; use a new output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
  let started;
  try {
    started=JSON.parse(await readFile(startPath,'utf8'));assert.ok(resume,'Existing run requires --resume');
    assert.deepEqual(started.protocol,protocol,'Protocol differs');await checkSources(started.sources);
  }catch(e){
    if(e.code!=='ENOENT')throw e;assert.ok(!resume,'No started run to resume');
    started={schema:2,startedAt:new Date().toISOString(),protocol,protocolSha256:sha(protocol),sources:await sourceHashes(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),node:process.version,platform:process.platform,arch:process.arch};
    await writeFile(startPath,JSON.stringify(started)+'\n',{flag:'wx'});
  }
  const calibration=protocol.cases.map(c=>calibrate(c,protocol));
  const selectedPath=resolve(dir,'calibration.json');
  try {assert.deepEqual(JSON.parse(await readFile(selectedPath,'utf8')),calibration,'Calibration changed');}
  catch(e){if(e.code!=='ENOENT')throw e;await atomicJson(selectedPath,calibration);}
  log(JSON.stringify({calibrationComplete:true,selections:calibration.map(x=>({seed:x.data.seed,plan:x.selection.planId}))}));
  const journal=await createJournal({directory:resolve(dir,'calls'),provider,limits:{maxCalls:protocol.agent.maxCalls,maxReportedCostUsd:protocol.agent.maxReportedCostUsd,maxBudgetUsdPerCall:protocol.agent.maxBudgetUsdPerCall,maxConsecutiveFailures:protocol.agent.maxConsecutiveFailures},resume,log});
  const result={...started,calibration,calibrationSha256:sha(calibration),cases:[],calls:[]},pairs=[],calls=new Map();
  for(let ci=0;ci<protocol.cases.length;ci++) {
    const c=protocol.cases[ci],training=warmup(c,protocol),record={...c,training,histories:{}};result.cases.push(record);
    for(const history of protocol.histories) {
      const branches=[fixedBranch(c,protocol,training,history,'baseline',{arm:'retained'}),fixedBranch(c,protocol,training,history,calibration[ci].selection.planId)];
      record.histories[history]=branches;
      for(let replicate=1;replicate<=protocol.agentReplicates;replicate++)pairs.push({c,training,history,replicate,branches,full:startAgent(c,protocol,training,history,'full',replicate),recent:startAgent(c,protocol,training,history,'recent',replicate)});
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
      advanceAgent(protocol,training,pair.full,call);advanceAgent(protocol,training,pair.recent,call);
      assert.deepEqual(pair.full.rows[0].fight,pair.recent.rows[0].fight);assert.deepEqual(pair.full.rows[0].fight,initial.rows[0]);
      pair.branches.push(initial,pair.full,pair.recent);
    });
    await savePartial();
    for(let round=2;round<=protocol.postRounds;round++) {
      const jobs=pairs.flatMap(pair=>['full','recent'].map(arm=>({pair,arm})));
      const offset=(round-2)%jobs.length,ordered=[...jobs.slice(offset),...jobs.slice(0,offset)];
      await waves(ordered,protocol.maxConcurrency,async({pair,arm})=>{
        const {c,training,history,replicate}=pair,b=pair[arm];
        const call=await request({caseSeed:c.seed,caseIndex:c.index,history,replicate,arm,round},nextObservation(training,b));
        advanceAgent(protocol,training,b,call);
      });
      await savePartial();log(JSON.stringify({completedPostRound:round,recordedCalls:calls.size}));
    }
    for(const c of result.cases)for(const bs of Object.values(c.histories))bs.sort((a,b)=>a.replicate-b.replicate||['retained','fixed','initial','full','recent'].indexOf(a.arm)-['retained','fixed','initial','full','recent'].indexOf(b.arm));
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
  const auth=spawnSync('claude',['auth','status'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
  let signedIn=false;try{signedIn=auth.status===0&&JSON.parse(auth.stdout).loggedIn===true;}catch{}
  assert.ok(signedIn,'Claude CLI is signed out or its authentication check failed. Run claude auth login before starting a new study directory.');
  await run({out,resume,protocol,provider:createClaudeProvider({model:protocol.agent.model,effort:protocol.agent.effort,timeoutMs:protocol.agent.timeoutMs,maxBudgetUsd:protocol.agent.maxBudgetUsdPerCall})});
}
