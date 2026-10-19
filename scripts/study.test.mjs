import test from 'node:test';
import assert from 'node:assert/strict';
import { Study } from '../target/arena-test/study.js';

test('lesson stops at the evidence boundary and records counterplay separately',()=>{
  const study=new Study('lesson');
  for(let i=0;i<4;i++)study.record({encounter:i+1,damage:12});
  assert.equal(study.phase,'reflect');assert.equal(study.waiting,true);
  assert.equal(study.continue(),true);assert.equal(study.phase,'counter');
  for(let i=0;i<3;i++)study.record({encounter:i+5,damage:0});
  assert.equal(study.complete,true);assert.equal(study.continue(),false);
  study.record({encounter:8});assert.equal(study.outcomes.length,7);
});
test('blind comparison counterbalances independent blocks and exports their actual order',()=>{
  for(const adaptiveFirst of [true,false]){
    const study=new Study('blind',912,adaptiveFirst);
    assert.equal(study.baseline,!adaptiveFirst);
    for(let i=0;i<3;i++)study.record({damage:12});
    assert.equal(study.waiting,true);study.continue();assert.equal(study.baseline,adaptiveFirst);
    study.event('counterplay','changed direction');
    for(let i=0;i<3;i++)study.record({damage:0});
    const session=study.export('felt fair');assert.equal(session.complete,true);
    assert.equal(session.conditions[0],adaptiveFirst?'adaptive':'uniform');assert.equal(session.outcomes.length,6);
    assert.equal(session.events[0].kind,'counterplay');assert.equal(session.notes,'felt fair');
  }
});
