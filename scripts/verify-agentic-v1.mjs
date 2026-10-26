import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, checkSources } from './agentic-v1/io.mjs';
import { sha, validateDecision } from './agentic-v1/design.mjs';
import { warmup, runBranch, summarize } from './agentic-v1/trial.mjs';

export async function verify(results,{sources=true}={}) {
  assert.equal(results.protocolSha256,sha(results.protocol));
  if(sources)await checkSources(results.sources);
  assert.equal(results.cases.length,results.protocol.cases.length);
  let fights=0,calls=0;
  for(let ci=0;ci<results.cases.length;ci++) {
    const c=results.cases[ci],expectedCase=results.protocol.cases[ci];
    assert.equal(c.seed,expectedCase.seed);assert.equal(c.index,expectedCase.index);
    const training=warmup(c,results.protocol);
    assert.deepEqual(training,c.training,'Warm-up physics/policy mismatch');fights+=training.rows.length;
    assert.deepEqual(Object.keys(c.histories),results.protocol.histories);
    for(const [history,branches]of Object.entries(c.histories)) {
      const identities=[...results.protocol.controls.map(arm=>[arm,0]),...Array.from({length:results.protocol.agentReplicates},(_,i)=>['agent',i+1])];
      assert.deepEqual(branches.map(b=>[b.arm,b.replicate]),identities);
      for(const b of branches) {
        let index=0;
        const decide=async(key,observation)=>{
          const row=b.rows[index++];assert.deepEqual(observation,row.observation,'Agent received different observations');
          assert.equal(sha(observation),row.observationSha256);assert.ok(row.call);
          if(row.call.status==='ok')validateDecision(row.call.decision);
          if(row.call.call) {
            const transcript=row.call.call;
            assert.equal(transcript.prompt,`Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(observation)}`,'Submitted model prompt mismatch');
            for(const field of ['prompt','systemPrompt','schema'])assert.equal(sha(transcript[field]),transcript[field+'Sha256'],'Transcript hash mismatch');
            assert.deepEqual(JSON.parse(transcript.schema).properties.planId.enum,observation.plans.map(p=>p.id));
            assert.equal(row.call.metadata.requestedModel,results.protocol.agent.model);
            assert.equal(row.call.metadata.effort,results.protocol.agent.effort);
          }
          calls++;return row.call;
        };
        const replay=await runBranch(c,results.protocol,training,history,b.arm,b.replicate,decide);
        assert.deepEqual(replay,b,`Full physics/policy/observation replay mismatch ${c.seed}/${history}/${b.arm}/${b.replicate}`);
        fights+=b.rows.length;
      }
    }
  }
  const summary=summarize(results);
  assert.equal(fights,summary.scoredFights);assert.equal(calls,summary.recordedCalls);
  return {schema:1,verified:true,resultsSha256:sha(results),scoredPhysicalFightsReplayed:fights,recordedAgentDecisionsReplayed:calls,
    sourceHashesChecked:sources,modelCallsMade:0,scope:'Reconstruction using recorded model decisions; not independent replication or model-output reproducibility.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const filename=process.argv[2];assert.ok(filename,'Supply results.json or results.json.gz');
  const raw=await readFile(resolve(ROOT,filename));const results=JSON.parse((filename.endsWith('.gz')?gunzipSync(raw):raw).toString());
  console.log(JSON.stringify(await verify(results),null,2));
}
