import test from 'node:test';
import assert from 'node:assert/strict';
import { RewardChangeDetector, DEFAULTS, forget } from './change-detection-v1/detector.mjs';
import { sequence, mixture, signalRounds, HISTORIES, ARMS } from './change-detection-v1/design.mjs';
import { fixture, enumerate } from './opportunity-v2/fixtures.mjs';
import { trial } from './change-detection-v1/trial.mjs';
import { verify } from './change-detection-v1/verify.mjs';
import { analyze, caseMetrics } from './change-detection-v1/analysis.mjs';
import { protocol, jobs } from './change-detection-v1/io.mjs';
const id = { role:'ranger', context:'arena', action:'aim' };
const feed = (d,reward,observed=true) => d.observe({...id,reward,observed});

test('alarms require repeated same-direction changes; one bad reward is insufficient',()=>{
  const d = new RewardChangeDetector([id]);
  for(let i=0;i<12;i++) assert.equal(feed(d,.8),null);
  assert.equal(feed(d,-.4),null);
  const event=feed(d,-.4);assert.ok(event);assert.equal(event.delta,-.6);
  assert.equal(d.snapshot().entries[0].values.length,4);
  const stable=new RewardChangeDetector([id]);
  for(let i=0;i<100;i++)assert.equal(feed(stable,.2),null);
  assert.equal(stable.snapshot().entries[0].values.length,8);
});
test('unobserved rewards and unrelated identities cannot trigger or contaminate another action',()=>{
  const d=new RewardChangeDetector([id,{...id,action:'lead'}]);
  for(let i=0;i<20;i++)feed(d,.8);
  const before=d.snapshot();for(let i=0;i<20;i++)feed(d,-1,false);
  assert.deepEqual(d.snapshot(),before);
  assert.throws(()=>d.observe({...id,action:'invented',reward:0,observed:true}));
  assert.throws(()=>feed(d,NaN));
  assert.deepEqual(d.snapshot().entries[1].values,[]);
});
test('warmup is explicitly unarmed; increases and decreases are detectable',()=>{
  for(const direction of [-1,1]) {
    const d=new RewardChangeDetector([id]);
    for(let i=0;i<12;i++)d.observe({...id,reward:-.6*direction,observed:true},{armed:false});
    const events=Array.from({length:6},()=>feed(d,.6*direction)).filter(Boolean);
    assert.ok(events.length);assert.equal(Math.sign(events[0].delta),direction);
  }
});
test('targeted forgetting preserves unrelated cells, immutable inputs, counters and random stream',()=>{
  const snapshot={config:{},encounter:40,next_decision_id:41,rng_state:'0123456789abcdef',cells:[
    {...id,score:.7,samples:20},{...id,action:'lead',score:-.2,samples:10},
    {...id,context:'elsewhere',score:.5,samples:3}]};
  const original=structuredClone(snapshot),next=forget(snapshot,'action',id);
  assert.deepEqual(next.cells[0],{...id,score:0,samples:0});assert.deepEqual(next.cells.slice(1),snapshot.cells.slice(1));
  assert.deepEqual({...next,cells:null},{...snapshot,cells:null});assert.deepEqual(snapshot,original);
  assert.equal(forget(snapshot,'context',id).cells[1].score,0);
  assert.equal(forget(snapshot,'context',id).cells[2].score,.5);
});
test('schedule creates stationary surprises and monotonic mixture drift with shared arm worlds',()=>{
  const f=fixture('solo-flanker',201,5),stable=sequence(f,'stable',640);
  assert.ok(stable.some(s=>s.side===1)&&stable.some(s=>s.side===0));assert.ok(stable.every(s=>s.probabilityB===.1));
  assert.equal(mixture('gradual',16),.5);assert.equal(mixture('gradual',32),.9);
  assert.equal(mixture('recurring',32),.9);assert.equal(mixture('recurring',33),.1);
  assert.deepEqual(sequence(f,'abrupt',64),sequence(f,'abrupt',64));
});
test('privileged timing keeps an optimum through exact ties and resets only after crossover',()=>{
  const b=(action,damage)=>({rows:[{choices:[{action}],damage}]});
  const table={blocks:[[b('a',24),b('b',0)],[b('a',0),b('b',24)]]};
  assert.deepEqual(signalRounds(table,[{round:1,probabilityB:.5},{round:2,probabilityB:.6}]),[2]);
});
test('real combat and cached development yield identical choices, rewards, alarms and provenance',async()=>{
  const p={...await protocol(),training_rounds:16,test_rounds:8},table=enumerate(fixture('solo-flanker',201,5));
  const actual=trial(table,p),cached=trial(table,p,{cached:true});assert.deepEqual(actual,cached);
  assert.equal(verify(actual,table,p).encounters,16+4*5*8);
  const [parallel]=await jobs([{mode:'trial',table,protocol:p}]);assert.deepEqual(parallel,actual);
});
test('independent verifier rejects timing leaks, missing resets, altered feedback and RNG changes',async()=>{
  const p={...await protocol(),training_rounds:32,test_rounds:32},table=enumerate(fixture('solo-flanker',201,5)),t=trial(table,p,{cached:true});
  verify(t,table,p);
  const mutate=fn=>{const bad=structuredClone(t);fn(bad);assert.throws(()=>verify(bad,table,p));};
  mutate(b=>{b.histories.abrupt.arms.retained.steps[0].block.rows[0].feedback[0].reward+=.1;});
  mutate(b=>{b.histories.abrupt.arms['signaled-reset'].steps[0].signal=false;});
  mutate(b=>{b.histories.abrupt.arms['detector-reset'].steps[0].afterIntervention.rng_state='0000000000000001';});
  const events=HISTORIES.flatMap(h=>t.histories[h].arms['detector-reset'].steps.filter(s=>s.event).map(s=>({h,round:s.round})));
  assert.ok(events.length);const first=events[0];
  mutate(b=>{b.histories[first.h].arms['detector-reset'].steps[first.round-1].event=null;});
});
test('metrics count all false alarms and missed windows; exact physical tables detect corrupt damage',async()=>{
  const p={...await protocol(),training_rounds:16,test_rounds:8},table=enumerate(fixture('solo-flanker',201,5)),t=trial(table,p,{cached:true});
  const m=caseMetrics(t,table,p);assert.equal(m.histories.abrupt.frozen.detection[0].firstAlarm,null);
  assert.equal(m.histories.abrupt.frozen.detection[0].restrictedChecks,9);
  for(const h of HISTORIES)for(const a of ARMS)assert.ok(m.histories[h][a].rows.every(r=>r.expectedRegret>=0&&r.realizedRegret>=0));
  const s=analyze(p,[table],[t]);assert.equal(s.groups['solo-flanker'].comparisons['detector-reset'].gates.enoughSeeds,false);
  const c=s.groups['solo-flanker'].comparisons['detector-reset'];assert.equal(c.falseAlarmsPer100,c.falseAlarms/8*100);
  t.histories.stable.arms.retained.steps[0].block.rows[0].damage++;
  assert.throws(()=>caseMetrics(t,table,p));
});
test('locked reserve is disjoint; declared detector matches portable adapter defaults',async()=>{
  const p=await protocol();assert.deepEqual(p.detector,DEFAULTS);assert.ok(p.seeds.every(s=>!p.development_seeds.includes(s)));
  assert.equal(new Set(p.seeds).size,16);assert.equal(p.primary_uncertainty.interval,1-.05/12);
});
