import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { root, verifyBaseline, createExperimentRunner } from './evidence-baseline.mjs';
import { fixedProfiles, mean } from './evaluation-support.mjs';
import { scenarioArena } from './scenario-trial.mjs';
import { summarizeScenarios } from './scenario-analysis.mjs';

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--out'));
const prefix = resolve(root, args[1] ?? 'docs/experiments/scenario-transfer-v1');
for (const suffix of ['.results.json','.summary.json','.md']) {
  try { await access(prefix+suffix); throw Error(`Refusing to overwrite ${prefix+suffix}`); }
  catch (e) { if(e.code !== 'ENOENT') throw e; }
}
const protocolPath = 'docs/experiments/scenario-transfer-v1.protocol.json';
const bytes = await readFile(resolve(root,protocolPath)), p = JSON.parse(bytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
console.error(verifyBaseline());
const paths = [protocolPath,'docs/experiments/baseline-v1.source.json','docs/experiments/baseline-v1.source.tar.gz',
  'scripts/evidence-baseline.mjs','scripts/additive-trial.mjs','scripts/scenario-trial.mjs','scripts/scenario-worker.mjs',
  'scripts/evaluate-scenarios.mjs','scripts/scenario-analysis.mjs','scripts/evaluation-support.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path,sha(await readFile(resolve(root,path)))])));
const runner = createExperimentRunner({...p, primary_switch:p.switches[0],secondary_switches:p.switches.slice(1)});
const calibration = [];
for (const profile of fixedProfiles()) {
  const worlds = [];
  for (const scenario of p.scenarios) {
    const arena = scenarioArena(scenario,p.fixed_baseline.seed,{actions:profile.actions,learning:false});
    try { worlds.push({scenario:scenario.id,trace:runner.trace(arena,1,p.training_style,true)}); }
    finally {arena.policy.dispose();}
  }
  calibration.push({...profile,worlds,damage:mean(worlds.map(w=>w.trace[0].damage))});
}
const selected = [...calibration].sort((a,b)=>b.damage-a.damage || a.id.localeCompare(b.id))[0];
console.error(`Fixed profile selected only on clockwise calibration: ${selected.id}`);
const fixed = [];
for (const scenario of p.scenarios) {
  const record = {scenario:scenario.id,training:[],branches:{}};
  for (const style of [p.training_style,...p.switches]) {
    const arena = scenarioArena(scenario,p.fixed_baseline.seed,{actions:selected.actions,learning:false});
    try {
      const rows = runner.trace(arena, style === p.training_style ? p.training_rounds : p.post_switch_rounds,style,true);
      if(style === p.training_style) record.training=rows; else record.branches[style]=rows;
    } finally { arena.policy.dispose(); }
  }
  fixed.push(record);
}
const jobs = p.scenarios.flatMap(scenario=>p.seeds.flatMap(seed=>['individual','additive-team'].map(mode=>({protocol:p,scenario,seed,mode}))));
const trials = Array(jobs.length), workerCount = Math.max(1,Math.min(4,availableParallelism()-1));
let next=0,done=0,encounters=runner.encounterCount();
await Promise.all(Array.from({length:workerCount},async()=>{
  while(next<jobs.length) {
    const index=next++, job=jobs[index];
    const result=await new Promise((resolveResult,reject)=>{
      const w=new Worker(new URL('./scenario-worker.mjs',import.meta.url),{workerData:job});
      let received=false;
      w.once('message',m=>{received=true;resolveResult(m);});w.once('error',reject);
      w.once('exit',code=>{if(code || !received) reject(Error(`Incomplete worker ${index}: ${code}`));});
    });
    trials[index]=result.trial;encounters+=result.encounters;
    console.error(`Scenario trial ${++done}/${jobs.length}: ${job.scenario.id} seed ${job.seed} ${job.mode}`);
  }
}));
assert.equal(encounters,11760);
const summary = {...summarizeScenarios(p,trials,fixed),actualEncounters:encounters,protocolSha256:sha(bytes)};
const result = {schema:1,protocol:p,provenance:{generatedAt:new Date().toISOString(),sourceHashes,runtime:{node:process.version,platform:process.platform,arch:process.arch,workerCount}},calibration,selectedFixed:{id:selected.id,actions:selected.actions},fixed,trials,summary};
const ci = c => `${c.meanDifference.toFixed(2)} [${c.interval.map(n=>n.toFixed(2)).join(', ')}]`;
const report = ['# Fresh scenarios — v1','',`**Decision: ${summary.disposition}.** ${encounters} actual encounters; 16 fresh policy seeds; three authored scenarios. Both reward rules were tested regardless of development outcome.`, '',
  'Original geometry, core and combat are loaded from the immutable v1 archive, then the protocol’s cover and spawn coordinates are applied. All other combat settings are held constant. Fixed tactics are selected using clockwise calibration only.', '',
  '| Scenario | Switch | Original | Additive | Fixed | Additive − original [95% CI] | Original online − frozen [95% CI] | Additive online − frozen [95% CI] |',
  '| --- | --- | ---: | ---: | ---: | --- | --- | --- |',
  ...Object.entries(summary.groups).flatMap(([world,styles])=>Object.entries(styles).map(([style,s])=>`| ${world} | ${style} | ${s.individual.damage.toFixed(2)} | ${s.additive.damage.toFixed(2)} | ${s.fixedDamage.toFixed(2)} | ${ci(s.additiveMinusOriginal)} | ${ci(s.individualLearningBenefit)} | ${ci(s.additiveLearningBenefit)} |`)), '',
  'Damage is enemy damage to the player in rounds 17–24 after the behavior switch. Aggregate intervals resample 16 seed means, each averaged over the three scenarios. Worlds and encounters are not treated as independent population samples. More damage does not establish fun or human learning.', '',
  '## Gates','',...Object.entries(summary.gates).map(([k,v])=>`- ${k}: ${v ? 'PASS':'FAIL'}`),'',
  'A candidate must pass both development and scenario screens before promotion. This record retains negative outcomes. No maps, weights, seed sets, or gates were changed after results were measured.', '',
  '## Reproduce','', '```sh','node scripts/evaluate-scenarios.mjs --out docs/experiments/scenario-transfer-v1-replication','node scripts/verify-scenarios.mjs docs/experiments/scenario-transfer-v1-replication.results.json','```','',
  ...p.limits.map(s=>`- ${s}`),''];
await writeFile(prefix+'.results.json',JSON.stringify(result)+'\n',{flag:'wx'});
await writeFile(prefix+'.summary.json',JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
await writeFile(prefix+'.md',report.join('\n'),{flag:'wx'});
console.log(JSON.stringify({disposition:summary.disposition,gates:summary.gates,encounters},null,2));
