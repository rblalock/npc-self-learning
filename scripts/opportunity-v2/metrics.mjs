import assert from 'node:assert/strict';
import { mean,pairedBootstrap } from '../evaluation-support.mjs';
import { PROFILES } from '../research/policy.mjs';
import { actionKey,GROUPS } from './fixtures.mjs';

const physical=r=>Object.fromEntries(['damage','health','result','duration','steps','enemies','inputSha256','inputs'].map(k=>[k,r[k]]));
export function metrics(b,table) {
  return b.rows.map((r,i)=>{
    const scenario=b.scenarios[i],side=table.fixture.scenarios.findIndex(s=>JSON.stringify([s.world,s.player])===JSON.stringify([scenario.world,scenario.player]));
    assert.ok(side>=0);const entries=table.blocks[side].map(x=>x.rows[0]),best=Math.max(...entries.map(x=>x.damage)),worst=Math.min(...entries.map(x=>x.damage)),
      actual=entries.find(e=>actionKey(e.actions)===actionKey(r.actions));assert.ok(actual);assert.deepEqual(physical(r),physical(actual));
    const probabilities=entries.map(e=>{
      if(b.spec.architecture==='joint') {
        const a=PROFILES.find(p=>actionKey(p.actions)===actionKey(e.actions)).action;
        return r.choices[0].probabilities.find(p=>p.action===a).probability;
      }
      return r.choices.reduce((p,c)=>p*c.probabilities.find(x=>x.action===e.actions[c.request.role]).probability,1);
    });
    assert.ok(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)<1e-10);
    const expectedDamage=entries.reduce((v,e,j)=>v+probabilities[j]*e.damage,0),expectedRegret=Math.max(0,best-expectedDamage);
    return {round:i+1,side,damage:r.damage,oracle:best,range:best-worst,regret:best-r.damage,expectedDamage,expectedRegret,
      normalizedRegret:best===worst?null:expectedRegret/(best-worst),optimalProbability:entries.reduce((v,e,j)=>v+(e.damage===best?probabilities[j]:0),0)};
  });
}
export function recovery(rows,threshold=.35,streak=3) {
  assert.ok(rows.length&&rows.every(r=>r.normalizedRegret!==null));
  let length=0,end=null;
  for(const r of rows) {length=r.normalizedRegret<=threshold?length+1:0;if(length>=streak){end=r.round;break;}}
  return {initiallyDisplaced:rows[0].normalizedRegret>threshold,reached:end!==null,endingRound:end,
    restrictedChecks:end??rows.length+1,initialNormalizedRegret:rows[0].normalizedRegret};
}
export function analyze(p,audits,trials) {
  const groups={},primaryOptions=p.primary_uncertainty,secondaryOptions=p.secondary_uncertainty;
  for(const group of GROUPS) {
    const ts=trials.filter(t=>t.group===group),qualified=p.seeds.map(seed=>audits.find(a=>a.fixture.group===group&&a.fixture.seed===seed&&a.admission.accepted)).filter(Boolean);
    assert.deepEqual(ts.map(t=>t.seed),qualified.map(a=>a.fixture.seed));
    const context=group.startsWith('context-'),pairs=context?[
      ['terrain-minus-pooled','terrain/test','pooled/test'],['terrain-minus-shuffled','terrain/test','shuffled/test']]:[
      ['learning-minus-frozen','switch/online','switch/frozen'],['learning-minus-uniform','switch/online','switch/uniform'],['retained-minus-reset','switch/online','switch/reset'],
      ['return-learning','return/online','return/frozen'],['return-memory','return/online','return/reset'],['sham-learning','sham/online','sham/frozen'],
      ...(group==='squad'?[['joint-minus-independent','switch/online','independent/online'],['independent-learning','independent/online','independent/frozen']]:[])];
    const evidence=ts.map(t=>({seed:t.seed,blocks:Object.fromEntries(Object.entries(t.blocks).map(([id,b])=>[id,metrics(b,qualified.find(a=>a.fixture.seed===t.seed))]))})),comparisons={};
    for(const [j,[key,left,right]] of pairs.entries()) {
      if(!ts.length)continue;
      const values=(id,fn)=>evidence.map(e=>({seed:e.seed,value:fn(e.blocks[id])})),effect=pairedBootstrap(values(left,rs=>mean(rs.map(r=>r.damage))),values(right,rs=>mean(rs.map(r=>r.damage))),j===0?primaryOptions:secondaryOptions);
      comparisons[key]={effect,cumulativeRegretReduction:effect.meanDifference*p.phase_rounds,
        expectedEffect:pairedBootstrap(values(left,rs=>mean(rs.map(r=>r.expectedDamage))),values(right,rs=>mean(rs.map(r=>r.expectedDamage))),secondaryOptions),
        curves:Array.from({length:p.phase_rounds/4},(_,i)=>({from:i*4+1,to:i*4+4,
          left:mean(evidence.map(e=>mean(e.blocks[left].slice(i*4,i*4+4).map(r=>r.damage)))),right:mean(evidence.map(e=>mean(e.blocks[right].slice(i*4,i*4+4).map(r=>r.damage))))})),
        left,right,primary:j===0};
    }
    const arms={};for(const id of ts.length?Object.keys(ts[0].blocks):[]) {
      const rows=evidence.flatMap(e=>e.blocks[id]),raw=ts.flatMap(t=>t.blocks[id].rows),recoveries=evidence.map(e=>({seed:e.seed,...recovery(e.blocks[id],p.recovery.threshold,p.recovery.consecutive)})),displaced=recoveries.filter(r=>r.initiallyDisplaced);
      arms[id]={meanDamage:mean(rows.map(r=>r.damage)),cumulativeRegret:mean(evidence.map(e=>e.blocks[id].reduce((v,r)=>v+r.regret,0))),
        meanExpectedRegret:mean(rows.map(r=>r.expectedRegret)),meanOptimalProbability:mean(rows.map(r=>r.optimalProbability)),
        deathRate:mean(raw.map(r=>+(r.result==='down'))),clearRate:mean(raw.map(r=>+(r.result==='cleared'))),
        recovery:context?null:{recoveries,initiallyDisplaced:displaced.length,recoveredAmongDisplaced:displaced.filter(r=>r.reached).length,
          meanRestrictedChecksAmongDisplaced:displaced.length?mean(displaced.map(r=>r.restrictedChecks)):null}};
    }
    const primary=comparisons[pairs[0][0]]?.effect??null,gates={enough_qualified_seeds:ts.length>=p.minimum_qualified_seeds,
      meaningful_primary:!!primary&&primary.meanDifference>=p.minimum_gain,adjusted_interval_positive:!!primary&&primary.interval[0]>0};
    if(context){const sham=comparisons['terrain-minus-shuffled']?.effect;gates.beats_capacity_control=!!sham&&sham.meanDifference>=p.minimum_gain&&sham.interval[0]>0;}
    groups[group]={qualified:ts.length,candidates:audits.filter(a=>a.fixture.group===group).length,acceptedCandidates:audits.filter(a=>a.fixture.group===group&&a.admission.accepted).length,
      selected:qualified.map(a=>({seed:a.fixture.seed,index:a.fixture.index,gaps:a.admission.switchGaps,rewardGaps:a.admission.rewardGaps})),
      primary,comparisons,arms,gates,disposition:Object.values(gates).every(Boolean)?'supported-in-qualified-tasks':'not-supported-by-this-screen'};
  }
  const auditEncounters=audits.reduce((n,a)=>n+a.blocks.flat().reduce((m,b)=>m+b.rows.length,0),0),learningEncounters=trials.reduce((n,t)=>n+Object.values(t.blocks).reduce((m,b)=>m+b.rows.length,0),0);
  return {groups,budget:{auditEncounters,learningEncounters,total:auditEncounters+learningEncounters,
    steps:audits.reduce((n,a)=>n+a.blocks.flat().reduce((m,b)=>m+b.rows.reduce((k,r)=>k+r.steps,0),0),0)+trials.reduce((n,t)=>n+Object.values(t.blocks).reduce((m,b)=>m+b.rows.reduce((k,r)=>k+r.steps,0),0),0)}};
}
