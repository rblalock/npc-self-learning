import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sha } from './design.mjs';

export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export const PROTOCOL='docs/experiments/agentic-npc-pilot-v1.protocol.json';
export const SOURCES=[PROTOCOL,'apps/arena/src/sim.ts','target/agentic-sim/sim.js',
  'scripts/evidence-baseline.mjs','docs/experiments/baseline-v1.source.json','docs/experiments/baseline-v1.source.tar.gz',
  'target/evidence-baseline-v1/apps/arena/public/wasm/tactical_air.js',
  'target/evidence-baseline-v1/apps/arena/public/wasm/tactical_air_bg.wasm',
  'target/evidence-baseline-v1/scripts/arena-harness.mjs','target/evidence-baseline-v1/target/arena-test/sim.js',
  'scripts/research/policy.mjs','scripts/research/players.mjs','scripts/research/combat.mjs',
  'scripts/opportunity-v2/fixtures.mjs','scripts/evaluation-support.mjs',
  ...['random','players','geometry','scenarios'].map(n=>`scripts/synthetic/${n}.mjs`),
  ...['design','trial','combat','provider','io'].map(n=>`scripts/agentic-v1/${n}.mjs`),
  'scripts/evaluate-agentic-v1.mjs','scripts/verify-agentic-v1.mjs'];
export async function sourceHashes() {
  const entries=await Promise.all(SOURCES.map(async p=>[p,sha(await readFile(resolve(ROOT,p)))]));
  return Object.fromEntries(entries);
}
export async function checkSources(expected) {
  assert.deepEqual(await sourceHashes(),expected,'Experiment source differs from frozen source manifest');
}
export async function atomicJson(path,value) {
  const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(value)+'\n');await rename(tmp,path);
}
