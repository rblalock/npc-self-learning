import test from 'node:test';
import assert from 'node:assert/strict';
import { Playtest, PLAYTEST_PROTOCOL, fixedStudyPolicy } from '../target/arena-test/playtest.js';
import { Arena, makePolicy } from './arena-harness.mjs';
const options={id:'test-session',seed:42,adaptiveFirst:true,assignment:'randomized',build:'test-build'};
const outcome={control:'manual',result:'cleared',damage:12,health:88};
const telemetry={frames:100,moving:50,firing:30,dash:2,directions:[25,25,0,0]};
const answers={noticed:'Nothing obvious',counterplay:'Changing direction avoided a shot',enjoyment:5,fairness:6,frustration:2,change:'unsure'};
function round(s){assert.ok(s.startRound());assert.equal(s.startRound(),false);s.record(outcome,telemetry);}

test('warm-up, concealed conditions, movement switch and required surveys follow the registered sequence',()=>{
  const s=new Playtest(options);assert.throws(()=>s.record(outcome,telemetry));
  round(s);round(s);assert.equal(s.stage,'condition-intro');assert.equal(s.round,0);
  for(let block=0;block<2;block++){
    assert.equal(s.block,block);
    for(let i=0;i<6;i++)round(s);assert.equal(s.stage,'change-prompt');
    for(let i=0;i<6;i++)round(s);assert.equal(s.stage,'survey');assert.equal(s.startRound(),false);
    assert.throws(()=>s.submit({...answers,enjoyment:0}));assert.throws(()=>s.submit({...answers,noticed:''}));
    s.submit(answers);
  }
  const data=s.export();assert.equal(s.complete,true);assert.equal(data.records.length,26);assert.equal(data.surveys.length,2);assert.deepEqual(data.session.order,['adaptive','selected-fixed']);
  assert.equal(data.records.filter(r=>r.kind==='condition').length,24);assert.equal(data.session.source,'human');assert.equal(data.protocol.id,PLAYTEST_PROTOCOL.id);
});

test('partial sessions, interruptions and QA exclusions survive export without presenting completion',()=>{
  const s=new Playtest({...options,adaptiveFirst:false});round(s);s.startRound();s.event('pause','lost focus');s.end();
  let data=s.export();assert.equal(data.session.complete,false);assert.equal(data.records.length,1);assert.equal(data.session.order[0],'selected-fixed');assert.ok(data.events.some(e=>e.type==='pause'));
  s.markQA('scripted driver');data=s.export();assert.equal(data.session.source,'automated-qa');assert.equal(data.exclusions.length,1);assert.equal(s.startRound(),false);
  const q=new Playtest(options);q.startRound();q.record({...outcome,control:'demo'},telemetry);assert.equal(q.source,'automated-qa');
});

test('selected-fixed study uses actual Wasm legal masks and cannot learn from accepted-looking combat',()=>{
  const engine=makePolicy(42),arena=new Arena(fixedStudyPolicy(engine));arena.learning=false;
  const before=arena.inspect().cells;
  try {
    for(let i=0;i<3;i++){
      const row=arena.runEncounter('orbit');
      assert.deepEqual(row.recap.map(r=>r.tactic),['rush','flank_right','lead']);assert.ok(row.recap.every(r=>!r.accepted));
      assert.deepEqual(arena.inspect().cells,before);
    }
  }finally{engine.dispose();}
});
