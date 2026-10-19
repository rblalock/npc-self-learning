import assert from 'node:assert/strict';
import { WALLS, WIDTH, HEIGHT, makePolicy, createExperimentRunner } from './evidence-baseline.mjs';
import { RewardArena } from './additive-trial.mjs';
import { fixedPolicy } from './evaluation-support.mjs';

// Each worker owns its simulator module. Geometry is set once per scenario run.
export function setScenario(scenario) {
  assert.equal(scenario.spawns.length, 3);
  for (const w of scenario.walls) assert.ok(w.x >= 0 && w.y >= 0 && w.w > 0 && w.h > 0 && w.x + w.w <= WIDTH && w.y + w.h <= HEIGHT);
  for (const p of [...scenario.spawns, { x: 460, y: 300 }]) {
    assert.ok(p.x > 16 && p.x < WIDTH - 16 && p.y > 16 && p.y < HEIGHT - 16);
    assert.ok(scenario.walls.every(w => p.x + 16 < w.x || p.x - 16 > w.x + w.w || p.y + 16 < w.y || p.y - 16 > w.y + w.h), 'Spawn intersects cover');
  }
  WALLS.splice(0, WALLS.length, ...structuredClone(scenario.walls));
}

export function scenarioArena(scenario, seed, { mode = 'individual', snapshot, learning = true, actions } = {}) {
  setScenario(scenario);
  const engine = makePolicy(seed), policy = actions ? fixedPolicy(engine, actions) : engine;
  if (snapshot) {
    policy.request({ op: 'restore', snapshot });
    assert.deepEqual(policy.request({ op: 'snapshot' }), snapshot);
  }
  class ScenarioArena extends RewardArena {
    startEncounter(baseline = this.baseline) {
      super.startEncounter(baseline);
      this.enemies.forEach((enemy, i) => Object.assign(enemy, scenario.spawns[i]));
    }
  }
  const arena = new ScenarioArena(policy, mode);
  arena.learning = learning;
  return arena;
}

export function runScenarioTrial(protocol, scenario, seed, mode) {
  const runner = createExperimentRunner({ ...protocol, primary_switch: protocol.switches[0], secondary_switches: protocol.switches.slice(1) });
  const trial = { scenario: scenario.id, seed, mode, training: {}, snapshots: {}, branches: {} };
  const trainer = scenarioArena(scenario, seed, { mode });
  try {
    trial.training.online = runner.trace(trainer, protocol.training_rounds, protocol.training_style);
    trial.snapshots.online = trainer.policy.request({ op: 'snapshot' });
  } finally { trainer.policy.dispose(); }
  for (const style of protocol.switches) {
    trial.branches[style] = {};
    for (const condition of ['online', 'trained-frozen']) {
      const arena = scenarioArena(scenario, seed, { mode, snapshot: trial.snapshots.online, learning: condition === 'online' });
      try { trial.branches[style][condition] = runner.trace(arena, protocol.post_switch_rounds, style, condition !== 'online'); }
      finally { arena.policy.dispose(); }
    }
    const a = trial.branches[style].online[0], b = trial.branches[style]['trained-frozen'][0];
    assert.deepEqual([a.damage, a.result, a.duration, a.rewards], [b.damage, b.result, b.duration, b.rewards]);
  }
  return { trial, encounters: runner.encounterCount() };
}
