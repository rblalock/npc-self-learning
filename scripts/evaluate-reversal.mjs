import { Arena, makePolicy, runSeries } from './arena-harness.mjs';

const results = [];
for (const seed of [3, 42, 101]) {
  const policy = makePolicy(seed), arena = new Arena(policy);
  try {
    runSeries(arena, 40, 'orbit');
    const clockwisePolicy = arena.inspect();
    const reversalOutcomes = runSeries(arena, 10, 'reverse');
    results.push({ seed, clockwisePolicy, reversedPolicy: arena.inspect(), reversalOutcomes });
  } finally { policy.dispose(); }
}
console.log(JSON.stringify({ protocol: '40 clockwise encounters, then 10 counterclockwise encounters, continuous adaptive learning with the actual Arena and Rust/Wasm; exploratory controller fixture, no tactic/style lookup', results }, null, 2));
