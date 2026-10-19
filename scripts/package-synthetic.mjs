import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  copyFile,
  readdir,
  access,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { root, sha, checkHashes, writeNew } from "./synthetic/io.mjs";

const archive = resolve(
  root,
  "target/releases/tactical-air-synthetic-lab-v1.tar.gz",
);
try {
  await access(archive);
  throw Error(`Refusing to overwrite ${archive}`);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const results = await Promise.all(
  ["synthetic-population-v1", "feint-interactions-v1"].map(async (id) =>
    JSON.parse(
      await readFile(resolve(root, `docs/experiments/${id}.results.json`)),
    ),
  ),
);
for (const r of results) await checkHashes(r.provenance.sourceHashes);
await mkdir(resolve(root, "target/releases"), { recursive: true });
const staging = await mkdtemp(resolve(root, "target/synthetic-lab-package-"));
const paths = new Set(
  results
    .flatMap((r) => Object.keys(r.provenance.sourceHashes))
    .filter((path) => !path.startsWith("target/")),
);
for (const path of [
  "LICENSE",
  "scripts/synthetic.test.mjs",
  "scripts/replay-synthetic-view.mjs",
  "scripts/synthetic-replay-view.html",
  "scripts/package-synthetic.mjs",
  "docs/synthetic-lab.md",
  "docs/verification-synthetic-v1.md",
])
  paths.add(path);
for (const name of await readdir(resolve(root, "docs/experiments")))
  if (
    name.startsWith("synthetic-population-v1") ||
    name.startsWith("feint-interactions-v1")
  )
    paths.add(`docs/experiments/${name}`);
const checksums = {};
for (const path of [...paths].sort()) {
  const destination = resolve(staging, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, path), destination);
  // The standalone guide links only to evidence included in this smaller kit.
  if (path === "docs/synthetic-lab.md") {
    const guide = await readFile(destination, "utf8");
    await writeFile(destination, guide.replace(", and [research status](research-status.md)", ""));
  }
  checksums[path] = sha(await readFile(destination));
}
const pkg = {
  name: "tactical-air-synthetic-lab",
  version: "0.1.0",
  private: true,
  type: "module",
  engines: { node: ">=24" },
  scripts: {
    "test:synthetic": "node --test scripts/synthetic.test.mjs",
    "evaluate:synthetic": "node scripts/evaluate-synthetic.mjs",
    "diagnose:feints": "node scripts/diagnose-feints.mjs",
    "verify:synthetic": "node scripts/synthetic/verify.mjs population",
    "verify:feints": "node scripts/synthetic/verify.mjs diagnostic",
    "replay:synthetic": "node scripts/replay-synthetic-view.mjs",
  },
};
await writeFile(
  resolve(staging, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n",
);
await writeFile(
  resolve(staging, "README.md"),
  "# Tactical Air synthetic lab v1\n\nMIT-licensed headless research kit. Requires Node.js 24; no npm install, API key or Rust rebuild. The included immutable baseline archive supplies the actual combat and Rust/Wasm learner.\n\nRead [the lab guide](docs/synthetic-lab.md). Open `docs/experiments/synthetic-population-v1-view.html` for the recorded comparison.\n\n```sh\nnpm run test:synthetic\nnpm run verify:synthetic -- --full\nnpm run verify:feints\nnpm run evaluate:synthetic -- --out target/my-replication\nnpm run replay:synthetic -- --out target/my-replay\n```\n\nResults include unfavorable outcomes and source hashes. New runs refuse to overwrite old evidence. This package does not install a game-engine adapter or claim human-play effectiveness. The shipped game policy remains unchanged.\n",
);
for (const path of ["package.json", "README.md"])
  checksums[path] = sha(await readFile(resolve(staging, path)));
await writeFile(
  resolve(staging, "SHA256SUMS"),
  Object.entries(checksums)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, hash]) => `${hash}  ${path}\n`)
    .join(""),
);
execFileSync("tar", ["-czf", archive, "-C", staging, "."], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
const bytes = await readFile(archive),
  manifest = {
    artifact: "target/releases/tactical-air-synthetic-lab-v1.tar.gz",
    sha256: sha(bytes),
    bytes: bytes.length,
    files: paths.size + 3,
    measuredEncounters: 10016,
  };
assert.ok(bytes.length > 0);
await writeNew(
  resolve(root, "docs/releases/synthetic-lab-v1.package.json"),
  manifest,
);
console.log(JSON.stringify({ ...manifest, staging }, null, 2));
