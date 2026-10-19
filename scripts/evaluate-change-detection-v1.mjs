import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { root, sha, hashes, checkHashes, writeNew, outputPrefix } from './synthetic/io.mjs';
import { ID, SOURCES, protocol, jobs, report } from './change-detection-v1/io.mjs';
import { GROUPS } from './change-detection-v1/design.mjs';
import { analyze } from './change-detection-v1/analysis.mjs';
const p = await protocol(), prefix = await outputPrefix(ID), sourceHashes = await hashes(SOURCES);
const protocolSha256 = sha(await readFile(resolve(root, `docs/experiments/${ID}.protocol.json`)));
const startedAt = new Date().toISOString(), start = performance.now();
await writeNew(prefix + '.started.json', { startedAt, sourceHashes, protocolSha256 });
const audits = (await jobs(GROUPS.flatMap(group => p.seeds.map(seed => ({ mode: 'audit', group, seed, count: p.candidates_per_seed }))),
  (n,t) => { if (n % 8 === 0) console.error(`Admission ${n}/${t}`); })).flat();
await checkHashes(sourceHashes);
await writeNew(prefix + '.audit.json', { sourceHashes, protocolSha256, records: audits });
const selection = GROUPS.flatMap(group => p.seeds.map(seed => ({ group, seed,
  index: audits.find(a => a.fixture.group === group && a.fixture.seed === seed && a.admission.accepted)?.fixture.index ?? null })));
await writeNew(prefix + '.selection.json', { selectedBeforeLearningAt: new Date().toISOString(), selection });
const tables = selection.filter(s => s.index !== null).map(s => audits.find(a => a.fixture.group === s.group && a.fixture.seed === s.seed && a.fixture.index === s.index));
console.error(JSON.stringify({ qualified: Object.fromEntries(GROUPS.map(g => [g, tables.filter(a => a.fixture.group === g).length])) }));
const trials = await jobs(tables.map(table => ({ mode: 'trial', table, protocol: p })), (n,t) => { if (n % 4 === 0) console.error(`Learning ${n}/${t}`); });
await checkHashes(sourceHashes);
const summary = analyze(p, audits, trials);
const result = { schema: 1, protocol: p, provenance: { startedAt, completedAt: new Date().toISOString(), node: process.version,
  elapsedSeconds: (performance.now() - start) / 1000, sourceHashes, protocolSha256, auditSha256: sha(await readFile(prefix + '.audit.json')) }, selection, trials, summary };
await writeNew(prefix + '.results.json', result);
await writeNew(prefix + '.summary.json', JSON.stringify(summary, null, 2) + '\n');
await writeNew(prefix + '.md', report(p, summary));
console.log(JSON.stringify({ budget: summary.budget, groups: Object.fromEntries(Object.entries(summary.groups).map(([g,v])=>[g,{qualified:v.qualified,comparisons:v.comparisons}])) }, null, 2));
