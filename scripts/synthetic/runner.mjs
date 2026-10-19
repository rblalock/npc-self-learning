import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Arena, WALLS, makePolicy } from "../evidence-baseline.mjs";
import { fixedPolicy } from "../evaluation-support.mjs";
import { requireWorld, distance } from "./geometry.mjs";
import { createPlayer, observe } from "./players.mjs";
import { trainingSchedule, testSchedule, TEST_MAPS } from "./scenarios.mjs";
import { TEST_FAMILIES } from "./players.mjs";

const checked = new Set();
export function setWorld(world) {
  const key = JSON.stringify(world);
  if (!checked.has(key)) {
    requireWorld(world);
    checked.add(key);
  }
  WALLS.splice(0, WALLS.length, ...structuredClone(world.walls));
}
export function createArena(seed, { snapshot, learning = true, actions } = {}) {
  const engine = makePolicy(seed),
    policy = actions ? fixedPolicy(engine, actions) : engine;
  if (snapshot) {
    policy.request({ op: "restore", snapshot });
    assert.deepEqual(policy.request({ op: "snapshot" }), snapshot);
  }
  const arena = new Arena(policy);
  arena.learning = learning;
  arena.communication = "direct";
  return arena;
}
const stateFrame = (arena) => ({
  time: arena.time,
  player: {
    x: arena.player.x,
    y: arena.player.y,
    hp: Math.max(0, arena.player.hp),
  },
  enemies: arena.enemies.map((e) => ({
    id: e.id,
    role: e.role,
    tactic: e.tactic,
    x: e.x,
    y: e.y,
    hp: e.hp,
    windup: e.windup,
    target: { ...e.target },
  })),
  bullets: arena.bullets.map((b) => ({ x: b.x, y: b.y, enemy: b.enemy })),
  active: arena.active,
});

export function runEncounter(arena, scenario, { capture = false } = {}) {
  setWorld(scenario.world);
  const before = arena.inspect().cells;
  arena.auto = !!scenario.legacyStyle;
  if (scenario.legacyStyle) arena.style = scenario.legacyStyle;
  arena.startEncounter();
  Object.assign(arena.player, scenario.world.player);
  arena.enemies.forEach((e, i) => Object.assign(e, scenario.world.spawns[i]));
  const choices = arena.enemies.map((e) => ({
    role: e.role,
    ...structuredClone(e.decision),
  }));
  const bot = scenario.player
    ? createPlayer(scenario.player, scenario.world)
    : null;
  const digest = createHash("sha256"),
    frames = capture ? [stateFrame(arena)] : [];
  const inputs = { fireFrames: 0, dashFrames: 0, movingFrames: 0, distance: 0 };
  let steps = 0;
  for (; steps < 1700 && arena.active; steps++) {
    const previous = { x: arena.player.x, y: arena.player.y };
    const input = bot?.input(observe(arena, scenario.world.walls), steps);
    if (input) {
      assert.ok(
        [input.x, input.y, input.aim.x, input.aim.y].every(Number.isFinite),
      );
      assert.ok(Math.hypot(input.x, input.y) <= 1.000001);
      digest.update(JSON.stringify(input));
      inputs.fireFrames += +input.fire;
      inputs.dashFrames += +input.dash;
      inputs.movingFrames += +(Math.hypot(input.x, input.y) > 0);
    }
    arena.update(1 / 60, input);
    inputs.distance += distance(previous, arena.player);
    if (capture && (steps % 6 === 5 || !arena.active))
      frames.push(stateFrame(arena));
  }
  assert.ok(
    !arena.active && arena.outcome && steps > 0 && steps <= 1561,
    "Combat must terminate within the actual game duration",
  );
  const outcome = structuredClone(arena.outcome),
    policy = arena.inspect().cells;
  assert.equal(outcome.damage + outcome.health, 100);
  if (!arena.learning)
    assert.deepEqual(policy, before, "Frozen memory changed");
  const row = {
    scenario: scenario.id,
    phase: scenario.phase,
    phaseRound: scenario.phaseRound ?? null,
    ...outcome,
    control: bot ? "synthetic" : "demo",
    style: scenario.legacyStyle ?? null,
    choices,
    policy,
    enemies: arena.enemies.map((e) => ({
      role: e.role,
      hp: e.hp,
      damage: e.damage,
      sightings: e.sightings,
    })),
    steps,
    inputSha256: bot ? digest.digest("hex") : null,
    inputs: bot ? { ...inputs, ...bot.stats() } : null,
  };
  return capture ? { row, frames } : row;
}
export function runSequence(arena, schedule) {
  return schedule.map((s) => runEncounter(arena, s));
}
function combatIdentity(row) {
  return {
    damage: row.damage,
    result: row.result,
    duration: row.duration,
    inputSha256: row.inputSha256,
    tactics: row.choices.map((c) => c.action),
  };
}
export function runPopulationSeed(protocol, seed, selectedFixed) {
  const training = {},
    snapshots = {},
    branches = {};
  for (const arm of ["narrow", "diverse"]) {
    const arena = createArena(seed);
    try {
      training[arm] = runSequence(arena, trainingSchedule(protocol, seed, arm));
      snapshots[arm] = arena.policy.request({ op: "snapshot" });
    } finally {
      arena.policy.dispose();
    }
  }
  for (const family of TEST_FAMILIES)
    for (const map of TEST_MAPS) {
      const id = `${family}/${map}`,
        schedule = testSchedule(protocol, seed, family, map);
      branches[id] = {};
      for (const arm of ["narrow", "diverse"])
        for (const mode of ["online", "frozen"]) {
          const arena = createArena(seed, {
            snapshot: snapshots[arm],
            learning: mode === "online",
          });
          try {
            branches[id][`${arm}-${mode}`] = runSequence(arena, schedule);
          } finally {
            arena.policy.dispose();
          }
        }
      const fixed = createArena(seed, {
        actions: selectedFixed.actions,
        learning: false,
      });
      try {
        branches[id].fixed = runSequence(fixed, schedule);
      } finally {
        fixed.policy.dispose();
      }
      for (const arm of ["narrow", "diverse"])
        assert.deepEqual(
          combatIdentity(branches[id][`${arm}-online`][0]),
          combatIdentity(branches[id][`${arm}-frozen`][0]),
          "Paired branches must start with identical combat",
        );
    }
  return { seed, training, snapshots, branches };
}
