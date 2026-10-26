import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, SOURCES as BASE, atomicJson } from '../agentic-v3/io.mjs';
import { sha } from '../agentic-v2/design.mjs';
export { ROOT, atomicJson };
export const PROTOCOL = 'docs/experiments/agentic-npc-matched-v4.protocol.json';
export const SOURCES = [...new Set([...BASE, PROTOCOL,
  ...['design', 'trial', 'io', 'provider-audit'].map(n => `scripts/agentic-v4/${n}.mjs`),
  'scripts/evaluate-agentic-v4.mjs', 'scripts/verify-agentic-v4.mjs',
  'scripts/replay-agentic-v4.mjs', 'scripts/agentic-v4/view.html', 'scripts/analyze-agentic-v4.py',
])];
export async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCES.map(async p => [p, sha(await readFile(resolve(ROOT, p)))])));
}
export async function checkSources(expected) {
  assert.deepEqual(await sourceHashes(), expected, 'Experiment source differs from frozen source manifest');
}
