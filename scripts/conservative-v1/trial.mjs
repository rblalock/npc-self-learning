import assert from 'node:assert/strict';
import { createPolicy, choose, rewardsFor, tacticalActions } from '../research/policy.mjs';
import { combat } from '../research/combat.mjs';
import { specOf } from '../opportunity-v2/fixtures.mjs';
import { sequence, signalRounds } from '../change-detection-v1/design.mjs';
import { seedFor } from '../synthetic/random.mjs';
import { detectorFor, intervene } from './intervention.mjs';

const cells = snapshot => snapshot.cells.map(c => [c.score, c.samples]);
export function trial(table, p, { physical = false, arms = p.arms, histories = p.histories } = {}) {
  const f = table.fixture, spec = specOf(f.group), seed = seedFor(f.seed, f.group, 'change-learner');
  function step(policy, s, learning) {
    const choice = choose(policy, spec, s.scenario)[0];
    const measured = table.blocks[s.side].find(b => b.rows[0].choices[0].action === choice.action).rows[0];
    if (physical) {
      const actual = combat(s.scenario, spec.roster, tacticalActions(spec, [choice]));
      for (const k of ['result','duration','health','damage','steps','enemies','inputSha256','inputs']) assert.deepEqual(actual[k], measured[k]);
    }
    const feedback = rewardsFor(spec, measured.enemies)[0], observed = feedback.observed && learning;
    policy.request({ op: 'feedback', decision_id: choice.decision_id, reward: feedback.reward, observed });
    policy.request({ op: 'commit' });
    const snapshot = policy.request({ op: 'snapshot' });
    return { row: { round: s.round, side: s.side, choice, damage: measured.damage, reward: feedback.reward,
      observed, learned: cells(snapshot), rng: snapshot.rng_state, event: null, applied: false, signal: false }, snapshot };
  }
  const policy = createPolicy(seed, spec), trainingSchedule = sequence(f, 'stable', p.training_rounds, { training: true });
  const training = [];
  try {
    for (const s of trainingSchedule) training.push(step(policy, s, true).row);
    const checkpoint = policy.request({ op: 'snapshot' }), result = { seed: f.seed, group: f.group, index: f.index, policySeed: seed, checkpoint, training, histories: {} };
    for (const [history, count] of Object.entries(histories)) {
      const schedule = sequence(f, history, count), signals = signalRounds(table, schedule), records = {};
      for (const arm of arms) {
        const branch = createPolicy(seed, spec);
        try {
          branch.request({ op: 'restore', snapshot: checkpoint });
          const detector = detectorFor(arm, checkpoint.cells.map(({ role, context, action }) => ({ role, context, action })), p.legacy_detector);
          const observation = r => ({ ...r.choice.request, action: r.choice.action, reward: r.reward, observed: r.observed });
          for (const r of training) detector.observe(observation(r), { armed: false });
          const rows = [];
          for (const s of schedule) {
            const signal = arm === 'signaled-reset' && signals.includes(s.round);
            if (signal) branch.request({ op: 'restore', snapshot: intervene(branch.request({ op: 'snapshot' }), arm, null, true).snapshot });
            const { row, snapshot } = step(branch, s, arm !== 'frozen');
            const active = ['legacy-reset', ...p.candidates].includes(arm);
            const event = active ? detector.observe(observation(row)) : null;
            const intervention = active ? intervene(snapshot, arm, event) : { snapshot, applied: false };
            if (intervention.applied) branch.request({ op: 'restore', snapshot: intervention.snapshot });
            Object.assign(row, { event, applied: intervention.applied, signal, after: cells(intervention.snapshot) });
            rows.push(row);
          }
          records[arm] = { rows, final: branch.request({ op: 'snapshot' }) };
        } finally { branch.dispose(); }
      }
      result.histories[history] = { signals, arms: records };
    }
    return result;
  } finally { policy.dispose(); }
}
