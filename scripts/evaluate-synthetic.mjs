import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { verifyBaseline } from "./evidence-baseline.mjs";
import { fixedProfiles, mean } from "./evaluation-support.mjs";
import { createArena, runSequence } from "./synthetic/runner.mjs";
import {
  calibrationCases,
  trainingSchedule,
  testSchedule,
} from "./synthetic/scenarios.mjs";
import {
  summarizePopulation,
  populationReport,
} from "./synthetic/analysis.mjs";
import {
  readProtocol,
  outputPrefix,
  hashes,
  writeNew,
  SOURCE_PATHS,
  checkHashes,
} from "./synthetic/io.mjs";

const {
    protocol: p,
    path,
    hash,
  } = await readProtocol("synthetic-population-v1"),
  prefix = await outputPrefix(p.id),
  sourceHashes = await hashes([...SOURCE_PATHS, path]);
console.error(verifyBaseline());
const startedAt = new Date().toISOString(),
  start = performance.now(),
  cpuStart = process.cpuUsage();
await writeNew(prefix + ".started.json", {
  startedAt,
  protocolSha256: hash,
  sourceHashes,
});
const calibration = [];
for (const profile of fixedProfiles()) {
  const arena = createArena(p.calibration_seed, {
    learning: false,
    actions: profile.actions,
  });
  try {
    const rows = runSequence(arena, calibrationCases());
    calibration.push({
      ...profile,
      rows,
      damage: mean(rows.map((r) => r.damage)),
    });
  } finally {
    arena.policy.dispose();
  }
}
assert.equal(
  calibration.reduce((n, c) => n + c.rows.length, 0),
  p.calibration_encounters,
);
const best = [...calibration].sort(
    (a, b) => b.damage - a.damage || a.id.localeCompare(b.id),
  )[0],
  selectedFixed = { id: best.id, actions: best.actions };
console.error(`Training-only fixed selection: ${best.id}`);
// Persist the selection before executing any reserved performance evaluation.
await writeNew(prefix + ".selection.json", {
  selectedFixed,
  calibration,
  protocolSha256: hash,
});
const trials = Array(p.seeds.length),
  workers = Math.min(4, Math.max(1, availableParallelism() - 1));
let next = 0,
  done = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (next < p.seeds.length) {
      const index = next++,
        seed = p.seeds[index];
      trials[index] = await new Promise((resolve, reject) => {
        const w = new Worker(
          new URL("./synthetic/worker.mjs", import.meta.url),
          { workerData: { protocol: p, seed, selectedFixed } },
        );
        let received = false;
        w.once("message", (value) => {
          received = true;
          resolve(value);
        });
        w.once("error", reject);
        w.once("exit", (code) => {
          if (code || !received) reject(Error(`Worker ${seed} exited ${code}`));
        });
      });
      console.error(
        `Synthetic replicate ${++done}/${p.seeds.length} complete (seed ${seed})`,
      );
    }
  }),
);
await checkHashes(sourceHashes);
const summary = { ...summarizePopulation(p, trials), protocolSha256: hash };
assert.equal(summary.counts.total, p.expected_encounters);
const manifests = p.seeds.map((seed) => ({
  seed,
  training: Object.fromEntries(
    ["narrow", "diverse"].map((arm) => [arm, trainingSchedule(p, seed, arm)]),
  ),
  tests: Object.fromEntries(
    p.test_families.flatMap((f) =>
      p.test_maps.map((m) => [`${f}/${m}`, testSchedule(p, seed, f, m)]),
    ),
  ),
}));
const result = {
  schema: 1,
  protocol: p,
  provenance: {
    startedAt,
    completedAt: new Date().toISOString(),
    sourceHashes,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    workers,
    elapsedSeconds: (performance.now() - start) / 1000,
    cpuMicroseconds: process.cpuUsage(cpuStart),
  },
  manifests,
  calibration,
  selectedFixed,
  trials,
  summary,
};
await writeNew(prefix + ".results.json", result);
await writeNew(
  prefix + ".summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
await writeNew(
  prefix + ".md",
  populationReport(p, summary, selectedFixed).join("\n"),
);
console.log(
  JSON.stringify(
    {
      counts: summary.counts,
      gates: summary.gates,
      disposition: summary.disposition,
      elapsedSeconds: result.provenance.elapsedSeconds,
    },
    null,
    2,
  ),
);
