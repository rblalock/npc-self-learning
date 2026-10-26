import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Arena, DEFAULT_NPC_TUNING, TACTICS, WALLS, lineOfSight } from '../../target/agentic-sim/sim.js';
import { requireWorld, distance } from '../synthetic/geometry.mjs';
import { createPlayer, observe, FAMILIES } from '../synthetic/players.mjs';
import { createResearchPlayer } from '../research/players.mjs';

export { DEFAULT_NPC_TUNING };

// Decisions and learning belong to the host. Physical termination and every
// simulation step use the current Arena without modifying its combat dynamics.
class PhysicalArena extends Arena {
  finish(result) { if (this.active) { this.active = false; this.physicalResult = result; } }
}
const valid = new Set();
const stateFrame = a => ({
  time: a.time, active: a.active, player: { x: a.player.x, y: a.player.y, hp: Math.max(0, a.player.hp) },
  enemies: a.enemies.filter(e => a.roster.includes(e.role)).map(e => ({
    id: e.id, role: e.role, tactic: e.tactic, x: e.x, y: e.y, hp: e.hp, windup: e.windup, target: { ...e.target },
  })),
  bullets: a.bullets.map(b => ({ x: b.x, y: b.y, enemy: b.enemy })),
});

/** Research-compatible physical row, plus per-role NPC telemetry.
 * Means are time-weighted over confirmed sightings; stopped means <1 px/s.
 * No sightings yields null means/fraction. Captures are full replay frames,
 * not restricted observations, and must not be passed to an NPC agent.
 */
export function combat(scenario, roster, actions, { tuning = DEFAULT_NPC_TUNING, capture = false } = {}) {
  assert.ok(Array.isArray(roster) && roster.length > 0 && new Set(roster).size === roster.length &&
    roster.every(role => Object.hasOwn(TACTICS, role)), 'Invalid NPC roster');
  assert.ok(actions && typeof actions === 'object' && !Array.isArray(actions), 'Invalid NPC actions');
  for (const [role, action] of Object.entries(actions)) {
    assert.ok(Object.hasOwn(TACTICS, role) && TACTICS[role].includes(action), 'Invalid NPC action');
  }
  const facade = { request(q) {
    if (q.op === 'inspect') return { cells: [], pending: 0, queued: 0 };
    assert.equal(q.op, 'choose');
    return { decision_id: 0, action: actions[q.role] ?? TACTICS[q.role][0], probabilities: [], baseline: false };
  } };
  const a = new PhysicalArena(facade);
  a.setNpcTuning(tuning);
  const key = JSON.stringify(scenario.world);
  if (!valid.has(key)) { requireWorld(scenario.world); valid.add(key); }
  const previousWalls = WALLS.slice();
  WALLS.splice(0, WALLS.length, ...structuredClone(scenario.world.walls));
  try {
    a.roster = roster; a.communication = 'direct';
    a.auto = !!scenario.legacyStyle;
    if (scenario.legacyStyle) a.style = scenario.legacyStyle;
    a.startEncounter(); Object.assign(a.player, scenario.world.player);
    for (const [i, e] of a.enemies.entries()) {
      Object.assign(e, scenario.world.spawns[i]);
      if (!roster.includes(e.role)) e.hp = 0; // Preserve the simulator's bullet-ID indexing.
    }
    const bot = scenario.player ? (FAMILIES.includes(scenario.player.family) ? createPlayer : createResearchPlayer)(scenario.player, scenario.world) : null;
    const hash = createHash('sha256'), frames = capture ? [stateFrame(a)] : [];
    const inputs = { distance: 0, fireFrames: 0, dashFrames: 0 };
    const totals = a.enemies.map(() => ({ speedSeconds: 0, stoppedSeconds: 0, rangeSeconds: 0, shotsFired: 0 }));
    let steps = 0;
    while (a.active && steps < 1700) {
      const old = { x: a.player.x, y: a.player.y }, input = bot?.input(observe(a, scenario.world.walls), steps);
      if (input) {
        assert.ok([input.x, input.y, input.aim.x, input.aim.y].every(Number.isFinite));
        assert.ok(Math.hypot(input.x, input.y) <= 1.000001);
        hash.update(JSON.stringify(input)); inputs.fireFrames += +input.fire; inputs.dashFrames += +input.dash;
      }
      const before = a.enemies.map(e => ({ x: e.x, y: e.y, cooldown: e.cooldown, sightings: e.sightings }));
      a.update(1 / 60, input); inputs.distance += distance(old, a.player); steps++;
      for (const e of a.enemies) {
        const prior = before[e.id], total = totals[e.id], visibleSeconds = e.sightings - prior.sightings;
        if (visibleSeconds > 0) {
          // Arena records the sighting after player movement and before NPC
          // movement. Read that confirmed sample, never a hidden player state.
          assert.ok(e.lastSeen && lineOfSight(prior, e.lastSeen));
          const speed = Math.hypot(e.lastSeen.vx, e.lastSeen.vy);
          total.speedSeconds += speed * visibleSeconds;
          total.stoppedSeconds += (speed < 1 ? visibleSeconds : 0);
          total.rangeSeconds += distance(prior, e.lastSeen) * visibleSeconds;
        }
        // Only an actual fired shot resets cooldown upward. Counting surviving
        // bullets would miss shots that hit or collide during the same step.
        if (e.cooldown > prior.cooldown) total.shotsFired++;
      }
      if (capture && (steps % 6 === 0 || !a.active)) frames.push(stateFrame(a));
    }
    assert.ok(!a.active && a.physicalResult && steps > 0 && steps <= 1561);
    assert.ok(a.enemies.filter(e => !roster.includes(e.role)).every(e => e.damage === 0 && e.sightings === 0));
    const participants = a.enemies.filter(e => roster.includes(e.role));
    const row = {
      scenario: scenario.id, result: a.physicalResult, duration: a.time,
      health: Math.max(0, a.player.hp), damage: 100 - Math.max(0, a.player.hp), steps,
      enemies: participants.map(e => ({ role: e.role, hp: e.hp, damage: e.damage, sightings: e.sightings })),
      inputSha256: bot ? hash.digest('hex') : null, inputs: bot ? { ...inputs, ...bot.stats() } : null,
      npcTelemetry: participants.map(e => {
        const total = totals[e.id], mean = sum => e.sightings > 0 ? sum / e.sightings : null;
        return {
          role: e.role, visibleSeconds: e.sightings, meanVisibleSpeed: mean(total.speedSeconds),
          stoppedFraction: mean(total.stoppedSeconds), meanVisibleRange: mean(total.rangeSeconds),
          shotsFired: total.shotsFired, hits: e.damage / 12,
        };
      }),
    };
    return capture ? { row, frames } : row;
  } finally {
    WALLS.splice(0, WALLS.length, ...previousWalls);
  }
}
