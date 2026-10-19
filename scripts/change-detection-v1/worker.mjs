import assert from 'node:assert/strict';
import { parentPort, workerData as d } from 'node:worker_threads';
import { fixture, enumerate } from '../opportunity-v2/fixtures.mjs';
import { verifyBlock } from '../research/verify.mjs';
import { trial } from './trial.mjs';
import { verify } from './verify.mjs';
if (d.mode === 'audit') parentPort.postMessage(Array.from({ length: d.count }, (_, i) => enumerate(fixture(d.group, d.seed, i))));
else if (d.mode === 'trial') parentPort.postMessage(trial(d.table, d.protocol, { cached: !!d.cached }));
else if (d.mode === 'verify-audit') {
  let encounters = 0, decisions = 0;
  for (const a of d.records) {
    assert.deepEqual(a.fixture, fixture(a.fixture.group, a.fixture.seed, a.fixture.index));
    for (const b of a.blocks.flat()) { const v = verifyBlock(b); encounters += v.encounters; decisions += v.decisions; }
    assert.deepEqual(enumerate(a.fixture), a);
  }
  parentPort.postMessage({ encounters, decisions });
} else {
  assert.equal(d.mode, 'verify-trial');
  const v = verify(d.trial, d.table, d.protocol);
  assert.deepEqual(trial(d.table, d.protocol), d.trial);
  parentPort.postMessage(v);
}
