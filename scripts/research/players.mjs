import assert from "node:assert/strict";
import { randomAt } from "../synthetic/random.mjs";
import { distance,unit,lineClear,navigation } from "../synthetic/geometry.mjs";
import { playerConfig } from "../synthetic/players.mjs";
export const RESEARCH_FAMILIES = ["zigzag-advance","cover-peek"];
export function researchPlayerConfig(family,seed,direction=1) {
  assert.ok(RESEARCH_FAMILIES.includes(family));
  return {...playerConfig("circle",seed,direction),family};
}
export function createResearchPlayer(config, world) {
  assert.ok(RESEARCH_FAMILIES.includes(config.family));
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
    let resting = false;
    if (config.family === "zigzag-advance" && target) {
      const toward=unit(target.x-p.x,target.y-p.y),side=d*(Math.floor(t/1.1)%2?1:-1);
      goal={x:Math.max(40,Math.min(880,p.x+toward.x*100-toward.y*side*100)),
        y:Math.max(40,Math.min(560,p.y+toward.y*100+toward.x*side*100))};
    }
    if (config.family === "cover-peek") {
      // Select an authored cover corner using public geometry and cycle between approach and retreat.
      const wall=world.walls[(d===1?index:n-1-index)%world.walls.length],
        nearSide=p.x<wall.x+wall.w/2?-1:1,
        exposed=(t%config.turnPeriod)/config.turnPeriod<.55;
      goal={x:wall.x+(nearSide===-1?-40:wall.w+40),
        y:Math.max(40,Math.min(560,wall.y+(d===1?-1:1)*(exposed?55:0)+(d===1?0:wall.h)))};
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
