import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Arena, makePolicy, runSeries } from './arena-harness.mjs';

const seeds=[3,17,42,101,2026], styles=['orbit','cover','weave','feint'], results=[];
for(const seed of seeds){
  const trainer=makePolicy(seed),arena=new Arena(trainer);
  runSeries(arena,24,'orbit');const snapshot=trainer.request({op:'snapshot'});trainer.dispose();
  for(const style of styles){
    for(const baseline of [true,false]){
      const policy=makePolicy(seed);policy.request({op:'restore',snapshot});
      const experiment=new Arena(policy);experiment.learning=false;experiment.baseline=baseline;
      const before=experiment.inspect().cells;
      const outcomes=runSeries(experiment,5,style);
      assert.deepEqual(experiment.inspect().cells,before,'evaluation must never update learned memory');
      results.push({seed,style,condition:baseline?'uniform':'learned-held-fixed',damage:outcomes.map(o=>o.damage),meanDamage:outcomes.reduce((s,o)=>s+o.damage,0)/5,clears:outcomes.filter(o=>o.result==='cleared').length});
      policy.dispose();
    }
  }
}
const summary=styles.map(style=>{
  const pairs=seeds.map(seed=>{
    const group=results.filter(r=>r.style===style&&r.seed===seed);
    return {seed,uniform:group.find(r=>r.condition==='uniform').meanDamage,learned:group.find(r=>r.condition==='learned-held-fixed').meanDamage};
  });
  return {style,usedInTraining:style==='orbit',uniformDamage:pairs.reduce((s,p)=>s+p.uniform,0)/pairs.length,learnedDamage:pairs.reduce((s,p)=>s+p.learned,0)/pairs.length,pairedDifferences:pairs.map(p=>({seed:p.seed,damage:p.learned-p.uniform}))};
});
const hash=async path=>createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex');
console.log(JSON.stringify({schema:1,protocol:{seeds,trainingStyle:'orbit',trainingRounds:24,testRoundsPerConditionStyle:5,styles,trainingEncounters:120,evaluationEncounters:200,learningDuringEvaluation:false,pairedRng:'Each condition and style starts from the same per-seed trained snapshot, including RNG state.',note:'Exploratory scripted-controller evaluation. Cover, weave and feint are excluded from training. No human playtest or generalization guarantee.',simSha256:await hash('../apps/arena/src/sim.ts'),wasmSha256:await hash('../apps/arena/public/wasm/tactical_air_bg.wasm')},summary,results},null,2));
