import assert from 'node:assert/strict';
import { readFile, access, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const baselineRoot = resolve(root, 'target/evidence-baseline-v1');
const manifest = JSON.parse(await readFile(resolve(root, 'docs/experiments/baseline-v1.source.json'), 'utf8'));
assert.equal(createHash('sha256').update(await readFile(resolve(root, manifest.archive))).digest('hex'), manifest.sha256);
try { await access(resolve(baselineRoot, 'package.json')); }
catch {
  await mkdir(baselineRoot, { recursive: true });
  execFileSync('tar', ['-xzf', resolve(root, manifest.archive), '-C', baselineRoot]);
}
// Each caller still validates recorded source hashes before using archived data.
const harness = await import(pathToFileURL(resolve(baselineRoot, 'scripts/arena-harness.mjs')));
export const { Arena, TACTICS, POLICY_CONFIG, makePolicy } = harness;
export const { WALLS, WIDTH, HEIGHT } = await import(pathToFileURL(resolve(baselineRoot, 'target/arena-test/sim.js')));
export const { createExperimentRunner } = await import(pathToFileURL(resolve(baselineRoot, 'scripts/adaptation-trial.mjs')));
export function verifyBaseline() {
  return execFileSync(process.execPath, [resolve(baselineRoot, 'scripts/verify-rewards.mjs')], { cwd: baselineRoot, encoding: 'utf8' });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(verifyBaseline());
