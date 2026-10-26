import assert from 'node:assert/strict';
import { fixture } from '../opportunity-v2/fixtures.mjs';
import { randomAt, seedFor } from '../synthetic/random.mjs';
import { PLANS, sha, mean, makeObservation as originalObservation, validateDecision } from '../agentic-v1/design.mjs';
export { PLANS, sha, mean, validateDecision };

export function schedule(c, protocol, history, partition='evaluation', replicate=0) {
  assert.ok(['stable','recurring','warmup'].includes(history));
  assert.ok(['calibration','evaluation'].includes(partition));
  const f=fixture('solo-ranger',c.seed,c.index);assert.ok(f.valid);
  const stream=seedFor(c.seed,c.index,'agentic-ablation-v2',partition,replicate);
  const firstChange=protocol.changeStartMin+Math.floor(randomAt(stream,'change-start')*protocol.changeStartWidth);
  const returnRound=protocol.returnStartMin+Math.floor(randomAt(stream,'return-start')*protocol.returnStartWidth);
  const n=history==='warmup'?protocol.warmupRounds:protocol.postRounds;
  return Array.from({length:n},(_,i)=>{
    const round=i+1,probabilityB=history==='recurring'&&round>=firstChange&&round<returnRound?.9:.1;
    const side=+(randomAt(stream,history,i)<probabilityB);
    return {round,side,probabilityB,scenario:structuredClone(f.scenarios[side])};
  });
}

export function observation(rows,currentPlanId,memory,mode) {
  assert.ok(['initial','full','recent'].includes(mode));assert.ok(rows.length>0);
  // Both arms omit policy cells: these aggregate earlier rounds and would be an
  // indirect history channel. The ordinary policy still learns inside combat.
  const o=originalObservation(rows,{cells:[]},currentPlanId,mode==='recent'?'':memory);
  delete o.policy;
  o.rules+=' The supplied history may be a limited window. Do not assume omitted rounds had any particular outcome. Internal policy scores are not supplied.';
  if(mode==='recent')o.history=o.history.slice(-1);
  return o;
}

export function decisionFrom(response,currentPlanId,memory) {
  try {assert.equal(response.status,'ok');return validateDecision(response.decision);}
  catch {return {planId:currentPlanId,reason:'Recorded provider failure: retain previous plan.',prediction:'No new prediction.',memory};}
}

export function selectFixed(calibration) {
  const means=PLANS.map(p=>({planId:p.id,meanDamage:mean(calibration.batches.flatMap(b=>Object.values(b.histories).flatMap(bs=>bs.filter(x=>x.planId===p.id).flatMap(x=>x.rows.map(r=>r.physical.damage)))))}));
  assert.ok(means.every(x=>Number.isFinite(x.meanDamage)));
  const best=means.reduce((a,b)=>b.meanDamage>a.meanDamage?b:a);
  return {planId:best.planId,means,tieBreak:'First plan in the declared catalog',calibrationSha256:sha(calibration)};
}
