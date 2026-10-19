import assert from 'node:assert/strict';
import { parentPort,workerData } from 'node:worker_threads';
import { runTrial } from './trials.mjs';
import { verifyTrial } from './verify.mjs';
import { block } from './combat.mjs';

if(workerData.mode==='block')parentPort.postMessage(block(...workerData.args));
else if(workerData.mode==='verify') {
  const t=workerData.trial,independent=verifyTrial(t);
  assert.deepEqual(runTrial(workerData.protocol,t.seed),t);
  parentPort.postMessage({seed:t.seed,...independent,fullCombatReplay:true});
} else parentPort.postMessage(runTrial(workerData.protocol,workerData.seed));
