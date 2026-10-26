import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT,SOURCES as BASE,atomicJson } from '../agentic-v2/io.mjs';
import { sha } from './design.mjs';
export { ROOT,atomicJson };
export const PROTOCOL='docs/experiments/agentic-npc-switching-v3.protocol.json';
export const SOURCES=[...new Set([...BASE,PROTOCOL,'docs/experiments/agentic-npc-ablation-v2.summary.json',...['design','trial','io','live-guard'].map(n=>`scripts/agentic-v3/${n}.mjs`),'scripts/evaluate-agentic-v3.mjs','scripts/verify-agentic-v3.mjs'])];
export async function sourceHashes(){return Object.fromEntries(await Promise.all(SOURCES.map(async p=>[p,sha(await readFile(resolve(ROOT,p)))])));}
export async function checkSources(expected){assert.deepEqual(await sourceHashes(),expected,'Experiment source differs from frozen source manifest');}
