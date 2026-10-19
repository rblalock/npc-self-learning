import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  Arena,
  makePolicy,
  baselineRoot,
  WALLS,
} from "./evidence-baseline.mjs";
import { randomAt, seedFor } from "./synthetic/random.mjs";
import {
  lineClear,
  validateWorld,
  blocked,
  navigation,
} from "./synthetic/geometry.mjs";
import {
  createPlayer,
  observe,
  playerConfig,
  FAMILIES,
  TRAIN_FAMILIES,
  TEST_FAMILIES,
} from "./synthetic/players.mjs";
import {
  ORIGINAL,
  generateWorld,
  trainingSchedule,
  testSchedule,
  calibrationCases,
  TRAIN_MAPS,
  TEST_MAPS,
} from "./synthetic/scenarios.mjs";
import {
  createArena,
  runEncounter,
  runSequence,
  setWorld,
} from "./synthetic/runner.mjs";
import { verifyTrace } from "./synthetic/verify.mjs";
import { diagnose } from "./synthetic/diagnostic.mjs";
import { fixedProfiles, ROLE_ACTIONS } from "./evaluation-support.mjs";

const protocol = JSON.parse(
  await readFile(
    new URL(
      "../docs/experiments/synthetic-population-v1.protocol.json",
      import.meta.url,
    ),
  ),
);

test("diagnostic attribution recovers a known interaction without assigning all credit to one role", () => {
  const cells = (probability) =>
    Object.entries(ROLE_ACTIONS).flatMap(([role, actions]) =>
      actions.map((action, i) => ({
        role,
        action,
        probability: i === 0 ? probability : 1 - probability,
      })),
    );
  const matrix = fixedProfiles().map((profile) => ({
    world: "original",
    style: "feint",
    profile,
    damage:
      8 * +(profile.actions.vanguard === "rush") +
      12 *
        +(
          profile.actions.flanker === "flank_left" &&
          profile.actions.ranger === "aim"
        ),
    recap: Object.keys(ROLE_ACTIONS).map((role) => ({
      role,
      damage: 0,
      reward: 0,
      observed: true,
    })),
  }));
  const reference = {
    trials: [
      {
        seed: 1,
        training: { online: [{ policy: cells(0.5) }] },
        branches: {
          feint: {
            online: Array.from({ length: 24 }, () => ({ policy: cells(0.75) })),
          },
        },
      },
    ],
  };
  const result = diagnose(
    { styles: ["feint"], late_rounds: [17, 24] },
    matrix,
    reference,
  );
  assert.equal(result.originalFeintExpectedChange, 5.75);
  const expected = {
    vanguard: 2,
    flanker: 1.875,
    ranger: 1.875,
  };
  for (const [role, value] of Object.entries(expected)) {
    assert.ok(Math.abs(result.roleContributions[role] - value) < 1e-12);
  }
  assert.ok(result.creditBlindPairs.length > 0);
});
const archived = await import(
  pathToFileURL(resolve(baselineRoot, "target/arena-test/sim.js"))
);
const scenario = (family = "circle", direction = 1) => ({
  id: `qa-${family}-${direction}`,
  phase: "qa",
  world: ORIGINAL,
  player: playerConfig(family, 99991, direction),
});

test("counter-based streams remain stable after skipped draws and separate bot/map randomness", () => {
  const before = randomAt(42, "aim", 17);
  for (let i = 0; i < 100; i++) randomAt(42, "hesitate", i);
  assert.equal(randomAt(42, "aim", 17), before);
  assert.notEqual(seedFor(42, "map"), seedFor(42, "player"));
  assert.notEqual(randomAt(42, "aim", 17), randomAt(42, "aim", 18));
});
test("geometry probes agree with actual combat; invalid and disconnected maps are rejected", () => {
  setWorld(ORIGINAL);
  for (let i = 0; i < 200; i++) {
    const a = {
        x: randomAt(99, "ax", i) * 920,
        y: randomAt(99, "ay", i) * 600,
      },
      b = { x: randomAt(99, "bx", i) * 920, y: randomAt(99, "by", i) * 600 };
    for (const radius of [0, 17, 19])
      assert.equal(
        lineClear(ORIGINAL.walls, a, b, radius),
        archived.lineOfSight(a, b, radius),
      );
  }
  assert.equal(
    validateWorld({
      ...ORIGINAL,
      spawns: [{ x: 270, y: 180 }, ...ORIGINAL.spawns.slice(1)],
    }).valid,
    false,
  );
  assert.equal(
    validateWorld({
      ...ORIGINAL,
      walls: [{ x: 440, y: 0, w: 40, h: 600 }],
      player: { x: 400, y: 300 },
    }).valid,
    false,
  );
  assert.equal(
    validateWorld({ ...ORIGINAL, walls: [{ x: NaN, y: 0, w: 40, h: 60 }] })
      .valid,
    false,
  );
});
test("reserved geometry validation and split audit execute no performance measurements", () => {
  assert.ok(TRAIN_FAMILIES.every((f) => !TEST_FAMILIES.includes(f)));
  assert.ok(TRAIN_MAPS.every((m) => !TEST_MAPS.includes(m)));
  for (const seed of protocol.seeds) {
    const train = trainingSchedule(protocol, seed, "diverse");
    assert.equal(train.length, 48);
    for (const family of TRAIN_FAMILIES)
      assert.equal(train.filter((s) => s.player.family === family).length, 12);
    for (const map of TRAIN_MAPS)
      assert.equal(train.filter((s) => s.world.family === map).length, 24);
    for (const family of TEST_FAMILIES)
      for (const map of TEST_MAPS) {
        const schedule = testSchedule(protocol, seed, family, map);
        assert.equal(schedule.length, 36);
        assert.deepEqual(schedule[0].player, schedule[24].player);
        assert.equal(schedule[12].player.direction, -1);
        assert.equal(schedule[0].player.direction, 1);
        assert.deepEqual(schedule[0].world, schedule[12].world);
        assert.equal(schedule[0].world.validation.valid, true);
        assert.equal(
          train.some(
            (s) => s.player.family === family || s.world.family === map,
          ),
          false,
        );
      }
  }
  for (const s of calibrationCases()) {
    assert.ok(TRAIN_FAMILIES.includes(s.player.family));
    assert.ok(TRAIN_MAPS.includes(s.world.family));
  }
  for (const family of [...TRAIN_MAPS, ...TEST_MAPS])
    for (let seed = 100; seed < 110; seed++) {
      const world = generateWorld(family, seed);
      assert.deepEqual(world, generateWorld(family, seed));
      assert.ok(validateWorld(world).valid);
    }
});
test("player observation excludes occluded units and cannot access policy or tactic fields", () => {
  const visible = {
    id: 0,
    x: 120,
    y: 100,
    hp: 72,
    windup: 0.2,
    target: { x: 100, y: 100 },
  };
  Object.defineProperty(visible, "tactic", {
    get() {
      throw Error("privileged tactic read");
    },
  });
  const hidden = {
    id: 1,
    x: 300,
    y: 100,
    hp: 72,
    windup: 0.5,
    target: { x: 100, y: 100 },
  };
  const fake = {
    time: 1,
    player: { x: 100, y: 100, hp: 100, dashCooldown: 0 },
    enemies: [visible, hidden],
    bullets: [{ x: 300, y: 100, vx: 1, vy: 0, enemy: 1 }],
  };
  Object.defineProperty(fake, "policy", {
    get() {
      throw Error("privileged memory read");
    },
  });
  const view = observe(fake, [{ x: 180, y: 40, w: 50, h: 120 }]);
  assert.deepEqual(
    view.enemies.map((e) => e.id),
    [0],
  );
  assert.equal(view.bullets.length, 0);
  assert.deepEqual(Object.keys(view.enemies[0]), [
    "id",
    "x",
    "y",
    "hp",
    "windup",
    "telegraph",
  ]);
});
test("reaction delay uses old observations; malformed speed and cadence are rejected", () => {
  const config = {
    ...playerConfig("rush", 99991),
    reactionFrames: 12,
    decisionFrames: 6,
    aimError: 0,
    hesitation: 0,
  };
  const bot = createPlayer(config, ORIGINAL);
  for (let frame = 0; frame <= 12; frame++) {
    const input = bot.input(
      {
        time: frame / 60,
        player: { x: 460, y: 300, hp: 100, dashCooldown: 0 },
        enemies: [
          {
            id: 0,
            x: 100 + frame * 10,
            y: 300,
            hp: 72,
            windup: 0,
            telegraph: null,
          },
        ],
        bullets: [],
      },
      frame,
    );
    if (frame < 12) assert.equal(input.fire, false);
    else assert.ok(Math.abs(input.aim.x - 100) < 1e-8);
  }
  assert.throws(() => createPlayer({ ...config, speed: 2 }, ORIGINAL));
  assert.throws(() => createPlayer({ ...config, decisionFrames: 0 }, ORIGINAL));
});
test("all controller branches emit bounded commands; obstructed goals project to free space", () => {
  const route = navigation(ORIGINAL.walls).route(ORIGINAL.player, {
    x: 280,
    y: 180,
  });
  assert.ok(route.length > 0);
  for (const point of route) assert.ok(!blocked(ORIGINAL.walls, point, 17));
  for (const family of FAMILIES) {
    const bot = createPlayer(playerConfig(family, 991), ORIGINAL);
    for (let frame = 0; frame < 120; frame++) {
      const input = bot.input(
        {
          time: frame / 60,
          player: { x: 460, y: 300, hp: 100, dashCooldown: 0 },
          enemies: [
            {
              id: 1,
              x: 600,
              y: 300,
              hp: 72,
              windup: 0.2,
              telegraph: { x: 460, y: 300 },
            },
          ],
          bullets: [],
        },
        frame,
      );
      assert.ok(
        [input.x, input.y, input.aim.x, input.aim.y].every(Number.isFinite),
      );
      assert.ok(Math.hypot(input.x, input.y) <= 1.000001);
    }
  }
});

test("legacy adapter preserves original combat and policies exactly", (t) => {
  setWorld(ORIGINAL);
  const original = new Arena(makePolicy(99991)),
    adapter = createArena(99991);
  t.after(() => {
    original.policy.dispose();
    adapter.policy.dispose();
  });
  for (const style of ["orbit", "reverse", "feint"]) {
    const a = original.runEncounter(style),
      b = runEncounter(adapter, {
        id: "qa-legacy",
        phase: "qa",
        world: ORIGINAL,
        legacyStyle: style,
      });
    for (const key of Object.keys(a)) assert.deepEqual(b[key], a[key]);
    assert.deepEqual(original.inspect().cells, adapter.inspect().cells);
  }
});
test("training bots move through legal geometry and deterministic replay matches all inputs", (t) => {
  for (const family of TRAIN_FAMILIES) {
    const a = createArena(99991),
      b = createArena(99991);
    t.after(() => {
      a.policy.dispose();
      b.policy.dispose();
    });
    const s = scenario(family),
      first = runEncounter(a, s, { capture: true }),
      second = runEncounter(b, s, { capture: true });
    assert.deepEqual(first, second);
    assert.ok(first.row.inputs.distance > 200, `${family} failed to move`);
    assert.ok(first.row.inputs.decisions > 0);
    for (const f of first.frames)
      assert.ok(
        !blocked(ORIGINAL.walls, f.player, 13),
        `${family} inside cover`,
      );
  }
});
test("frozen counterfactuals preserve exact memory; policy verifier rejects corrupted reward and history", (t) => {
  const trainer = createArena(99991);
  t.after(() => trainer.policy.dispose());
  const schedule = [scenario(), scenario("cover"), scenario("rush")],
    rows = runSequence(trainer, schedule),
    snapshot = trainer.policy.request({ op: "snapshot" });
  assert.deepEqual(
    verifyTrace(99991, rows, { learning: true, schedule }),
    snapshot,
  );
  const a = createArena(99991, { snapshot }),
    b = createArena(99991, { snapshot, learning: false });
  t.after(() => {
    a.policy.dispose();
    b.policy.dispose();
  });
  const next = [
      scenario("circle", -1),
      scenario("circle", -1),
      scenario("circle", 1),
    ],
    online = runSequence(a, next),
    frozen = runSequence(b, next);
  assert.deepEqual(online[0].choices, frozen[0].choices);
  assert.equal(online[0].inputSha256, frozen[0].inputSha256);
  assert.equal(online[0].damage, frozen[0].damage);
  assert.deepEqual(b.inspect().cells, trainer.inspect().cells);
  verifyTrace(99991, frozen, { snapshot, learning: false, schedule: next });
  const bad = structuredClone(rows);
  bad[0].recap[0].reward += 0.1;
  assert.throws(() => verifyTrace(99991, bad, { learning: true, schedule }));
  const wrongPhase = structuredClone(rows);
  wrongPhase[0].phase = "switch";
  assert.throws(() =>
    verifyTrace(99991, wrongPhase, { learning: true, schedule }),
  );
});
