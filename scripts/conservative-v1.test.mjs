import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BatchDeclineDetector, detectorFor, intervene } from './conservative-v1/intervention.mjs';
import { trial } from './conservative-v1/trial.mjs';
import { verify } from './conservative-v1/verify.mjs';
import { analyze } from './conservative-v1/analysis.mjs';
import { stressChecks } from './conservative-v1/stress.mjs';
import { fixture, enumerate } from './opportunity-v2/fixtures.mjs';
const p=JSON.parse(await readFile(new URL('../docs/experiments/conservative-development-v1.protocol.json',import.meta.url)));
const id={role:'ranger',context:'arena',action:'aim'},other={...id,action:'lead'};
const feed=(d,reward,armed=true,observed=true)=>d.observe({...id,reward,observed},{armed});

test('advancement excludes the overlapping-window candidates that reuse a single outlier',()=>{
  const s=stressChecks(p);
  for(const a of ['down-reset','down-soft']) {
    assert.equal(s[a].pass,false);
    assert.equal(s[a].cases.find(c=>c.name==='single-outlier').interventions,1);
  }
  assert.equal(s['batch-soft'].pass,true);
});

test('separate low batches confirm a decline; a single outlier cannot trigger',()=>{
  const d=new BatchDeclineDetector([id],p.legacy_detector);
  for(let i=0;i<4;i++)assert.equal(feed(d,.8,false),null);
  for(let i=0;i<7;i++)assert.equal(feed(d,-.8),null);
  const e=feed(d,-.8);assert.equal(e.delta,-1.6);assert.equal(e.confirmations,2);assert.equal(e.observations.length,4);
  for(let i=0;i<40;i++)assert.equal(feed(d,.8),null);
  const one=new BatchDeclineDetector([id],p.legacy_detector);
  for(let i=0;i<8;i++)feed(one,.8,false);
  assert.equal(feed(one,-1),null);
  for(let i=0;i<40;i++)assert.equal(feed(one,.8),null);
});
test('constant saturated feedback and sparse observations do not reset memory',()=>{
  for(const arm of p.candidates)for(const reward of [-1,0,1]) {
    const d=detectorFor(arm,[id,other],p.legacy_detector);
    for(let round=0;round<800;round++) {
      const o={...(round%37===0?id:other),reward,observed:round%3===0};
      const event=d.observe(o,{armed:round>64});assert.equal(event,null);
    }
  }
});
test('unobserved and unrelated action rewards cannot confirm a decline',()=>{
  const d=new BatchDeclineDetector([id,other],p.legacy_detector);
  for(let i=0;i<8;i++)feed(d,.8,false);
  for(let i=0;i<100;i++) {
    assert.equal(feed(d,-1,true,false),null);
    assert.equal(d.observe({...other,reward:-1,observed:true}),null);
  }
  for(let i=0;i<7;i++)assert.equal(feed(d,-.8),null);
  assert.ok(feed(d,-.8));
  assert.throws(()=>feed(d,NaN));assert.throws(()=>d.observe({...id,action:'unknown',reward:0,observed:true}));
});
test('one-sided and softer interventions preserve unrelated memory, counts and RNG as specified',()=>{
  const s={config:{seed:1},encounter:30,next_decision_id:31,rng_state:'1234567890abcdef',cells:[
    {...id,score:.8,samples:20},{...other,score:-.2,samples:10},{...id,context:'elsewhere',score:.7,samples:5}]};
  for(const arm of p.candidates)assert.deepEqual(intervene(s,arm,{...id,delta:.4}),{snapshot:s,applied:false});
  const soft=intervene(s,'down-soft',{...id,delta:-.4}).snapshot;
  assert.deepEqual(soft.cells.map(c=>c.score),[.4,-.1,.7]);assert.deepEqual(soft.cells.map(c=>c.samples),[20,10,5]);
  assert.deepEqual({...soft,cells:null},{...s,cells:null});assert.equal(s.cells[0].score,.8);
  const hard=intervene(s,'down-reset',{...id,delta:-.4}).snapshot;
  assert.deepEqual(hard.cells.slice(0,2).map(c=>[c.score,c.samples]),[[0,0],[0,0]]);assert.deepEqual(hard.cells[2],s.cells[2]);
});
test('cached transitions equal actual combat; independent reconstruction rejects evidence tampering',()=>{
  const q={...p,training_rounds:16,histories:{abrupt:16,stable:16}},table=enumerate(fixture('solo-flanker',201,5));
  const cached=trial(table,q),physical=trial(table,q,{physical:true});assert.deepEqual(cached,physical);
  assert.equal(verify(cached,table,q),16+2*7*16);
  for(const mutate of [t=>t.training[0].reward+=.1,t=>t.histories.abrupt.arms.retained.rows[0].rng='bad',
    t=>t.histories.stable.arms['down-soft'].rows[0].applied=true,t=>t.histories.abrupt.arms['signaled-reset'].rows[0].signal=false,
    t=>t.histories.stable.arms.frozen.rows[0].after[0][0]+=.1]) {
    const corrupt=structuredClone(cached);mutate(corrupt);assert.throws(()=>verify(corrupt,table,q));
  }
  const summary=analyze([cached],[table],q);assert.deepEqual(summary.eligible,[]);
  assert.equal(summary.groups['solo-flanker'].comparisons['down-soft'].gates.stressChecks,false);
  assert.equal(summary.groups['solo-flanker'].comparisons['batch-soft'].gates.stressChecks,true);
  assert.equal(summary.budget.newScoredPhysicalEncounters,0);assert.equal(summary.budget.cachedComparisonTransitions,224);
});
