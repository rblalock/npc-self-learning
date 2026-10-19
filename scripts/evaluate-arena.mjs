import { Arena, makePolicy, runSeries } from './arena-harness.mjs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const results = [];
for (const seed of [3, 17, 42, 101, 2026]) {
  for (const baseline of [true, false]) {
    const policy = makePolicy(seed), arena = new Arena(policy);
    arena.baseline = baseline;
    const before = runSeries(arena, 5, 'orbit');
    runSeries(arena, 35, 'orbit');
    const trained = runSeries(arena, 10, 'orbit');
    const switched = runSeries(arena, 10, 'reverse');
    const average = rows => +(rows.reduce((s, x) => s + x.damage, 0) / rows.length).toFixed(2);
    results.push({ seed, baseline, firstDamage: average(before), trainedDamage: average(trained), switchedDamage: average(switched), policy: arena.inspect().cells.map(({action,score,samples,probability})=>({action,score,samples,probability})) });
    policy.dispose();
  }
}
const hash = async path => createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
const protocol = {
  seeds: [3, 17, 42, 101, 2026], rounds_per_run: 60,
  modes: ['uniform baseline without learning', 'adaptive with online boundary updates'],
  sequence: [{style:'orbit',rounds:5,report:'firstDamage'},{style:'orbit',rounds:35,report:'training only'},{style:'orbit',rounds:10,report:'trainedDamage'},{style:'reverse',rounds:10,report:'switchedDamage'}],
  total_encounters: 600, evaluation_continues_learning: true, duration_limit_seconds: 26,
  sim_source_sha256: await hash('../apps/arena/src/sim.ts'),
  wasm_sha256: await hash('../apps/arena/public/wasm/tactical_air_bg.wasm'),
};
const aggregate = Object.fromEntries([['baseline',true],['adaptive',false]].map(([label,baseline])=>[
  label, Object.fromEntries(['firstDamage','trainedDamage','switchedDamage'].map(key=>[
    key, +(results.filter(r=>r.baseline===baseline).reduce((sum,r)=>sum+r[key],0)/5).toFixed(2),
  ])),
]));
console.log(JSON.stringify({ note: 'Same arena simulator and compiled Rust/Wasm policy as the browser. Higher damage means more effective enemies; these are scripted controllers, not human playtests.', results, protocol, aggregate }, null, 2));
