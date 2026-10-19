import assert from 'node:assert/strict';
import { Arena, makePolicy, createExperimentRunner } from './evidence-baseline.mjs';

/** Experiment-only host reward; the actual simulator and Rust learner are unchanged. */
export function damageReward(evidence, teamDamage, mode = 'additive-team') {
  assert.ok(['individual', 'additive-team'].includes(mode));
  assert.ok(Number.isFinite(evidence.damage) && evidence.damage >= 0 && Number.isFinite(teamDamage) && teamDamage >= 0);
  const damageCredit = mode === 'individual' ? evidence.damage / 32 : evidence.damage / 32 + .5 * (teamDamage - (evidence.observed ? evidence.damage : 0)) / (3 * 32);
  return Math.max(-1, Math.min(1, damageCredit - .22 - (evidence.defeated ? .18 : 0)));
}

export class RewardArena extends Arena {
  constructor(engine, mode = 'additive-team') {
    let arena;
    const adapter = {
      request(request) {
        if (request.op !== 'feedback' || !arena.rewardBoundary) return engine.request(request);
        const enemy = arena.enemies.find(e => e.decision.decision_id === request.decision_id);
        assert.ok(enemy, 'Feedback must identify a current enemy');
        const evidence = { damage: enemy.damage, defeated: enemy.hp <= 0, observed: enemy.sightings > 0 };
        assert.equal(request.reward, damageReward(evidence, 0, 'individual'), 'Original reward must match the unchanged simulator');
        assert.equal(request.observed, evidence.observed && arena.learning, 'Preserve the observation gate');
        const reward = damageReward(evidence, arena.teamDamage, mode);
        const response = engine.request({ ...request, reward });
        arena.feedbackAudit.push({ role: enemy.role, tactic: enemy.tactic, decisionId: request.decision_id,
          ...evidence, teamDamage: arena.teamDamage, originalReward: request.reward, reward,
          submittedObserved: request.observed, accepted: response.accepted });
        return response;
      },
      dispose() { engine.dispose(); },
    };
    super(adapter);
    arena = this;
    this.rewardMode = mode;
    this.rewardBoundary = false;
    this.feedbackAudit = [];
  }

  finish(result) {
    if (!this.active) return;
    assert.equal(this.communication, 'direct', 'This experiment does not implement courier team rewards');
    assert.equal(this.enemies.length, 3, 'Protocol assumes three roles');
    this.teamDamage = this.enemies.filter(e => e.sightings > 0).reduce((sum, e) => sum + e.damage, 0);
    this.feedbackAudit = [];
    this.rewardBoundary = true;
    try { super.finish(result); }
    finally { this.rewardBoundary = false; }
    assert.equal(this.feedbackAudit.length, 3);
    // The simulator records its original reward. Replace experimental recaps with
    // exactly what the adapter submitted, while retaining the original alongside it.
    for (const row of [...this.outcome.rewards, ...this.outcome.recap]) {
      const audit = this.feedbackAudit.find(a => a.role === row.role);
      row.originalReward = row.reward;
      row.reward = audit.reward;
      if ('reason' in row) row.reason += ` Experiment reward: ${this.rewardMode}.`;
    }
    this.outcome.rewardMode = this.rewardMode;
    this.outcome.feedbackAudit = this.feedbackAudit.map(row => ({ ...row }));
  }
}

export function createRewardArena(seed, { snapshot, learning = true, mode = 'additive-team' } = {}) {
  const engine = makePolicy(seed);
  if (snapshot) {
    engine.request({ op: 'restore', snapshot });
    assert.deepEqual(engine.request({ op: 'snapshot' }), snapshot);
  }
  const arena = new RewardArena(engine, mode);
  arena.learning = learning;
  return arena;
}

export function runRewardTrial(protocol, seed) {
  const runner = createExperimentRunner({ ...protocol, primary_switch: protocol.switches[0], secondary_switches: protocol.switches.slice(1) });
  const trial = { seed, training: {}, snapshots: {}, branches: {} };
  const trainer = createRewardArena(seed);
  try {
    trial.training.online = runner.trace(trainer, protocol.training_rounds, protocol.training_style);
    trial.snapshots.online = trainer.policy.request({ op: 'snapshot' });
  } finally { trainer.policy.dispose(); }
  for (const style of protocol.switches) {
    trial.branches[style] = {};
    for (const condition of ['online', 'trained-frozen']) {
      const arena = createRewardArena(seed, { snapshot: trial.snapshots.online, learning: condition === 'online' });
      try { trial.branches[style][condition] = runner.trace(arena, protocol.post_switch_rounds, style, condition !== 'online'); }
      finally { arena.policy.dispose(); }
    }
    const a = trial.branches[style].online[0], b = trial.branches[style]['trained-frozen'][0];
    assert.deepEqual([a.damage, a.result, a.duration, a.rewards], [b.damage, b.result, b.duration, b.rewards]);
  }
  return { trial, encounters: runner.encounterCount() };
}
