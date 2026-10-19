import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makePolicy, TACTICS, baselineRoot } from "../evidence-baseline.mjs";
import { fixedProfiles, mean } from "../evaluation-support.mjs";
import { root, sha, checkHashes, readProtocol, writeNew } from "./io.mjs";
import {
  trainingSchedule,
  testSchedule,
  calibrationCases,
} from "./scenarios.mjs";
import { createArena, runSequence, runPopulationSeed } from "./runner.mjs";
import { summarizePopulation } from "./analysis.mjs";
import { diagnosticWorlds, diagnosticMatrix, diagnose } from "./diagnostic.mjs";

/** Independent core replay: reconstruct legal choices and feedback from physical evidence. */
export function verifyTrace(
  seed,
  rows,
  { snapshot, actions, learning, schedule } = {},
) {
  if (schedule) assert.equal(rows.length, schedule.length);
  const policy = makePolicy(seed);
  if (snapshot) policy.request({ op: "restore", snapshot });
  const frozen = policy.request({ op: "inspect" }).cells;
  try {
    for (const [index, row] of rows.entries()) {
      if (schedule) {
        const s = schedule[index];
        assert.equal(row.scenario, s.id);
        assert.equal(row.phase, s.phase);
        assert.equal(row.phaseRound, s.phaseRound ?? null);
        assert.equal(row.control, s.player ? "synthetic" : "demo");
        assert.equal(row.style, s.legacyStyle ?? null);
      }
      assert.equal(row.learning, learning);
      assert.equal(row.communication, "direct");
      assert.equal(row.damage + row.health, 100);
      assert.ok(
        Number.isInteger(row.steps) && row.steps > 0 && row.steps <= 1561,
      );
      assert.ok(Math.abs(row.duration - row.steps / 60) < 1e-8);
      if (row.control === "synthetic") {
        assert.match(row.inputSha256, /^[0-9a-f]{64}$/);
        assert.ok(
          row.inputs.distance >= 0 && Number.isFinite(row.inputs.distance),
        );
      }
      assert.ok(row.duration > 0 && row.duration < 27);
      assert.equal(row.enemies.length, 3);
      assert.equal(row.choices.length, 3);
      assert.equal(
        Math.min(
          100,
          row.enemies.reduce((s, e) => s + e.damage, 0),
        ),
        row.damage,
      );
      const before = policy.request({ op: "inspect" }).cells;
      const choices = Object.entries(TACTICS).map(([role, allowed]) => ({
        role,
        ...policy.request({
          op: "choose",
          role,
          context: "arena",
          allowed: actions ? [actions[role]] : allowed,
          baseline: !!actions,
        }),
      }));
      assert.deepEqual(choices, row.choices);
      row.enemies.forEach((e, i) => {
        assert.equal(e.role, choices[i].role);
        const reward = Math.max(
            -1,
            Math.min(1, e.damage / 32 - 0.22 - (e.hp <= 0 ? 0.18 : 0)),
          ),
          observed = e.sightings > 0;
        const response = policy.request({
          op: "feedback",
          decision_id: choices[i].decision_id,
          reward,
          observed: observed && learning,
        });
        const recap = row.recap[i];
        assert.equal(recap.role, e.role);
        assert.equal(recap.tactic, choices[i].action);
        assert.equal(recap.reward, reward);
        assert.equal(recap.observed, observed);
        assert.equal(recap.accepted, response.accepted);
        assert.equal(recap.damage, e.damage);
        assert.equal(
          recap.before,
          before.find(
            (c) => c.role === e.role && c.action === choices[i].action,
          ).probability,
        );
        assert.deepEqual(row.rewards[i], {
          role: e.role,
          tactic: choices[i].action,
          reward,
          observed,
        });
      });
      const after = policy.request({ op: "commit" });
      assert.equal(row.encounter, after.encounter);
      assert.deepEqual(row.policy, after.cells);
      for (const recap of row.recap)
        assert.equal(
          recap.after,
          after.cells.find(
            (c) => c.role === recap.role && c.action === recap.tactic,
          ).probability,
        );
      if (!learning) assert.deepEqual(after.cells, frozen);
    }
    return policy.request({ op: "snapshot" });
  } finally {
    policy.dispose();
  }
}
export async function verifyPopulation(path, { full = false } = {}) {
  const result = JSON.parse(await readFile(path)),
    { protocol: p, summary } = result,
    { protocol, hash } = await readProtocol("synthetic-population-v1");
  assert.deepEqual(p, protocol);
  assert.equal(hash, summary.protocolSha256);
  await checkHashes(result.provenance.sourceHashes);
  assert.deepEqual(
    result.calibration.map((c) => ({ id: c.id, actions: c.actions })),
    fixedProfiles(),
  );
  let policyCount = 0,
    combatCount = 0;
  for (const c of result.calibration) {
    verifyTrace(p.calibration_seed, c.rows, {
      actions: c.actions,
      learning: false,
      schedule: calibrationCases(),
    });
    policyCount += c.rows.length;
    const arena = createArena(p.calibration_seed, {
      actions: c.actions,
      learning: false,
    });
    try {
      assert.deepEqual(runSequence(arena, calibrationCases()), c.rows);
      combatCount += c.rows.length;
    } finally {
      arena.policy.dispose();
    }
    assert.equal(c.damage, mean(c.rows.map((r) => r.damage)));
  }
  const best = [...result.calibration].sort(
    (a, b) => b.damage - a.damage || a.id.localeCompare(b.id),
  )[0];
  assert.deepEqual(result.selectedFixed, {
    id: best.id,
    actions: best.actions,
  });
  const selection = JSON.parse(
    await readFile(path.replace(/\.results\.json$/, ".selection.json")),
  );
  assert.deepEqual(selection, {
    selectedFixed: result.selectedFixed,
    calibration: result.calibration,
    protocolSha256: hash,
  });
  assert.deepEqual(
    result.manifests.map((m) => m.seed),
    p.seeds,
  );
  for (const t of result.trials) {
    const manifest = result.manifests.find((m) => m.seed === t.seed);
    assert.ok(manifest);
    for (const arm of ["narrow", "diverse"]) {
      assert.deepEqual(
        manifest.training[arm],
        trainingSchedule(p, t.seed, arm),
      );
      assert.deepEqual(
        verifyTrace(t.seed, t.training[arm], {
          learning: true,
          schedule: manifest.training[arm],
        }),
        t.snapshots[arm],
      );
      policyCount += t.training[arm].length;
    }
    for (const family of p.test_families)
      for (const map of p.test_maps) {
        const id = `${family}/${map}`;
        assert.deepEqual(
          manifest.tests[id],
          testSchedule(p, t.seed, family, map),
        );
        for (const arm of ["narrow", "diverse"])
          for (const mode of ["online", "frozen"]) {
            const rows = t.branches[id][`${arm}-${mode}`];
            verifyTrace(t.seed, rows, {
              learning: mode === "online",
              snapshot: t.snapshots[arm],
              schedule: manifest.tests[id],
            });
            policyCount += rows.length;
          }
        verifyTrace(t.seed, t.branches[id].fixed, {
          actions: result.selectedFixed.actions,
          learning: false,
          schedule: manifest.tests[id],
        });
        policyCount += t.branches[id].fixed.length;
      }
    if (full || t.seed === p.seeds[0]) {
      assert.deepEqual(runPopulationSeed(p, t.seed, result.selectedFixed), t);
      combatCount +=
        2 * p.training_rounds +
        p.test_families.length * p.test_maps.length * 5 * 3 * p.phase_rounds;
      console.error(`Complete combat replay matched seed ${t.seed}`);
    }
  }
  assert.equal(policyCount, p.expected_encounters);
  assert.deepEqual(
    { ...summarizePopulation(p, result.trials), protocolSha256: hash },
    summary,
  );
  assert.deepEqual(
    summary,
    JSON.parse(
      await readFile(path.replace(/\.results\.json$/, ".summary.json")),
    ),
  );
  return {
    verifiedEncounters: policyCount,
    replayedDecisions: policyCount * 3,
    fullCombatReplays: combatCount,
    full,
    disposition: summary.disposition,
    resultsSha256: sha(await readFile(path)),
  };
}
export async function verifyDiagnostic(path) {
  const result = JSON.parse(await readFile(path)),
    { protocol: p } = result,
    { protocol, hash } = await readProtocol("feint-interactions-v1");
  assert.deepEqual(p, protocol);
  await checkHashes(result.provenance.sourceHashes);
  const scenarios = JSON.parse(
    await readFile(
      resolve(root, "docs/experiments/scenario-transfer-v1.protocol.json"),
    ),
  );
  assert.deepEqual(result.worlds, diagnosticWorlds(scenarios));
  const matrix = diagnosticMatrix(p, result.worlds);
  assert.deepEqual(matrix, result.matrix);
  const reference = JSON.parse(
    await readFile(resolve(baselineRoot, p.reference)),
  );
  assert.deepEqual(
    { ...diagnose(p, matrix, reference), protocolSha256: hash },
    result.summary,
  );
  assert.deepEqual(
    result.summary,
    JSON.parse(
      await readFile(path.replace(/\.results\.json$/, ".summary.json")),
    ),
  );
  return {
    fullCombatReplays: matrix.length,
    resultsSha256: sha(await readFile(path)),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, ...args] = process.argv.slice(2);
  assert.ok(["population", "diagnostic"].includes(kind));
  assert.ok(args.filter((a) => a !== "--full").length <= 1);
  const path = resolve(
    root,
    args.find((a) => a !== "--full") ??
      `docs/experiments/${kind === "population" ? "synthetic-population-v1" : "feint-interactions-v1"}.results.json`,
  );
  const verification =
    kind === "population"
      ? await verifyPopulation(path, { full: args.includes("--full") })
      : await verifyDiagnostic(path);
  const verificationPath = path.replace(
    /\.results\.json$/,
    `.verification${args.includes("--full") ? "-full" : ""}.json`,
  );
  try {
    await writeNew(verificationPath, {
      verifiedAt: new Date().toISOString(),
      ...verification,
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const { verifiedAt, ...previous } = JSON.parse(
      await readFile(verificationPath),
    );
    assert.deepEqual(previous, verification);
  }
  console.log(JSON.stringify(verification, null, 2));
}
