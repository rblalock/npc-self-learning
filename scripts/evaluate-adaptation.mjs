import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TACTICS, POLICY_CONFIG } from './arena-harness.mjs';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createExperimentRunner } from './adaptation-trial.mjs';
import { ROLE_ACTIONS, fixedProfiles, mean, pairedBootstrap, primaryDecision, totalVariation } from './evaluation-support.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const protocolPath = 'docs/experiments/adaptation-v1.protocol.json';
const protocolBytes = await readFile(resolve(root, protocolPath));
const protocol = JSON.parse(protocolBytes);
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--out'), 'Usage: npm run evaluate:adaptation -- --out PATH_PREFIX');
const output = resolve(root, args[1] ?? 'docs/experiments/adaptation-v1');
for (const suffix of ['.results.json', '.summary.json', '.md']) {
  try { await access(output + suffix); throw new Error(`Refusing to overwrite evidence: ${output + suffix}. Choose a new --out prefix.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
assert.equal(protocol.id, 'adaptation-v1');
assert.deepEqual(TACTICS, ROLE_ACTIONS, 'Candidate enumeration must match actual arena tactics');
assert.deepEqual(POLICY_CONFIG, protocol.policy_config, 'Learning configuration must match the written protocol');
assert.equal(new Set(protocol.seeds).size, protocol.seeds.length);
assert.equal(protocol.communication, 'direct');
const styles = [protocol.primary_switch, ...protocol.secondary_switches];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = [protocolPath, 'scripts/evaluate-adaptation.mjs', 'scripts/adaptation-trial.mjs', 'scripts/adaptation-worker.mjs', 'scripts/evaluation-support.mjs', 'scripts/arena-harness.mjs', 'scripts/build-wasm.mjs', 'apps/arena/src/sim.ts', 'target/arena-test/sim.js', 'crates/tactical-air-core/src/lib.rs', 'apps/arena/public/wasm/tactical_air_bg.wasm', 'Cargo.lock', 'package.json', 'package-lock.json'];
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(resolve(root, path)))])));
const runner = createExperimentRunner(protocol);
const { trace, createArena } = runner;

const calibration = fixedProfiles().map(profile => {
  const controllers = protocol.fixed_baseline.calibration_styles.map(style => {
    const arena = createArena(protocol.fixed_baseline.seed, { actions: profile.actions, baseline: true, learning: false });
    try { return { style, rounds: trace(arena, protocol.fixed_baseline.repetitions_per_style, style, true) }; }
    finally { arena.policy.dispose(); }
  });
  return { ...profile, score: mean(controllers.map(c => mean(c.rounds.map(r => r.damage)))), controllers };
}).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const winner = calibration[0];
console.error(`Fixed baseline selected before test runs: ${winner.id}; calibration mean damage ${winner.score.toFixed(2)}`);
const fixed = { id: winner.id, actions: winner.actions, training: [], branches: {} };
const fixedArena = createArena(protocol.fixed_baseline.seed, { actions: winner.actions, baseline: true, learning: false });
try {
  fixed.training = trace(fixedArena, protocol.training_rounds, protocol.training_style, true);
  const snapshot = fixedArena.policy.request({ op: 'snapshot' });
  for (const style of styles) {
    const arena = createArena(protocol.fixed_baseline.seed, { actions: winner.actions, snapshot, baseline: true, learning: false });
    try { fixed.branches[style] = trace(arena, protocol.post_switch_rounds, style, true); }
    finally { arena.policy.dispose(); }
  }
} finally { fixedArena.policy.dispose(); }

const trials = Array(protocol.seeds.length);
let encounters = runner.encounterCount(), nextSeed = 0, completedSeeds = 0;
const workerCount = Math.max(1, Math.min(4, availableParallelism() - 1));
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (nextSeed < protocol.seeds.length) {
    const index = nextSeed++, seed = protocol.seeds[index];
    const result = await new Promise((resolveResult, reject) => {
      const worker = new Worker(new URL('./adaptation-worker.mjs', import.meta.url), { workerData: { protocol, seed } });
      let received = false;
      worker.once('message', message => { received = true; resolveResult(message); });
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0 || !received) reject(new Error(`Seed ${seed} worker exited ${code} without a complete result`)); });
    });
    assert.equal(result.trial.seed, seed);
    trials[index] = result.trial;
    encounters += result.encounters;
    console.error(`Completed seed ${seed} (${++completedSeeds}/${protocol.seeds.length}); ${encounters} actual encounters`);
  }
}));

const slice = (rounds, [first, last]) => rounds.slice(first - 1, last);
const stats = rounds => ({ damage: mean(rounds.map(r => r.damage)), playerClearRate: mean(rounds.map(r => Number(r.result === 'cleared'))), playerDeathRate: mean(rounds.map(r => Number(r.result === 'down'))), durationSeconds: mean(rounds.map(r => r.duration)) });
const comparison = (style, window, condition) => pairedBootstrap(
  trials.map(t => ({ seed: t.seed, value: stats(slice(t.branches[style].online, window)).damage })),
  trials.map(t => ({ seed: t.seed, value: stats(slice(condition === 'selected-fixed' ? fixed.branches[style] : t.branches[style][condition], window)).damage })),
  protocol.uncertainty,
);
function windowSummary(style, window) {
  return {
    rounds: window,
    conditions: Object.fromEntries(protocol.conditions.map(condition => [condition,
      stats(condition === 'selected-fixed' ? slice(fixed.branches[style], window) : trials.flatMap(t => slice(t.branches[style][condition], window)))])),
    onlineMinusFrozen: comparison(style, window, 'trained-frozen'),
    onlineMinusUniform: comparison(style, window, 'uniform'),
    onlineMinusFixed: comparison(style, window, 'selected-fixed'),
  };
}
const bySwitch = Object.fromEntries(styles.map(style => {
  const windowSize = protocol.windows.curve_block_size;
  const finalPolicies = trials.map(t => t.branches[style].online.at(-1).policy);
  const initialPolicies = trials.map(t => t.training.online.at(-1).policy);
  return [style, {
    early: windowSummary(style, protocol.windows.early_switch),
    late: windowSummary(style, protocol.windows.late_switch),
    curve: Array.from({ length: protocol.post_switch_rounds / windowSize }, (_, i) => windowSummary(style, [i * windowSize + 1, (i + 1) * windowSize])),
    immediateDamageChange: mean(trials.map(t => stats(slice(t.branches[style].online, protocol.windows.early_switch)).damage - stats(slice(t.training.online, protocol.windows.late_training)).damage)),
    policyShift: {
      meanRoleTotalVariation: mean(finalPolicies.map((cells, i) => totalVariation(initialPolicies[i], cells))),
      probabilities: initialPolicies[0].map((cell, index) => ({ role: cell.role, action: cell.action, before: mean(initialPolicies.map(c => c[index].probability)), after: mean(finalPolicies.map(c => c[index].probability)) })),
    },
  }];
}));
const summary = {
  schema: 1, protocolId: protocol.id, protocolSha256: sha(protocolBytes), actualEncounters: encounters,
  policySeeds: trials.length, fixedBaseline: { id: fixed.id, actions: fixed.actions, calibrationScore: winner.score },
  calibration: calibration.map(({ id, score, controllers }) => ({ id, score, controllerDamage: Object.fromEntries(controllers.map(c => [c.style, mean(c.rounds.map(r => r.damage))])) })),
  primaryDisposition: primaryDecision(bySwitch[protocol.primary_switch].late.onlineMinusFrozen, protocol.primary_signal_rule),
  bySwitch,
};
// All conditions share the existing deterministic world. Fixed repeats are
// retained once, not multiplied into the reported count of independent seeds.
const provenance = { generatedAt: new Date().toISOString(), sourceHashes, runtime: { node: process.version, platform: process.platform, arch: process.arch, workerCount }, fixedTraceNote: 'One deterministic fixed trace per controller is reused as a paired reference; it is not 32 independent fixed-world trials. Raw inspect probabilities are over all configured actions; fixed decisions use singleton legal masks recorded in actions.' };
const results = { schema: 1, protocol, provenance, summary, calibration, fixed, trials };
const number = n => n.toFixed(2), ci = x => `${number(x.meanDifference)} [${number(x.interval[0])}, ${number(x.interval[1])}]`;
const primary = bySwitch[protocol.primary_switch].late;
const lines = [
  '# Adaptation benchmark — v1', '',
  `Protocol: [adaptation-v1.protocol.json](adaptation-v1.protocol.json). [Raw results](${basename(output)}.results.json) · [Summary](${basename(output)}.summary.json).`, '',
  `**Primary disposition: ${summary.primaryDisposition}.** Continued learning minus the identical trained policy held frozen, after switching from clockwise to counterclockwise movement: **${ci(primary.onlineMinusFrozen)} HP** (paired seed-bootstrap 95% interval; post-switch rounds 17–24).`, '',
  'The predeclared criterion requires a mean gain of at least 6 HP and a lower interval bound above zero. It measures enemy effectiveness in this fixture, not player enjoyment.', '',
  `Executed ${encounters} actual encounters, including ${calibration.length * protocol.fixed_baseline.calibration_styles.length} fixed-profile selection encounters. ${trials.length} independent policy seeds; one map and deterministic player controllers. Training lasts ${protocol.training_rounds} rounds; each independent switch branch lasts ${protocol.post_switch_rounds}. Fixed traces are executed once per controller and reused, not counted as independent seed replicates.`, '',
  `Selected fixed profile: **${fixed.id}**. It stays unchanged across all comparisons. The selection suite is orbit, reverse and cover; all eight candidates and their outcomes are retained. This is a strong enumerated static baseline, not the best possible authored AI.`, '',
  '## Fixed-profile selection', '', '| Profile | Clockwise | Counterclockwise | Cover | Mean damage |', '| --- | ---: | ---: | ---: | ---: |',
  ...summary.calibration.map(c => `| ${c.id} | ${number(c.controllerDamage.orbit)} | ${number(c.controllerDamage.reverse)} | ${number(c.controllerDamage.cover)} | ${number(c.score)} |`), '',
  '## After the player changes movement', '',
  'Higher damage means stronger enemies. Differences below use per-seed late-window means; individual rounds are not independent statistical replicates. Reverse is the primary comparison. Feint and cover are secondary, with unadjusted exploratory intervals.', '',
  '| Switch | Online | Frozen trained | Selected fixed | Random | Online − frozen, 95% interval | Online − fixed, 95% interval |',
  '| --- | ---: | ---: | ---: | ---: | --- | --- |',
  ...styles.map(style => { const w = bySwitch[style].late; return `| ${style} | ${number(w.conditions.online.damage)} | ${number(w.conditions['trained-frozen'].damage)} | ${number(w.conditions['selected-fixed'].damage)} | ${number(w.conditions.uniform.damage)} | ${ci(w.onlineMinusFrozen)} | ${ci(w.onlineMinusFixed)} |`; }), '',
];
for (const style of styles) {
  lines.push(`## Adaptation curve: ${style}`, '', '| Post-switch rounds | Online | Frozen trained | Selected fixed | Random |', '| --- | ---: | ---: | ---: | ---: |',
    ...bySwitch[style].curve.map(w => `| ${w.rounds.join('–')} | ${number(w.conditions.online.damage)} | ${number(w.conditions['trained-frozen'].damage)} | ${number(w.conditions['selected-fixed'].damage)} | ${number(w.conditions.uniform.damage)} |`), '',
    `Immediate damage change versus late training: ${number(bySwitch[style].immediateDamageChange)} HP. Mean per-role probability total variation after 24 rounds: ${number(bySwitch[style].policyShift.meanRoleTotalVariation * 100)}%. Probability movement is a behavioral measurement, not evidence of improved effectiveness by itself.`, '');
}
lines.push('## Reproduce and interpret', '', '```sh', 'npm ci', 'npm run build:wasm', 'npm run evaluate:adaptation -- --out docs/experiments/adaptation-v1-replication', '```', '',
  'The runner refuses to overwrite evidence. Compare raw traces and summaries while ignoring the generation timestamp. It records protocol, simulator, compiled simulator, Wasm, Rust core, harness, evaluation logic and dependency-lock hashes. Every frozen round is checked for exact score/sample/probability preservation; trained branches are checked for identical starting checkpoints and first combat outcomes.', '',
  'The strongest causal comparison here is online versus trained-frozen, branched from the same checkpoint and random state. Uniform and fixed policies answer separate baseline questions. All branches use direct observation; the result does not measure scout delivery, human counterplay, new maps, or other games.', '',
  'The 95% intervals cover only tactic-sampling variation for these controllers. The fixed world has no independently randomized spawns or map variation. The baseline was selected before this run, but the fixtures were already known; this is a locally specified engineering experiment, not a public preregistered study. A loss to the fixed policy or an unmet primary criterion remains part of the result.', '');
await mkdir(dirname(output), { recursive: true });
await writeFile(output + '.results.json', JSON.stringify(results) + '\n', { flag: 'wx' });
await writeFile(output + '.summary.json', JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
await writeFile(output + '.md', lines.join('\n'), { flag: 'wx' });
console.log(JSON.stringify({ disposition: summary.primaryDisposition, encounters, baseline: fixed.id, primary: { meanDifference: primary.onlineMinusFrozen.meanDifference, interval: primary.onlineMinusFrozen.interval }, report: output + '.md' }, null, 2));
