import assert from "node:assert/strict";
import { readFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { root, sha, checkHashes, writeNew } from "./synthetic/io.mjs";
import { createArena, runEncounter } from "./synthetic/runner.mjs";

const args = process.argv.slice(2),
  options = {};
assert.equal(
  args.length % 2,
  0,
  "Use --results PATH --seed N --case FAMILY/MAP --round N --out PREFIX",
);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(
    ["--results", "--seed", "--case", "--round", "--out"].includes(args[i]),
  );
  options[args[i].slice(2)] = args[i + 1];
}
const path = resolve(
    root,
    options.results ?? "docs/experiments/synthetic-population-v1.results.json",
  ),
  bytes = await readFile(path),
  result = JSON.parse(bytes),
  defaults = result.protocol.demonstration;
await checkHashes(result.provenance.sourceHashes);
const seed = Number(options.seed ?? defaults.seed),
  caseId = options.case ?? defaults.case,
  round = Number(options.round ?? defaults.round),
  trial = result.trials.find((t) => t.seed === seed),
  manifest = result.manifests.find((m) => m.seed === seed);
assert.ok(trial && manifest && trial.branches[caseId]);
assert.ok(
  Number.isInteger(round) &&
    round > 0 &&
    round <= 3 * result.protocol.phase_rounds,
);
const prefix = resolve(
  root,
  options.out ?? "docs/experiments/synthetic-population-v1-replay",
);
await mkdir(dirname(prefix), { recursive: true });
for (const suffix of [".html", ".json"]) {
  try {
    await access(prefix + suffix);
    throw Error(`Refusing to overwrite ${prefix + suffix}`);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const schedule = manifest.tests[caseId],
  recordings = {};
let combatReplays = 0;
for (const condition of Object.keys(trial.branches[caseId])) {
  const [arm, mode] = condition.split("-"),
    arena = createArena(
      seed,
      condition === "fixed"
        ? { learning: false, actions: result.selectedFixed.actions }
        : { snapshot: trial.snapshots[arm], learning: mode === "online" },
    );
  try {
    for (let i = 0; i < round; i++) {
      const value = runEncounter(arena, schedule[i], {
          capture: i === round - 1,
        }),
        row = i === round - 1 ? value.row : value;
      assert.deepEqual(row, trial.branches[caseId][condition][i]);
      combatReplays++;
      if (i === round - 1) recordings[condition] = value;
    }
  } finally {
    arena.policy.dispose();
  }
}
const payload = {
  schema: 1,
  experiment: result.protocol.id,
  resultsSha256: sha(bytes),
  seed,
  case: caseId,
  round,
  scenario: schedule[round - 1],
  recordings,
  combatReplays,
  selection:
    seed === defaults.seed &&
    caseId === defaults.case &&
    round === defaults.round
      ? defaults.selection
      : "User-selected encounter; not a representative aggregate.",
};
await writeNew(prefix + ".json", payload);
const template = await readFile(
  resolve(root, "scripts/synthetic/replay-view.html"),
  "utf8",
);
await writeNew(
  prefix + ".html",
  template.replace(
    "__PAYLOAD__",
    JSON.stringify(payload).replaceAll("<", "\\u003c"),
  ),
);
console.log(
  JSON.stringify(
    {
      html: prefix + ".html",
      json: prefix + ".json",
      combatReplays,
      selection: payload.selection,
    },
    null,
    2,
  ),
);
