import assert from "node:assert/strict";
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { root } from "../evidence-baseline.mjs";
export { root };
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function hashes(paths) {
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        sha(await readFile(resolve(root, path))),
      ]),
    ),
  );
}
export async function checkHashes(record) {
  for (const [path, expected] of Object.entries(record))
    assert.equal(
      sha(await readFile(resolve(root, path))),
      expected,
      `Source changed: ${path}`,
    );
}
export async function readProtocol(id) {
  const path = `docs/experiments/${id}.protocol.json`,
    bytes = await readFile(resolve(root, path));
  return { protocol: JSON.parse(bytes), path, hash: sha(bytes) };
}
export async function outputPrefix(id) {
  const args = process.argv.slice(2);
  assert.ok(
    !args.length || (args.length === 2 && args[0] === "--out"),
    "Use --out <new-prefix>",
  );
  const prefix = resolve(root, args[1] ?? `docs/experiments/${id}`);
  await mkdir(dirname(prefix), { recursive: true });
  for (const suffix of [
    ".results.json",
    ".summary.json",
    ".md",
    ".started.json",
    ".selection.json",
  ]) {
    try {
      await access(prefix + suffix);
      throw Error(`Refusing to overwrite ${prefix + suffix}`);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return prefix;
}
export async function writeNew(path, value) {
  await writeFile(
    path,
    typeof value === "string" ? value : JSON.stringify(value) + "\n",
    { flag: "wx" },
  );
}
export const SOURCE_PATHS = [
  "scripts/evidence-baseline.mjs",
  "docs/experiments/baseline-v1.source.json",
  "docs/experiments/baseline-v1.source.tar.gz",
  "scripts/evaluation-support.mjs",
  ...[
    "random",
    "geometry",
    "players",
    "scenarios",
    "runner",
    "analysis",
    "io",
    "worker",
    "verify",
    "diagnostic",
  ].map((n) => `scripts/synthetic/${n}.mjs`),
  "scripts/evaluate-synthetic.mjs",
  "scripts/diagnose-feints.mjs",
  "scripts/replay-synthetic.mjs",
  "scripts/synthetic/replay-view.html",
  ...[
    "scripts/arena-harness.mjs",
    "scripts/adaptation-trial.mjs",
    "scripts/evaluation-support.mjs",
    "target/arena-test/sim.js",
    "apps/arena/public/wasm/tactical_air.js",
    "apps/arena/public/wasm/tactical_air_bg.wasm",
  ].map((p) => `target/evidence-baseline-v1/${p}`),
];
