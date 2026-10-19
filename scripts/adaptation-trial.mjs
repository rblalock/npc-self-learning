import assert from 'node:assert/strict';
import { Arena, makePolicy } from './arena-harness.mjs';
import { fixedPolicy } from './evaluation-support.mjs';

/** Each worker owns its own Wasm module/engines; no mutable policy is shared. */
export function createExperimentRunner(protocol) {
  const styles = [protocol.primary_switch, ...protocol.secondary_switches];
let encounters = 0;

function trace(arena, count, style, frozen = false) {
  const originalCells = arena.inspect().cells;
  return Array.from({ length: count }, (_, index) => {
    const outcome = arena.runEncounter(style);
    assert.ok(outcome && !arena.active && outcome.duration > 0 && outcome.duration < 27);
    assert.ok(outcome.damage >= 0 && outcome.damage <= 100);
    assert.equal(outcome.communication, protocol.communication);
    const policy = arena.inspect().cells;
    if (frozen) assert.deepEqual(policy, originalCells, 'Frozen scores, samples and probabilities must remain exact');
    encounters++;
    return { phaseRound: index + 1, ...outcome, policy };
  });
}

function createArena(seed, { snapshot, baseline = false, learning = true, actions } = {}) {
  const policy = actions ? fixedPolicy(makePolicy(seed), actions) : makePolicy(seed);
  if (snapshot) {
    policy.request({ op: 'restore', snapshot });
    assert.deepEqual(policy.request({ op: 'snapshot' }), snapshot, 'Each branch must restore the complete checkpoint');
  }
  const arena = new Arena(policy);
  arena.baseline = baseline; arena.learning = learning; arena.communication = protocol.communication;
  return arena;
}


function runTrial(seed) {
  const beforeCount = encounters;
  const trial = { seed, training: {}, snapshots: {}, branches: {} };
  for (const condition of ['online', 'uniform']) {
    const arena = createArena(seed, { baseline: condition === 'uniform', learning: condition === 'online' });
    try {
      trial.training[condition] = trace(arena, protocol.training_rounds, protocol.training_style, condition === 'uniform');
      trial.snapshots[condition] = arena.policy.request({ op: 'snapshot' });
    } finally { arena.policy.dispose(); }
  }
  for (const style of styles) {
    trial.branches[style] = {};
    for (const condition of ['online', 'trained-frozen', 'uniform']) {
      const arena = createArena(seed, {
        snapshot: trial.snapshots[condition === 'uniform' ? 'uniform' : 'online'],
        baseline: condition === 'uniform', learning: condition === 'online',
      });
      try { trial.branches[style][condition] = trace(arena, protocol.post_switch_rounds, style, condition !== 'online'); }
      finally { arena.policy.dispose(); }
    }
    const onlineFirst = trial.branches[style].online[0], frozenFirst = trial.branches[style]['trained-frozen'][0];
    assert.deepEqual([onlineFirst.damage, onlineFirst.result, onlineFirst.duration, onlineFirst.rewards], [frozenFirst.damage, frozenFirst.result, frozenFirst.duration, frozenFirst.rewards], 'Identical trained branches must start with identical combat');
  }
  return { trial, encounters: encounters - beforeCount };
}
return { trace, createArena, runTrial, encounterCount: () => encounters };
}
