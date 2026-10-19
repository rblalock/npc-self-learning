import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { root } from '../synthetic/io.mjs';
import { RESEARCH_SOURCES } from '../research/io.mjs';
export const ID = 'change-detection-v1';
export const SOURCES = [...RESEARCH_SOURCES, 'scripts/opportunity-v2/fixtures.mjs', 'scripts/opportunity-v2/metrics.mjs',
  ...['detector','design','trial','analysis','verify','io','worker'].map(n => `scripts/${ID}/${n}.mjs`),
  `scripts/${ID}.test.mjs`, `scripts/evaluate-${ID}.mjs`, `scripts/verify-${ID}.mjs`,
  `docs/experiments/${ID}.protocol.json`];
export const protocol = async () => JSON.parse(await readFile(resolve(root, `docs/experiments/${ID}.protocol.json`)));
export async function jobs(input, onDone = () => {}) {
  const results = Array(input.length); let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(4, input.length) }, async () => {
    while (next < input.length) {
      const i = next++;
      results[i] = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: input[i] });
        let received = false;
        worker.once('message', value => { received = true; resolve(value); }); worker.once('error', reject);
        worker.once('exit', code => { if (code || !received) reject(Error(`Worker ${i}: ${code}`)); });
      });
      onDone(++done, input.length);
    }
  }));
  return results;
}
export function report(p, s) {
  const rows = Object.entries(s.groups).flatMap(([g, v]) => Object.entries(v.comparisons).map(([a, c]) =>
    `| ${g} | ${a} | ${v.qualified} | ${c.primary ? `${c.primary.meanDifference.toFixed(2)} [${c.primary.interval.map(x=>x.toFixed(2)).join(', ')}]` : 'Unavailable'} | ${c.falseAlarmsPer100?.toFixed(2) ?? 'N/A'} | ${c.pass ? 'Pass' : 'Do not advance'} |`));
  return `# Automatic change detection and forgetting\n\n${p.question}\n\n${s.budget.total} scored executions: ${s.budget.auditEncounters} admission fights and ${s.budget.learningEncounters} training/comparison fights.\n\n| Role | Intervention | Seeds | Change-history gain, HP [99.583% interval] | False alarms / 100 stable fights | Gate |\n|---|---|---:|---:|---:|---|\n${rows.join('\n')}\n\n${p.primary}\n\n${p.scope}\n\nThe full summary retains all per-case histories, alarms, detection misses, censored recovery, cumulative regret and uncertainty. The reserved run is not tuning data for this version.\n`;
}
