import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixedProfiles, mean, pairedBootstrap, primaryDecision } from './evaluation-support.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(root, process.argv[2] ?? 'docs/experiments/adaptation-v1.results.json');
const result = JSON.parse(await readFile(path, 'utf8'));
const { protocol: p, summary, trials, fixed, calibration } = result;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const protocolBytes = await readFile(resolve(root, 'docs/experiments/adaptation-v1.protocol.json'));
assert.deepEqual(JSON.parse(protocolBytes), p);
assert.equal(digest(protocolBytes), summary.protocolSha256);
for (const [name, hash] of Object.entries(result.provenance.sourceHashes)) {
  assert.equal(digest(await readFile(resolve(root, name))), hash, `Source identity differs: ${name}`);
}
assert.deepEqual(trials.map(t => t.seed), p.seeds);
assert.equal(new Set(p.seeds).size, p.seeds.length);
assert.deepEqual(calibration.map(c => c.id).sort(), fixedProfiles().map(c => c.id).sort());
const styles = [p.primary_switch, ...p.secondary_switches];
let count = 0;

function checkRounds(rounds, length, style, condition, frozenCells) {
  assert.equal(rounds.length, length);
  rounds.forEach((r, i) => {
    assert.equal(r.phaseRound, i + 1);
    assert.equal(r.style, style);
    assert.equal(r.control, 'demo');
    assert.equal(r.communication, 'direct');
    assert.ok(r.duration > 0 && r.duration < 27 && r.damage >= 0 && r.damage <= 100);
    assert.equal(r.damage + r.health, 100);
    assert.equal(r.learning, condition === 'online');
    assert.equal(r.baseline, ['uniform', 'selected-fixed'].includes(condition));
    if (frozenCells) assert.deepEqual(r.policy, frozenCells);
    for (const role of Object.keys(p.policy_config.roles.reduce((m, role) => ({ ...m, [role.id]: true }), {}))) {
      const cells = r.policy.filter(c => c.role === role);
      assert.equal(cells.length, 2);
      assert.ok(Math.abs(cells.reduce((s, c) => s + c.probability, 0) - 1) < 1e-12);
      for (const c of cells) assert.ok(c.score >= -1 && c.score <= 1 && c.probability >= 0 && c.probability <= 1 && Number.isInteger(c.samples) && c.samples >= 0);
    }
    if (condition !== 'online') assert.ok(r.recap.every(row => !row.accepted));
    count++;
  });
}

for (const c of calibration) {
  assert.deepEqual(c.controllers.map(x => x.style), p.fixed_baseline.calibration_styles);
  for (const controller of c.controllers) {
    checkRounds(controller.rounds, p.fixed_baseline.repetitions_per_style, controller.style, 'selected-fixed', controller.rounds[0].policy);
    for (const r of controller.rounds) for (const row of r.recap) assert.equal(row.tactic, c.actions[row.role]);
  }
  assert.equal(c.score, mean(c.controllers.map(x => mean(x.rounds.map(r => r.damage)))));
}
const ranked = [...calibration].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
assert.equal(fixed.id, ranked[0].id);
assert.deepEqual(fixed.actions, ranked[0].actions);
checkRounds(fixed.training, p.training_rounds, p.training_style, 'selected-fixed', fixed.training[0].policy);
for (const style of styles) checkRounds(fixed.branches[style], p.post_switch_rounds, style, 'selected-fixed', fixed.training[0].policy);
for (const r of [...fixed.training, ...Object.values(fixed.branches).flat()]) for (const row of r.recap) assert.equal(row.tactic, fixed.actions[row.role]);
for (const t of trials) {
  checkRounds(t.training.online, p.training_rounds, p.training_style, 'online');
  checkRounds(t.training.uniform, p.training_rounds, p.training_style, 'uniform', t.training.uniform[0].policy);
  for (const style of styles) {
    checkRounds(t.branches[style].online, p.post_switch_rounds, style, 'online');
    checkRounds(t.branches[style]['trained-frozen'], p.post_switch_rounds, style, 'trained-frozen', t.training.online.at(-1).policy);
    checkRounds(t.branches[style].uniform, p.post_switch_rounds, style, 'uniform', t.training.uniform[0].policy);
  }
}
assert.equal(count, summary.actualEncounters);
const damage = (rounds, window) => mean(rounds.slice(window[0] - 1, window[1]).map(r => r.damage));
for (const style of styles) for (const window of [summary.bySwitch[style].early, summary.bySwitch[style].late, ...summary.bySwitch[style].curve]) {
  for (const condition of p.conditions) {
    const actual = condition === 'selected-fixed' ? damage(fixed.branches[style], window.rounds) : mean(trials.map(t => damage(t.branches[style][condition], window.rounds)));
    assert.ok(Math.abs(actual - window.conditions[condition].damage) < 1e-10);
  }
  for (const [key, condition] of [['onlineMinusFrozen', 'trained-frozen'], ['onlineMinusFixed', 'selected-fixed'], ['onlineMinusUniform', 'uniform']]) {
    assert.ok(Math.abs(window[key].meanDifference - (window.conditions.online.damage - window.conditions[condition].damage)) < 1e-10);
  }
}
const primary = pairedBootstrap(
  trials.map(t => ({ seed: t.seed, value: damage(t.branches[p.primary_switch].online, p.windows.late_switch) })),
  trials.map(t => ({ seed: t.seed, value: damage(t.branches[p.primary_switch]['trained-frozen'], p.windows.late_switch) })), p.uncertainty,
);
assert.deepEqual(primary, summary.bySwitch[p.primary_switch].late.onlineMinusFrozen);
assert.equal(summary.primaryDisposition, primaryDecision(primary, p.primary_signal_rule));
assert.deepEqual(JSON.parse(await readFile(path.replace(/\.results\.json$/, '.summary.json'), 'utf8')), summary);
console.log(JSON.stringify({ verifiedEncounters: count, verifiedSeeds: trials.length, selectedFixedProfile: fixed.id, sourceHashes: Object.keys(result.provenance.sourceHashes).length, primaryDisposition: summary.primaryDisposition }, null, 2));
