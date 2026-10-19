import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { Arena, makePolicy, runSeries } from './arena-harness.mjs';
import { damageReward, createRewardArena, runRewardTrial } from './reward-trial.mjs';
import { advancementDecision } from './reward-analysis.mjs';

test('team credit distinguishes a teammate contribution while keeping individual costs and bounds', () => {
  const flanker = { damage: 12, defeated: true };
  assert.ok(Math.abs(damageReward(flanker, 48) - .0375) < 1e-12);
  assert.ok(Math.abs(damageReward(flanker, 36) + .025) < 1e-12);
  assert.equal(damageReward(flanker, 48, 'individual'), damageReward(flanker, 36, 'individual'));
  assert.equal(damageReward({ damage: 1000, defeated: false }, 1000), 1);
  assert.throws(() => damageReward(flanker, NaN));
});

test('identity reward adapter reproduces the unchanged arena through real Wasm', t => {
  const original = new Arena(makePolicy(1009)), identity = createRewardArena(1009, { mode: 'individual' });
  t.after(() => { original.policy.dispose(); identity.policy.dispose(); });
  const a = runSeries(original, 3, 'feint'), b = runSeries(identity, 3, 'feint');
  assert.deepEqual(a.map(r => [r.damage, r.duration, r.result]), b.map(r => [r.damage, r.duration, r.result]));
  assert.deepEqual(original.policy.request({ op: 'snapshot' }), identity.policy.request({ op: 'snapshot' }));
  assert.deepEqual(a.map(r => r.rewards), b.map(r => r.rewards.map(({ originalReward, ...rest }) => rest)));
});

test('candidate changes only feedback; frozen replay, observation gate and actual logged rewards stay truthful', t => {
  const original = new Arena(makePolicy(1009)), candidate = createRewardArena(1009);
  t.after(() => { original.policy.dispose(); candidate.policy.dispose(); });
  const a = original.runEncounter('orbit'), b = candidate.runEncounter('orbit');
  assert.deepEqual([a.damage, a.duration, a.result, a.recap.map(r => r.tactic)], [b.damage, b.duration, b.result, b.recap.map(r => r.tactic)]);
  for (const audit of b.feedbackAudit) {
    const row = b.recap.find(r => r.role === audit.role);
    assert.equal(row.reward, audit.reward); assert.equal(row.accepted, audit.accepted);
  }
  assert.notDeepEqual(original.inspect().cells, candidate.inspect().cells);
  const frozen = createRewardArena(1009, { snapshot: candidate.policy.request({ op: 'snapshot' }), learning: false });
  t.after(() => frozen.policy.dispose());
  const cells = frozen.inspect().cells;
  runSeries(frozen, 2, 'reverse');
  assert.deepEqual(frozen.inspect().cells, cells);
  const hidden = createRewardArena(17); t.after(() => hidden.policy.dispose());
  hidden.startEncounter(); const clean = hidden.inspect().cells;
  hidden.enemies.forEach(e => { e.damage = 24; e.sightings = 0; });
  hidden.finish('survived');
  assert.ok(hidden.outcome.feedbackAudit.every(audit => audit.teamDamage === 0 && !audit.submittedObserved && !audit.accepted));
  assert.deepEqual(hidden.inspect().cells, clean);
});

test('reward trial scheduling reproduces identical serial and worker results', async () => {
  const protocol = { switches: ['feint'], training_style: 'orbit', training_rounds: 2, post_switch_rounds: 2, communication: 'direct' };
  const serial = runRewardTrial(protocol, 1009);
  const parallel = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./reward-worker.mjs', import.meta.url), { workerData: { protocol, seed: 1009 } });
    worker.once('message', resolve); worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
  });
  assert.deepEqual(parallel, serial); assert.equal(serial.encounters, 6);
});

test('advancement requires improvement, continued adaptation and reversal preservation together', () => {
  const names = ['feint_vs_original', 'feint_continued_learning', 'reverse_vs_original', 'reverse_continued_learning'];
  const rules = Object.fromEntries(names.map(name => [name, { minimum_mean_gain: name.startsWith('feint') ? 3 : name.endsWith('original') ? -3 : 6, minimum_lower_bound: name === 'reverse_vs_original' ? -3 : 0, strict_lower: name !== 'reverse_vs_original' }]));
  rules.cover_damage = { maximum_absolute_difference: 1 };
  const measures = Object.fromEntries(names.map(name => [name, { meanDifference: 7, interval: [1, 12] }]));
  measures.cover_damage = { maximumAbsoluteDifference: 0 };
  assert.equal(advancementDecision(measures, rules).disposition, 'advance-to-next-evaluation');
  for (const name of names) {
    assert.equal(advancementDecision({ ...measures, [name]: { meanDifference: 8, interval: [-4, 14] } }, rules).disposition, 'do-not-promote');
  }
  assert.equal(advancementDecision({ ...measures, cover_damage: { maximumAbsoluteDifference: 2 } }, rules).disposition, 'do-not-promote');
});
