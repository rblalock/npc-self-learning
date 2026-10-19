import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Arena, WALLS, makePolicy } from "../evidence-baseline.mjs";
import { fixedPolicy } from "../evaluation-support.mjs";
import { requireWorld, distance } from "../synthetic/geometry.mjs";
import { createPlayer, observe } from "../synthetic/players.mjs";
import { createFreshPlayer, FRESH_FAMILIES } from "./players.mjs";
import { TEST_FAMILIES } from "../synthetic/players.mjs";

const checked = new Set();
export function setWorld(world) {
  const key = JSON.stringify(world);
  if (!checked.has(key)) {
    requireWorld(world);
    checked.add(key);
  }
  WALLS.splice(0, WALLS.length, ...structuredClone(world.walls));
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
    ? (FRESH_FAMILIES.includes(scenario.player.family) ? createFreshPlayer : createPlayer)(scenario.player, scenario.world)
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
