import test from 'node:test';
import assert from 'node:assert/strict';
import { Mission } from '../target/arena-test/mission.js';
import { Arena, makePolicy } from './arena-harness.mjs';

const outcome = (encounter,result='survived',extra={}) => ({encounter,result,recap:[],reportStatus:'intercepted',...extra});

test('mission failure retries wave one; winning requires two completed waves',()=>{
  const m=new Mission();
  assert.equal(m.record(outcome(1)),false,'a briefing cannot finish itself');
  assert.equal(m.advance(),true);assert.equal(m.advance(),false,'cannot skip active combat');
  m.record(outcome(1,'down'));assert.equal(m.phase,'lost');assert.equal(m.number,1);
  m.advance();assert.equal(m.wave,1);assert.equal(m.record(outcome(1)),false,'duplicate completion cannot win a retry');
  m.record(outcome(2));assert.equal(m.phase,'between');m.advance();assert.equal(m.wave,2);
  m.record(outcome(3));assert.equal(m.phase,'won');m.advance();assert.equal(m.number,2);assert.equal(m.wave,1);
});

test('mission briefing distinguishes delivered evidence from an empty or intercepted report',()=>{
  const m=new Mission();m.advance();m.record(outcome(1,'survived',{reportStatus:'delivered',recap:[{accepted:false}]}));
  assert.match(m.reportSummary,/No usable report/);
  m.advance();m.record(outcome(2,'survived',{reportStatus:'delivered',recap:[{accepted:true}]}));
  assert.match(m.reportSummary,/next squad can adapt/);
});

test('real courier combat carries the same Wasm memory across waves and the next mission',()=>{
  const policy=makePolicy(42),arena=new Arena(policy),mission=new Mission();
  try {
    arena.communication='courier';arena.onFinish=o=>mission.record(o);
    for(let wave=1;wave<=2;wave++){
      const before=arena.inspect().cells;
      mission.advance();arena.startEncounter();
      assert.deepEqual(arena.inspect().cells,before,'deployment never resets learned cells');
      assert.ok(arena.enemies.every(e=>e.hp===72));assert.equal(arena.player.hp,100);
      const result=arena.runEncounter('cover');
      assert.notEqual(result.result,'down');
    }
    assert.equal(mission.phase,'won');
    const learned=arena.inspect().cells;
    assert.ok(learned.some(c=>c.samples>0),'real delivered report should supply evidence');
    mission.advance();arena.startEncounter();
    assert.equal(mission.number,2);assert.deepEqual(arena.inspect().cells,learned);
    assert.equal(arena.policy,policy);
  }finally{policy.dispose();}
});
