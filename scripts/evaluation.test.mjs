import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, makePolicy, runSeries } from './arena-harness.mjs';
import { fixedProfiles, fixedPolicy, pairedBootstrap, primaryDecision, totalVariation } from './evaluation-support.mjs';
import { createExperimentRunner } from './adaptation-trial.mjs';
import { Worker } from 'node:worker_threads';

test('fixed profiles exhaust legal combinations, execute real combat and cannot learn', t => {
  const profiles = fixedProfiles();
  assert.equal(new Set(profiles.map(p => p.id)).size, 8);
  const policy = fixedPolicy(makePolicy(1009), profiles[0].actions), arena = new Arena(policy);
  t.after(() => policy.dispose());
  const before = arena.inspect().cells;
  // Even if a host leaves learning enabled, baseline decisions must reject training.
  const outcomes = runSeries(arena, 2, 'reverse');
  for (const outcome of outcomes) for (const row of outcome.recap) {
    assert.equal(row.tactic, profiles[0].actions[row.role]);
    assert.equal(row.accepted, false);
  }
  assert.deepEqual(arena.inspect().cells, before);
  assert.throws(() => policy.request({ op: 'choose', role: 'vanguard', context: 'arena', allowed: ['hold'] }), /not legal/);
  assert.throws(() => policy.request({ op: 'age', steps: 1 }), /never age/);
});

test('paired uncertainty uses seed identities rather than array order or individual rounds', () => {
  const left = [{ seed: 3, value: 25 }, { seed: 1, value: 15 }, { seed: 2, value: 20 }];
  const right = [{ seed: 2, value: 12 }, { seed: 3, value: 17 }, { seed: 1, value: 7 }];
  const result = pairedBootstrap(left, right, { resamples: 100 });
  assert.equal(result.meanDifference, 8);
  assert.deepEqual(result.interval, [8, 8]);
  assert.equal(result.seedCount, 3);
  assert.deepEqual(pairedBootstrap([...left].reverse(), right, { resamples: 100 }), result);
  assert.throws(() => pairedBootstrap(left, right.slice(1)), /seed sets/);
  assert.throws(() => pairedBootstrap([...left, left[0]], right), /Duplicate/);
  assert.throws(() => pairedBootstrap([{ seed: 1, value: NaN }], right), /invalid/);
});

test('practical and uncertainty criteria must both pass; no improvement remains negative', () => {
  const rule = { minimum_mean_damage_gain: 6, lower_interval_bound_must_exceed: 0 };
  assert.equal(primaryDecision({ meanDifference: 7, interval: [1, 12] }, rule), 'supported-in-this-fixture');
  for (const result of [{ meanDifference: 5, interval: [1, 10] }, { meanDifference: 8, interval: [-1, 15] }, { meanDifference: 0, interval: [0, 0] }]) {
    assert.equal(primaryDecision(result, rule), 'not-supported-by-this-run');
  }
});

test('bootstrap retains uncertainty when seed effects disagree', () => {
  // Resampling differences [0, 2] twice has support {0, 1, 2}; its 95%
  // percentile interval spans both extremes rather than collapsing to mean 1.
  const result = pairedBootstrap([{ seed: 1, value: 0 }, { seed: 2, value: 2 }], [{ seed: 1, value: 0 }, { seed: 2, value: 0 }]);
  assert.equal(result.meanDifference, 1);
  assert.deepEqual(result.interval, [0, 2]);
});

test('continued and frozen learning can branch from an identical Wasm checkpoint', t => {
  const training = makePolicy(1009), trainer = new Arena(training);
  runSeries(trainer, 6, 'orbit');
  const snapshot = training.request({ op: 'snapshot' }); training.dispose();
  const policies = [makePolicy(1009), makePolicy(1009)];
  t.after(() => policies.forEach(p => p.dispose()));
  policies.forEach(p => p.request({ op: 'restore', snapshot }));
  assert.deepEqual(policies[0].request({ op: 'snapshot' }), policies[1].request({ op: 'snapshot' }));
  const arenas = policies.map(p => new Arena(p));
  arenas[1].learning = false;
  const before = arenas[0].inspect().cells;
  const first = arenas.map(a => runSeries(a, 1, 'reverse')[0]);
  assert.equal(first[0].damage, first[1].damage, 'first combat precedes either branch update');
  assert.deepEqual(first[0].recap.map(r => r.tactic), first[1].recap.map(r => r.tactic));
  runSeries(arenas[0], 3, 'reverse'); runSeries(arenas[1], 3, 'reverse');
  assert.deepEqual(arenas[1].inspect().cells, before);
  assert.ok(totalVariation(before, arenas[0].inspect().cells) > 0);
  assert.equal(totalVariation(before, arenas[1].inspect().cells), 0);
});

test('parallel scheduling reproduces the serial trial exactly', async () => {
  const protocol = { primary_switch: 'reverse', secondary_switches: [], training_style: 'orbit', training_rounds: 2, post_switch_rounds: 2, communication: 'direct' };
  const seed = 1009;
  const serial = createExperimentRunner(protocol).runTrial(seed);
  const parallel = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./adaptation-worker.mjs', import.meta.url), { workerData: { protocol, seed } });
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
  });
  assert.deepEqual(parallel, serial);
  assert.equal(serial.encounters, 10);
});
