import assert from 'node:assert/strict';
import { parentPort,workerData as d } from 'node:worker_threads';
import { fixture,enumerate } from './fixtures.mjs';
import { trial } from './trial.mjs';
import { verifyBlock,verifyTrial } from '../research/verify.mjs';
if(d.mode==='audit')parentPort.postMessage(Array.from({length:d.count},(_,i)=>enumerate(fixture(d.group,d.seed,i))));
else if(d.mode==='trial')parentPort.postMessage(trial(d.fixture,d.protocol));
else if(d.mode==='verify-audit') {
  let encounters=0,decisions=0;
  for(const a of d.records) {
    assert.deepEqual(a.fixture,fixture(a.fixture.group,a.fixture.seed,a.fixture.index));
    for(const b of a.blocks.flat()){const v=verifyBlock(b);encounters+=v.encounters;decisions+=v.decisions;}
    assert.deepEqual(enumerate(a.fixture),a);
  }parentPort.postMessage({encounters,decisions});
} else {
  assert.equal(d.mode,'verify-trial');const v=verifyTrial(d.trial);assert.deepEqual(trial(d.fixture,d.protocol),d.trial);parentPort.postMessage(v);
}
