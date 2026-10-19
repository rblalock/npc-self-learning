import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { execFileSync } from 'node:child_process';
import { POLICY_CONFIG } from './arena-harness.mjs';
import { createExperimentRunner } from './adaptation-trial.mjs';
import { summarizeRewards } from './reward-analysis.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--out'), 'Usage: node scripts/evaluate-rewards.mjs [--out PATH_PREFIX]');
const output = resolve(root, args[1] ?? 'docs/experiments/reward-attribution-v1');
for (const suffix of ['.results.json', '.summary.json', '.md']) {
  try { await access(output + suffix); throw new Error(`Refusing to overwrite evidence: ${output + suffix}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const protocolPath = 'docs/experiments/reward-attribution-v1.protocol.json';
const protocolBytes = await readFile(resolve(root, protocolPath));
const protocol = JSON.parse(protocolBytes);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(protocol.policy_config, POLICY_CONFIG);
assert.equal(protocol.id, 'reward-attribution-v1');
assert.deepEqual([protocol.reward.team_weight, protocol.reward.team_size, protocol.reward.damage_scale, protocol.reward.cost, protocol.reward.defeat_cost], [.5, 3, 32, .22, .18]);
const referenceBytes = await readFile(resolve(root, protocol.reference.path));
assert.equal(sha(referenceBytes), protocol.reference.sha256);
const reference = JSON.parse(referenceBytes);
assert.deepEqual(protocol.seeds, reference.protocol.seeds);
assert.deepEqual(protocol.windows, reference.protocol.windows);
assert.deepEqual(protocol.switches, [reference.protocol.primary_switch, ...reference.protocol.secondary_switches]);
assert.equal(protocol.training_rounds, reference.protocol.training_rounds);
assert.equal(protocol.post_switch_rounds, reference.protocol.post_switch_rounds);
assert.equal(protocol.communication, 'direct');
execFileSync(process.execPath, ['scripts/verify-adaptation.mjs', protocol.reference.path], { cwd: root, stdio: 'inherit' });
console.error('Original evidence verified. Replaying one complete reference seed before reusing it.');
const replay = createExperimentRunner(reference.protocol).runTrial(protocol.reference.replay_seed);
assert.deepEqual(replay.trial, reference.trials.find(t => t.seed === protocol.reference.replay_seed));
console.error(`Reference replay matched exactly: seed ${replay.trial.seed}, ${replay.encounters} encounters.`);

const newPaths = [protocolPath, 'scripts/evaluate-rewards.mjs', 'scripts/reward-trial.mjs', 'scripts/reward-worker.mjs', 'scripts/reward-analysis.mjs'];
const paths = [...new Set([...Object.keys(reference.provenance.sourceHashes), ...newPaths])];
const sourceHashes = Object.fromEntries(await Promise.all(paths.map(async path => [path, sha(await readFile(resolve(root, path)))])));
const trials = Array(protocol.seeds.length), workerCount = Math.max(1, Math.min(4, availableParallelism() - 1));
let next = 0, completed = 0, candidateEncounters = 0;
await Promise.all(Array.from({ length: workerCount }, async () => {
  while (next < protocol.seeds.length) {
    const index = next++, seed = protocol.seeds[index];
    const result = await new Promise((resolveResult, reject) => {
      const worker = new Worker(new URL('./reward-worker.mjs', import.meta.url), { workerData: { protocol, seed } });
      let received = false;
      worker.once('message', message => { received = true; resolveResult(message); });
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0 || !received) reject(new Error(`Seed ${seed}: incomplete worker result (${code})`)); });
    });
    assert.equal(result.trial.seed, seed);
    trials[index] = result.trial; candidateEncounters += result.encounters;
    console.error(`Completed candidate seed ${seed} (${++completed}/${protocol.seeds.length}); ${candidateEncounters} candidate encounters`);
  }
}));
const summary = summarizeRewards(protocol, trials, reference);
summary.actualEncounters = { candidate: candidateEncounters, referenceReplay: replay.encounters, totalNew: candidateEncounters + replay.encounters, reusedReference: reference.summary.actualEncounters };
summary.protocolSha256 = sha(protocolBytes);
const result = { schema: 1, protocol, provenance: { generatedAt: new Date().toISOString(), sourceHashes,
  runtime: { node: process.version, platform: process.platform, arch: process.arch, workerCount },
  reference: { ...protocol.reference, replayMatchedExactly: true, replayEncounters: replay.encounters } }, summary, trials };
const num = value => value.toFixed(2), ci = c => `${num(c.meanDifference)} [${num(c.interval[0])}, ${num(c.interval[1])}]`;
const lines = [
  '# Reward attribution experiment — v1', '',
  `Protocol: [reward-attribution-v1.protocol.json](reward-attribution-v1.protocol.json). [Raw results](${basename(output)}.results.json) · [Summary](${basename(output)}.summary.json). Original [adaptation-v1 evidence](adaptation-v1.md) is retained unchanged.`, '',
  `**Decision: ${summary.disposition}.** All five predeclared gates must pass to advance this candidate.`, '',
  'The candidate uses 50% individual damage credit and 50% team-average damage credit, retaining the original individual defeat penalty and observation gate. No combat rules, stats, player controls, legal tactics, Rust learning parameters or maps changed. This is an experiment-only host adapter; it is not enabled in the game.', '',
  `Executed **${candidateEncounters} candidate encounters** across ${trials.length} matched policy seeds, plus **${replay.encounters} reference-replay encounters**. The complete replay matched the original seed exactly. Original comparison traces and all source hashes were verified before reuse; reused encounters are not new independent data.`, '',
  '## Advancement gates', '', '| Gate | Measured difference, HP [95% interval] | Requirement | Pass |', '| --- | --- | --- | --- |',
  ...Object.entries(protocol.gates).filter(([key]) => !['decision', 'cover_damage'].includes(key)).map(([key, rule]) => `| ${key} | ${ci(summary.measures[key])} | Mean ≥ ${rule.minimum_mean_gain}; lower bound ${rule.strict_lower ? '>' : '≥'} ${rule.minimum_lower_bound} | ${summary.gates[key]} |`),
  `| cover_damage | Max absolute late-round difference ${num(summary.measures.cover_damage.maximumAbsoluteDifference)} | ≤ ${protocol.gates.cover_damage.maximum_absolute_difference} | ${summary.gates.cover_damage} |`, '',
  'Differences compare candidate online against original online, or candidate online against its own identically trained frozen branch. Reversal versus original is a noninferiority guard. Intervals resample paired per-seed means, not individual rounds. No gate or candidate weight was changed after measurement.', '',
  '## Late-round effectiveness', '', '| Player switch | Candidate online | Candidate frozen | Original online | Original frozen | Fixed | Random | Candidate − original | Candidate learning benefit |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ...protocol.switches.map(style => { const w = summary.bySwitch[style].late, c = w.conditions; return `| ${style} | ${['candidate-online', 'candidate-trained-frozen', 'original-online', 'original-trained-frozen', 'selected-fixed', 'uniform'].map(k => num(c[k].damage)).join(' | ')} | ${ci(w.candidateMinusOriginal)} | ${ci(w.candidateLearningBenefit)} |`; }), '',
  'Higher damage measures enemy effectiveness, not player enjoyment. These are rounds 17–24 after the switch. Each reward rule trains its own policy for 24 clockwise rounds, so the candidate-versus-original effect includes changes during both training and adaptation.', '',
];
for (const style of protocol.switches) {
  const s = summary.bySwitch[style];
  lines.push(`## ${style}: recovery and player outcomes`, '', '| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |', '| --- | ---: | ---: | ---: | ---: |',
    ...s.curve.map(w => `| ${w.rounds.join('–')} | ${['candidate-online', 'candidate-trained-frozen', 'original-online', 'original-trained-frozen'].map(k => num(w.conditions[k].damage)).join(' | ')} |`), '',
    `Candidate late clear rate: ${num(s.late.conditions['candidate-online'].playerClearRate * 100)}%; player death rate: ${num(s.late.conditions['candidate-online'].playerDeathRate * 100)}%; mean duration: ${num(s.late.conditions['candidate-online'].durationSeconds)}s. Candidate minus fixed damage: ${ci(s.late.candidateMinusFixed)} HP.`, '',
    '| Tactic | Candidate probability after training | After switch |', '| --- | ---: | ---: |',
    ...s.policyShift.probabilities.map(p => `| ${p.role}/${p.action} | ${num(p.before * 100)}% | ${num(p.after * 100)}% |`), '');
}
lines.push('## Reproduce and interpret', '', '```sh', 'npm ci', 'npm run build:wasm', 'npm run compile:sim', 'node scripts/evaluate-rewards.mjs --out docs/experiments/reward-attribution-v1-replication', 'node scripts/verify-rewards.mjs docs/experiments/reward-attribution-v1-replication.results.json', '```', '',
  'The runner refuses to overwrite evidence. It verifies v1 sources and raw data, then replays one full original trial exactly before reusing the original baselines. Every candidate reward retains original reward, own/team damage, observation status and actual feedback acceptance. Every frozen round is checked for exact policy preservation.', '',
  ...protocol.limits.map(limit => `- ${limit}`), '');
await mkdir(dirname(output), { recursive: true });
await writeFile(output + '.results.json', JSON.stringify(result) + '\n', { flag: 'wx' });
await writeFile(output + '.summary.json', JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
await writeFile(output + '.md', lines.join('\n'), { flag: 'wx' });
console.log(JSON.stringify({ disposition: summary.disposition, gates: summary.gates, encounters: summary.actualEncounters, report: output + '.md' }, null, 2));
