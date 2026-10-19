import assert from "node:assert/strict";
import { randomAt, seedFor } from "./random.mjs";
import { validateWorld } from "./geometry.mjs";
import { TRAIN_FAMILIES, TEST_FAMILIES, playerConfig } from "./players.mjs";

export const ORIGINAL = {
  id: "original",
  family: "original",
  player: { x: 460, y: 300 },
  spawns: [
    { x: 105, y: 300 },
    { x: 815, y: 475 },
    { x: 790, y: 105 },
  ],
  walls: [
    { x: 250, y: 156, w: 105, h: 64 },
    { x: 565, y: 380, w: 105, h: 64 },
    { x: 250, y: 380, w: 64, h: 64 },
    { x: 606, y: 156, w: 64, h: 64 },
  ],
  waypoints: [
    { x: 180, y: 260 },
    { x: 390, y: 270 },
    { x: 740, y: 340 },
    { x: 535, y: 470 },
  ],
};
export const TRAIN_MAPS = ["pillars", "crossings"],
  TEST_MAPS = ["staggered-lanes", "offset-islands"];
const layouts = {
  pillars: [
    { x: 250, y: 160, w: 75, h: 65 },
    { x: 600, y: 380, w: 75, h: 65 },
    { x: 250, y: 380, w: 65, h: 65 },
    { x: 600, y: 160, w: 65, h: 65 },
  ],
  crossings: [
    { x: 220, y: 160, w: 130, h: 45 },
    { x: 570, y: 395, w: 130, h: 45 },
    { x: 220, y: 395, w: 90, h: 45 },
    { x: 610, y: 160, w: 90, h: 45 },
  ],
  "staggered-lanes": [
    { x: 230, y: 120, w: 45, h: 135 },
    { x: 440, y: 365, w: 45, h: 135 },
    { x: 650, y: 120, w: 45, h: 135 },
  ],
  "offset-islands": [
    { x: 230, y: 140, w: 165, h: 65 },
    { x: 525, y: 390, w: 165, h: 65 },
    { x: 650, y: 160, w: 65, h: 95 },
  ],
};
export function generateWorld(family, seed) {
  assert.ok(Object.hasOwn(layouts, family));
  const rejected = [];
  for (let attempt = 0; attempt < 32; attempt++) {
    const n = (stream, index, spread) =>
      Math.round(
        (randomAt(seed, `${attempt}/${stream}`, index) * 2 - 1) * spread,
      );
    const world = {
      id: `${family}-${seed}`,
      family,
      seed,
      attempt,
      player: { x: 460, y: 300 },
      walls: layouts[family].map((w, i) => ({
        ...w,
        x: w.x + n("wall-x", i, 18),
        y: w.y + n("wall-y", i, 18),
      })),
      spawns: ORIGINAL.spawns.map((p, i) => ({
        x: p.x + n("spawn-x", i, 24),
        y: p.y + n("spawn-y", i, 24),
      })),
      waypoints: [
        { x: 140, y: 300 },
        { x: 460, y: 100 },
        { x: 780, y: 300 },
        { x: 460, y: 540 },
      ],
    };
    const validation = validateWorld(world);
    if (validation.valid) return { ...world, validation, rejected };
    rejected.push({ attempt, reasons: validation.errors });
  }
  throw Error(
    `Unable to generate a valid ${family}/${seed}: ${JSON.stringify(rejected)}`,
  );
}
export function trainingSchedule(protocol, seed, arm) {
  assert.ok(["narrow", "diverse"].includes(arm));
  return Array.from({ length: protocol.training_rounds }, (_, round) => {
    if (arm === "narrow")
      return {
        id: `narrow-${round + 1}`,
        phase: "training",
        world: ORIGINAL,
        legacyStyle: "orbit",
      };
    const family =
        TRAIN_FAMILIES[
          (Math.floor(round / 4) + (round % 4)) % TRAIN_FAMILIES.length
        ],
      map = TRAIN_MAPS[Math.floor(round / 4) % TRAIN_MAPS.length];
    return {
      id: `diverse-${round + 1}`,
      phase: "training",
      world: generateWorld(
        map,
        seedFor(seed, "train-map", Math.floor(round / 8)),
      ),
      player: playerConfig(
        family,
        seedFor(seed, "train-player", Math.floor(round / 4)),
        round % 2 ? 1 : -1,
      ),
    };
  });
}
export function testSchedule(protocol, seed, family, map) {
  assert.ok(TEST_FAMILIES.includes(family) && TEST_MAPS.includes(map));
  const world = generateWorld(map, seedFor(seed, "reserved-map", map)),
    botSeed = seedFor(seed, "reserved-player", family);
  return ["repeat", "switch", "return"].flatMap((phase, phaseIndex) =>
    Array.from({ length: protocol.phase_rounds }, (_, round) => ({
      id: `${family}/${map}/${phase}/${round + 1}`,
      phase,
      phaseRound: round + 1,
      world,
      player: playerConfig(family, botSeed, phase === "switch" ? -1 : 1),
      // Same bot identity and counter-based noise throughout the history. The phase changes movement direction only.
      phaseIndex,
    })),
  );
}
export function calibrationCases() {
  return TRAIN_FAMILIES.flatMap((family) =>
    TRAIN_MAPS.flatMap((map) =>
      [4101, 4111].map((seed) => ({
        id: `${family}/${map}/${seed}`,
        phase: "calibration",
        world: generateWorld(map, seedFor(seed, "calibration-map", map)),
        player: playerConfig(
          family,
          seedFor(seed, "calibration-player", family),
        ),
      })),
    ),
  );
}
