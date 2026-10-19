import assert from "node:assert/strict";
import { randomAt } from "../synthetic/random.mjs";
import { distance,unit,lineClear,navigation } from "../synthetic/geometry.mjs";
import { playerConfig } from "../synthetic/players.mjs";
export const FRESH_FAMILIES = ["burst-patrol","threat-retreat"];
export function freshPlayerConfig(family,seed,direction=1) {
  assert.ok(FRESH_FAMILIES.includes(family));
  return {...playerConfig("circle",seed,direction),family};
}
export function createFreshPlayer(config, world) {
  assert.ok(FRESH_FAMILIES.includes(config.family));
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
    const n = world.waypoints.length,
      index = Math.floor(t / config.turnPeriod) % n;
    let goal = world.waypoints[d === 1 ? index : n - 1 - index];
    const resting = config.family === "burst-patrol" && (t % config.turnPeriod) / config.turnPeriod > 0.65;
    if (config.family === "threat-retreat" && target) {
      const away = unit(p.x-target.x,p.y-target.y),
        alarm = visible.some(e=>e.windup>0) || o.bullets.some(b=>distance(p,b)<140),
        radial = alarm ? 1 : distance(p,target)>160 ? -1 : 0;
      goal = {
        x:Math.max(40,Math.min(880,p.x+away.x*radial*140-away.y*d*70)),
        y:Math.max(40,Math.min(560,p.y+away.y*radial*140+away.x*d*70)),
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
      x: hesitate || resting ? 0 : dir.x * config.speed,
      y: hesitate || resting ? 0 : dir.y * config.speed,
      aim,
      fire,
      dash:
        danger &&
        p.dashCooldown <= 0 &&
        !resting,
    };
    decisions++;
    return command;
  }
  return { input, stats: () => ({ decisions }) };
}
