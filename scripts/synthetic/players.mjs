import assert from "node:assert/strict";
import { randomAt } from "./random.mjs";
import { distance, unit, lineClear, navigation } from "./geometry.mjs";

export const TRAIN_FAMILIES = ["circle", "rush", "cover", "weave"];
export const TEST_FAMILIES = ["bait-switch", "reactive"];
export const FAMILIES = [...TRAIN_FAMILIES, ...TEST_FAMILIES];
export function playerConfig(family, seed, direction = 1) {
  assert.ok(FAMILIES.includes(family));
  assert.ok(direction === 1 || direction === -1);
  return {
    family,
    seed,
    direction,
    reactionFrames: 6 + Math.floor(randomAt(seed, "reaction") * 13),
    decisionFrames: 6 + Math.floor(randomAt(seed, "cadence") * 5),
    aimError: 0.03 + randomAt(seed, "aim-error") * 0.13,
    fireInterval: 0.55 + randomAt(seed, "fire-rate") * 0.4,
    speed: 0.78 + randomAt(seed, "speed") * 0.22,
    hesitation: randomAt(seed, "hesitation-rate") * 0.07,
    turnPeriod: 2.2 + randomAt(seed, "turn-period") * 2.8,
    orbitRadius: 245 + randomAt(seed, "radius") * 65,
    phase: randomAt(seed, "phase") * Math.PI * 2,
  };
}

/** Public observations only. No tactic IDs, policy scores, hidden targets, RNG, or family labels from the enemy. */
export function observe(arena, walls) {
  const p = arena.player;
  return {
    time: arena.time,
    player: { x: p.x, y: p.y, hp: p.hp, dashCooldown: p.dashCooldown },
    enemies: arena.enemies
      .filter((e) => e.hp > 0 && lineClear(walls, p, e))
      .map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        hp: e.hp,
        windup: e.windup,
        telegraph: e.windup > 0 ? { ...e.target } : null,
      })),
    bullets: arena.bullets
      .filter(
        (b) =>
          b.enemy !== null && distance(p, b) < 280 && lineClear(walls, p, b),
      )
      .map((b) => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
  };
}

export function createPlayer(config, world) {
  assert.ok(FAMILIES.includes(config.family));
  assert.ok(
    Number.isInteger(config.reactionFrames) &&
      config.reactionFrames >= 0 &&
      config.reactionFrames <= 120,
  );
  assert.ok(
    Number.isInteger(config.decisionFrames) &&
      config.decisionFrames > 0 &&
      config.decisionFrames <= 60,
  );
  assert.ok(config.direction === 1 || config.direction === -1);
  assert.ok(
    [
      config.aimError,
      config.fireInterval,
      config.speed,
      config.hesitation,
      config.turnPeriod,
      config.orbitRadius,
      config.phase,
    ].every(Number.isFinite),
  );
  assert.ok(
    config.fireInterval > 0 &&
      config.speed > 0 &&
      config.speed <= 1 &&
      config.turnPeriod > 0 &&
      config.aimError >= 0 &&
      config.hesitation >= 0 &&
      config.hesitation <= 1,
  );
  const nav = navigation(world.walls),
    memory = [];
  let command = {
      x: 0,
      y: 0,
      aim: { ...world.player },
      fire: false,
      dash: false,
    },
    lastFire = -10,
    decisions = 0;
  function input(current, frame) {
    memory.push(current);
    if (memory.length > config.reactionFrames + 1) memory.shift();
    if (frame < config.reactionFrames || frame % config.decisionFrames !== 0)
      return command;
    const o = memory[0],
      p = o.player,
      t = o.time,
      k = Math.floor(frame / config.decisionFrames),
      d = config.direction;
    const visible = [...o.enemies].sort(
        (a, b) => distance(p, a) - distance(p, b),
      ),
      target = visible[0];
    let angle = config.phase + d * t * 0.48,
      goal;
    if (config.family === "bait-switch") {
      const period = config.turnPeriod,
        segment = Math.floor(t / period),
        fraction = t % period;
      angle =
        config.phase + d * 0.48 * (segment % 2 ? period - fraction : fraction);
    }
    goal = {
      x: 460 + Math.cos(angle) * config.orbitRadius,
      y: 300 + Math.sin(angle) * 195,
    };
    if (config.family === "weave")
      goal = {
        x: 460 + Math.sin(config.phase + d * t * 0.7) * 230,
        y: 300 + Math.sin(config.phase + t * 1.4) * 140,
      };
    if (config.family === "cover") {
      const n = world.waypoints.length,
        index = Math.floor(t / config.turnPeriod) % n;
      goal = world.waypoints[d === 1 ? index : n - 1 - index];
    }
    if (config.family === "rush" && target) goal = target;
    if (config.family === "reactive" && target) {
      const away = unit(p.x - target.x, p.y - target.y),
        range = distance(p, target),
        radial = range < 200 ? 1 : range > 320 ? -1 : 0;
      goal = {
        x: Math.max(
          40,
          Math.min(880, p.x + away.x * radial * 110 - away.y * d * 110),
        ),
        y: Math.max(
          40,
          Math.min(560, p.y + away.y * radial * 110 + away.x * d * 110),
        ),
      };
    }
    const path = nav.route(p, goal);
    while (
      path.length > 1 &&
      distance(p, path[0]) < 22 &&
      lineClear(world.walls, p, path[1], 17)
    )
      path.shift();
    const next = path[0] ?? p,
      dir = unit(next.x - p.x, next.y - p.y),
      hesitate = randomAt(config.seed, "hesitate", k) < config.hesitation;
    let aim = goal;
    if (target) {
      const a =
          Math.atan2(target.y - p.y, target.x - p.x) +
          (randomAt(config.seed, "aim", k) * 2 - 1) * config.aimError,
        r = distance(p, target);
      aim = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    }
    const danger =
      o.bullets.some((b) => distance(p, b) < 95) ||
      visible.some(
        (e) => e.telegraph && e.windup < 0.3 && distance(p, e.telegraph) < 50,
      );
    const fire = !!target && !hesitate && t - lastFire >= config.fireInterval;
    if (fire) lastFire = t;
    command = {
      x: hesitate ? 0 : dir.x * config.speed,
      y: hesitate ? 0 : dir.y * config.speed,
      aim,
      fire,
      dash:
        danger &&
        p.dashCooldown <= 0 &&
        ["reactive", "cover", "bait-switch"].includes(config.family),
    };
    decisions++;
    return command;
  }
  return { input, stats: () => ({ decisions }) };
}
