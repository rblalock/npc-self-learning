import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, DEFAULT_NPC_TUNING, LOCK_WINDOW, TACTICS, WALLS, lineOfSight } from '../target/agentic-sim/sim.js';
import { combat } from './agentic-v1/combat.mjs';
import { combat as researchCombat } from './research/combat.mjs';
import { ORIGINAL } from './synthetic/scenarios.mjs';
import { trainingExample, history, FRESH_CASES } from './research/scenarios.mjs';

const ROLES = Object.keys(TACTICS);
const idle = { x: 0, y: 0, aim: { x: 0, y: 0 }, fire: false, dash: false };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function policy() {
  const state = { pending: 0, queued: 0, encounter: 0, cells: ROLES.flatMap(role =>
    TACTICS[role].map(action => ({ role, action, probability: .5 }))) };
  return { state, request(q) {
    if (q.op === 'inspect') return state;
    if (q.op === 'choose') { state.pending++; return { decision_id: state.pending, action: q.allowed[0], probabilities: [], baseline: false }; }
    if (q.op === 'feedback') { state.pending--; state.queued++; return { accepted: false }; }
    assert.equal(q.op, 'commit'); state.queued = 0; state.encounter++; return state;
  } };
}
function solo(tuning = {}, role = 'ranger') {
  const a = new Arena(policy()); a.setNpcTuning(tuning); a.auto = false; a.startEncounter();
  for (const e of a.enemies) if (e.role !== role) e.hp = 0;
  return a;
}
function useWalls(t, walls) {
  const saved = WALLS.slice(); WALLS.splice(0, WALLS.length, ...structuredClone(walls));
  t.after(() => WALLS.splice(0, WALLS.length, ...saved));
}
const physical = row => { const { npcTelemetry, ...rest } = row; return rest; };

test('authored defaults exactly reproduce archived research rows and replay frames', () => {
  const fixtures = [
    ...['orbit', 'reverse', 'cover', 'weave', 'feint'].map(legacyStyle => ({ id: legacyStyle, world: ORIGINAL, legacyStyle })),
    trainingExample(19, 0), trainingExample(19, 1),
    ...FRESH_CASES.map(id => history(31, id, 'qa', 1)[0]),
  ];
  for (const [i, scenario] of fixtures.entries()) {
    const roster = i % 2 ? ROLES : ['ranger'];
    const actions = Object.fromEntries(ROLES.map((role, index) => [role, TACTICS[role][(i + index) % 2]]));
    const expected = researchCombat(scenario, roster, actions, { capture: true });
    const actual = combat(scenario, roster, actions, { capture: true });
    assert.deepEqual(physical(actual.row), expected.row, scenario.id);
    assert.deepEqual(actual.frames, expected.frames, scenario.id);
    assert.deepEqual(combat(scenario, roster, actions, { tuning: DEFAULT_NPC_TUNING }), actual.row);
    assert.deepEqual(actual.row.npcTelemetry.map(e => e.role), roster);
  }
});

test('ranger tuning leaves isolated non-ranger replays exactly unchanged', () => {
  const scenario = { id: 'other-roles', world: ORIGINAL, legacyStyle: 'weave' };
  for (const role of ['vanguard', 'flanker']) {
    const args = [scenario, [role], { [role]: TACTICS[role][1] }];
    assert.deepEqual(combat(...args, { capture: true, tuning: { rangerDistance: 360, rangerLeadScale: 0 } }),
      combat(...args, { capture: true }));
  }
});

test('tuning accepts inclusive bounds, copies values, and resets omitted fields to defaults', () => {
  const a = new Arena(policy());
  assert.deepEqual(a.npcTuning, { rangerDistance: 275, rangerLeadScale: 1 });
  assert.ok(Object.isFrozen(DEFAULT_NPC_TUNING));
  const tuning = { rangerDistance: 180, rangerLeadScale: 0 };
  a.setNpcTuning(tuning); tuning.rangerDistance = 999;
  assert.deepEqual(a.npcTuning, { rangerDistance: 180, rangerLeadScale: 0 });
  assert.throws(() => { a.npcTuning.rangerDistance = 999; }, TypeError);
  assert.throws(() => { a.npcTuning = {}; }, TypeError);
  a.setNpcTuning({ rangerDistance: 360, rangerLeadScale: 1.5 });
  a.setNpcTuning({ rangerLeadScale: .5 });
  assert.deepEqual(a.npcTuning, { rangerDistance: 275, rangerLeadScale: .5 });
  a.setNpcTuning({}); assert.deepEqual(a.npcTuning, DEFAULT_NPC_TUNING);
});

test('invalid tuning is rejected atomically, including hidden keys and accessors', () => {
  const a = new Arena(policy()); a.setNpcTuning({ rangerDistance: 200 });
  const before = a.npcTuning;
  const invalid = [null, undefined, [], 1, '275', new Date(), Object.create({ rangerDistance: 200 }),
    { speed: 1 }, { rangerDistance: 179.999 }, { rangerDistance: 360.001 }, { rangerLeadScale: -.001 }, { rangerLeadScale: 1.501 },
    { rangerDistance: 200, damage: 12 }, { [Symbol('unknown')]: 1 },
    Object.defineProperty({}, 'unknown', { value: 1 }),
    { get rangerDistance() { throw Error('accessor must not run'); } },
    ...[NaN, Infinity, -Infinity, '200', null, undefined, true].flatMap(value =>
      [{ rangerDistance: value }, { rangerLeadScale: value }]),
  ];
  for (const tuning of invalid) {
    assert.throws(() => a.setNpcTuning(tuning)); assert.strictEqual(a.npcTuning, before);
  }
  const scenario = { id: 'invalid', world: ORIGINAL, legacyStyle: 'orbit' };
  for (const tuning of invalid.filter(value => value !== undefined)) {
    assert.throws(() => combat(scenario, ['ranger'], { ranger: 'lead' }, { tuning }));
  }
});

test('tuning requires inactive encounters and a clean policy boundary', () => {
  const p = policy(), a = new Arena(p);
  a.startEncounter();
  assert.throws(() => a.setNpcTuning({}), /inactive/);
  a.update(1 / 60); assert.throws(() => a.setNpcTuning({ rangerDistance: 180 }), /inactive/);
  a.discardEncounter(); a.setNpcTuning({ rangerDistance: 180 });
  a.startEncounter(); a.finish('survived'); a.setNpcTuning({ rangerLeadScale: 0 });
  for (const field of ['pending', 'queued']) {
    p.state[field] = 1;
    assert.throws(() => a.setNpcTuning({ rangerDistance: 360 }), /clean policy boundary/);
    assert.deepEqual(a.npcTuning, { rangerDistance: 275, rangerLeadScale: 0 });
    p.state[field] = 0;
  }
  a.setNpcTuning({});
});

test('ranger distance changes the visible standoff goal without changing speed or cooldown', t => {
  useWalls(t, []);
  for (const rangerDistance of [180, 275, 360]) {
    const a = solo({ rangerDistance }), e = a.enemies[2];
    Object.assign(a.player, { x: 400, y: 300 });
    Object.assign(e, { x: 100, y: 300, cooldown: 100, repath: 0 });
    a.update(1 / 60, idle);
    assert.deepEqual(e.path[0], { x: Math.max(45, 400 - rangerDistance), y: 300 });
    close(Math.abs(e.x - 100), 77 / 60); close(e.cooldown, 100 - 1 / 60);
    assert.equal(e.hp, 72); assert.equal(a.player.hp, 100);
  }
});

test('lead scale applies at windup start and tracking; aim remains unled', t => {
  useWalls(t, []);
  for (const tactic of ['aim', 'lead']) for (const rangerLeadScale of [0, .5, 1, 1.5]) {
    const a = solo({ rangerLeadScale }), e = a.enemies[2];
    Object.assign(a.player, { x: 400, y: 300 });
    Object.assign(e, { x: 100, y: 300, cooldown: 0, tactic });
    for (let frame = 0; frame < 2; frame++) {
      const old = { x: e.x, y: e.y };
      a.update(1 / 60, { ...idle, y: 1 });
      const range = Math.hypot(a.player.x - old.x, a.player.y - old.y);
      const lead = tactic === 'lead' ? (LOCK_WINDOW + range / 480) * rangerLeadScale : 0;
      close(e.target.x, a.player.x); close(e.target.y, a.player.y + 165 * lead);
      close(e.windup, .72 - frame / 60);
    }
  }
});

test('tuning and hidden player motion cannot change an NPC search or refresh its sighting', t => {
  useWalls(t, ORIGINAL.walls);
  const arenas = [solo({ rangerDistance: 180, rangerLeadScale: 0 }), solo({ rangerDistance: 360, rangerLeadScale: 1.5 })];
  for (const a of arenas) {
    Object.assign(a.enemies[2], { x: 200, y: 188, cooldown: 100 });
    Object.assign(a.player, { x: 220, y: 250 });
    a.update(1 / 60, idle);
    Object.assign(a.enemies[2], { x: 200, y: 188, path: [], repath: 0 });
  }
  const remembered = structuredClone(arenas[0].enemies[2].lastSeen);
  for (const [i, a] of arenas.entries()) Object.assign(a.player, { x: 430 + i * 60, y: 188 });
  for (let frame = 0; frame < 8; frame++) {
    arenas.forEach((a, i) => a.update(1 / 60, { ...idle, x: i ? .5 : -.5 }));
    for (const a of arenas) {
      assert.deepEqual(a.enemies[2].lastSeen, remembered);
      assert.equal(a.enemies[2].sightings, 1 / 60);
    }
    assert.deepEqual(arenas[0].enemies[2], arenas[1].enemies[2]);
  }
});

test('telemetry matches visible samples and actual bullet creation with a strict safe schema', () => {
  const update = Arena.prototype.update;
  const sums = Object.fromEntries(ROLES.map(role => [role, { seconds: 0, speed: 0, range: 0, stopped: 0, shots: 0 }]));
  Arena.prototype.update = function(dt, input) {
    const prior = this.enemies.map(e => ({ ...e })), bullets = this.bullets, push = bullets.push;
    bullets.push = (...created) => {
      for (const b of created) if (b.enemy !== null) sums[this.enemies[b.enemy].role].shots++;
      return push.apply(bullets, created);
    };
    try { update.call(this, dt, input); } finally { delete bullets.push; }
    for (const e of prior) if (e.hp > 0 && lineOfSight(e, this.player)) {
      const s = sums[e.role], speed = Math.hypot(this.player.vx, this.player.vy);
      s.seconds += dt; s.speed += speed * dt; s.stopped += speed < 1 ? dt : 0;
      s.range += Math.hypot(this.player.x - e.x, this.player.y - e.y) * dt;
    }
  };
  let row;
  try { row = combat({ id: 'private-label', seed: 999, world: ORIGINAL, legacyStyle: 'cover' }, ROLES, { ranger: 'lead' }); }
  finally { Arena.prototype.update = update; }
  for (const telemetry of row.npcTelemetry) {
    assert.deepEqual(Object.keys(telemetry).sort(), ['role', 'visibleSeconds', 'meanVisibleSpeed', 'stoppedFraction', 'meanVisibleRange', 'shotsFired', 'hits'].sort());
    const s = sums[telemetry.role];
    close(telemetry.visibleSeconds, s.seconds);
    close(telemetry.meanVisibleSpeed, s.speed / s.seconds);
    close(telemetry.stoppedFraction, s.stopped / s.seconds);
    close(telemetry.meanVisibleRange, s.range / s.seconds);
    assert.equal(telemetry.shotsFired, s.shots);
    assert.equal(telemetry.hits, row.enemies.find(e => e.role === telemetry.role).damage / 12);
    assert.ok(telemetry.hits <= telemetry.shotsFired);
  }
  assert.ok(row.npcTelemetry.some(e => e.visibleSeconds < row.duration));
  assert.ok(row.npcTelemetry.some(e => e.stoppedFraction > 0));
});

test('no sightings produce null means, and no hidden player fields enter telemetry', () => {
  const update = Arena.prototype.update;
  Arena.prototype.update = function(dt, input) { update.call(this, dt, input); this.finish('survived'); };
  try {
    const scenario = { id: 'unseen', world: { ...ORIGINAL, player: { x: 430, y: 188 },
      spawns: [{ x: 100, y: 450 }, { x: 800, y: 450 }, { x: 200, y: 188 }] } };
    const row = combat(scenario, ['ranger'], { ranger: 'lead' });
    assert.deepEqual(row.npcTelemetry, [{ role: 'ranger', visibleSeconds: 0, meanVisibleSpeed: null,
      stoppedFraction: null, meanVisibleRange: null, shotsFired: 0, hits: 0 }]);
  } finally { Arena.prototype.update = update; }
});

test('combat tuning is deterministic, changes ranger play, and restores shared geometry on errors', () => {
  const scenario = { id: 'effect', world: ORIGINAL, legacyStyle: 'orbit' }, args = [scenario, ['ranger'], { ranger: 'lead' }];
  const options = { tuning: { rangerDistance: 180, rangerLeadScale: 0 }, capture: true };
  const tuned = combat(...args, options);
  assert.deepEqual(tuned, combat(...args, options));
  assert.notDeepEqual(tuned.frames, combat(...args, { capture: true }).frames);
  const before = structuredClone(WALLS), different = trainingExample(19, 1);
  combat(different, ['ranger'], {}); assert.deepEqual(WALLS, before);
  assert.throws(() => combat({ ...different, player: { family: 'unknown' } }, ['ranger'], {}));
  assert.deepEqual(WALLS, before);
  for (const roster of [[], ['unknown'], ['ranger', 'ranger']]) assert.throws(() => combat(scenario, roster, {}));
  assert.throws(() => combat(scenario, ['ranger'], { ranger: 'rush' }));
});
