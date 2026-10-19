import assert from 'node:assert/strict';
import { block } from '../research/combat.mjs';
import { createPolicy, choose, tacticalActions, rewardsFor } from '../research/policy.mjs';
import { specOf } from '../opportunity-v2/fixtures.mjs';
import { seedFor } from '../synthetic/random.mjs';
import { RewardChangeDetector, forget } from './detector.mjs';
import { HISTORIES, ARMS, sequence, signalRounds } from './design.mjs';

export function observation(row) {
  const c = row.choices[0], f = row.feedback[0];
  return { role: c.request.role, context: c.request.context, action: c.action, reward: f.reward, observed: f.observed };
}
// Development-only transition model reuses previously measured physical tables.
// Formal evaluation always uses block(), re-executing actual combat.
function cachedBlock(table, seed, spec, scenarios, options) {
  const policy = createPolicy(seed, spec);
  try {
    if (options.snapshot) policy.request({ op: 'restore', snapshot: options.snapshot });
    const initial = policy.request({ op: 'snapshot' });
    const rows = scenarios.map(s => {
      const choices = choose(policy, spec, s), actions = tacticalActions(spec, choices);
      const side = table.fixture.scenarios.findIndex(t => JSON.stringify([t.world, t.player]) === JSON.stringify([s.world, s.player]));
      assert.ok(side >= 0);
      const measured = table.blocks[side].find(b => b.rows[0].choices[0].action === choices[0].action).rows[0];
      const physical = Object.fromEntries(['result', 'duration', 'health', 'damage', 'steps', 'enemies', 'inputSha256', 'inputs'].map(k => [k, measured[k]]));
      const feedback = rewardsFor(spec, physical.enemies).map((r, i) => {
        const request = { op: 'feedback', decision_id: choices[i].decision_id, reward: r.reward, observed: r.observed && options.learning !== false };
        return { ...r, request, ...policy.request(request) };
      });
      const after = policy.request({ op: 'commit' });
      return { scenario: s.id, ...physical, choices, actions, feedback, policy: after.cells, encounter: after.encounter };
    });
    return { seed, spec, options: { learning: options.learning !== false, baseline: false, forced: null }, initial, scenarios, rows, snapshot: policy.request({ op: 'snapshot' }) };
  } finally { policy.dispose(); }
}
export function trial(table, p, { cached = false } = {}) {
  const f = table.fixture, seed = seedFor(f.seed, f.group, 'change-learner'), spec = specOf(f.group);
  const run = (scenarios, options = {}) => cached ? cachedBlock(table, seed, spec, scenarios, options) : block(seed, spec, scenarios, options);
  const trainingSchedule = sequence(f, 'stable', p.training_rounds, { training: true });
  const training = run(trainingSchedule.map(s => s.scenario)), histories = {};
  for (const history of HISTORIES) {
    const schedule = sequence(f, history, p.test_rounds), signals = signalRounds(table, schedule), arms = {};
    for (const arm of ARMS) {
      let current = training.snapshot;
      const detector = new RewardChangeDetector(current.cells.map(({ role, context, action }) => ({ role, context, action })), p.detector);
      for (const r of training.rows) detector.observe(observation(r), { armed: false });
      const steps = [], detectorInitial = detector.snapshot();
      for (const s of schedule) {
        const signal = arm === 'signaled-reset' && signals.includes(s.round);
        const initial = signal ? forget(current, 'all') : current;
        const b = run([s.scenario], { snapshot: initial, learning: arm !== 'frozen' });
        const event = arm.startsWith('detector-') ? detector.observe(observation(b.rows[0])) : null;
        const next = event ? forget(b.snapshot, arm === 'detector-reset' ? 'context' : 'action', event) : b.snapshot;
        steps.push({ round: s.round, signal, block: b, event, afterIntervention: next });
        current = next;
      }
      arms[arm] = { detectorInitial, detectorFinal: detector.snapshot(), steps };
    }
    // No autonomous intervention can affect the first post-training choice.
    for (const arm of ARMS.filter(a => a !== 'signaled-reset'))
      assert.deepEqual(arms[arm].steps[0].block.rows[0].choices, arms.retained.steps[0].block.rows[0].choices);
    histories[history] = { schedule, signals, arms };
  }
  return { seed: f.seed, group: f.group, index: f.index, trainingSchedule, training, histories };
}
