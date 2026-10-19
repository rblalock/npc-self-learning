import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makePolicy, TACTICS, baselineRoot } from './evidence-baseline.mjs';
import { summarizeRewards } from './reward-analysis.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(root, process.argv[2] ?? 'docs/experiments/additive-credit-v1.results.json');
const result = JSON.parse(await readFile(path, 'utf8'));
const { protocol: p, trials, summary } = result;
const sha = data => createHash('sha256').update(data).digest('hex');
const protocolBytes = await readFile(resolve(root, 'docs/experiments/additive-credit-v1.protocol.json'));
assert.deepEqual(p, JSON.parse(protocolBytes));
assert.equal(summary.protocolSha256, sha(protocolBytes));
for (const [name, hash] of Object.entries(result.provenance.sourceHashes)) assert.equal(sha(await readFile(resolve(root, name))), hash, `Source changed: ${name}`);
const referenceBytes = await readFile(resolve(baselineRoot, p.reference.path));
assert.equal(sha(referenceBytes), p.reference.sha256);
const reference = JSON.parse(referenceBytes);
execFileSync(process.execPath, ['scripts/verify-adaptation.mjs', p.reference.path], { cwd: baselineRoot, stdio: 'pipe' });
assert.deepEqual(trials.map(t => t.seed), p.seeds);
assert.equal(new Set(p.seeds).size, p.seeds.length);
assert.equal(result.provenance.reference.replayMatchedExactly, true);
assert.equal(result.provenance.reference.replayEncounters, 264);

const roles = Object.keys(TACTICS);
const clamp = n => Math.max(-1, Math.min(1, n));
let count = 0;

/** Replay every actual choice, feedback and commit through Wasm independently
 * of the experiment adapter. This verifies recorded probabilities, scores,
 * sample counts, decision identities and frozen memory against the core. */
function verifyTrace(seed, rows, length, style, learning, snapshot) {
  assert.equal(rows.length, length);
  const policy = makePolicy(seed);
  if (snapshot) policy.request({ op: 'restore', snapshot });
  const frozen = policy.request({ op: 'inspect' }).cells;
  try {
    rows.forEach((row, index) => {
      assert.equal(row.phaseRound, index + 1);
      assert.equal(row.style, style); assert.equal(row.control, 'demo');
      assert.equal(row.communication, 'direct'); assert.equal(row.baseline, false);
      assert.equal(row.learning, learning); assert.equal(row.rewardMode, 'additive-team');
      assert.ok(row.duration > 0 && row.duration < 27 && row.damage >= 0 && row.damage <= 100);
      assert.equal(row.damage + row.health, 100);
      assert.deepEqual(row.feedbackAudit.map(a => a.role), roles);
      assert.deepEqual(row.recap.map(a => a.role), roles);
      assert.deepEqual(row.rewards.map(a => a.role), roles);
      const before = policy.request({ op: 'inspect' }).cells;
      const decisions = roles.map(role => policy.request({ op: 'choose', role, context: 'arena', allowed: TACTICS[role], baseline: false }));
      const teamDamage = row.feedbackAudit.filter(a => a.observed).reduce((sum, a) => sum + a.damage, 0);
      row.feedbackAudit.forEach((a, i) => {
        assert.ok(Number.isFinite(a.damage) && a.damage >= 0);
        assert.equal(a.teamDamage, teamDamage);
        assert.equal(a.decisionId, decisions[i].decision_id);
        assert.equal(a.tactic, decisions[i].action);
        const reward = clamp(a.damage / 32 + .5 * (teamDamage - (a.observed ? a.damage : 0)) / 96 - .22 - (a.defeated ? .18 : 0));
        const original = clamp(a.damage / 32 - .22 - (a.defeated ? .18 : 0));
        assert.equal(a.reward, reward); assert.equal(a.originalReward, original);
        assert.equal(a.submittedObserved, a.observed && learning);
        assert.equal(a.accepted, policy.request({ op: 'feedback', decision_id: a.decisionId, reward, observed: a.submittedObserved }).accepted);
        assert.equal(row.recap[i].reward, reward); assert.equal(row.rewards[i].reward, reward);
        assert.equal(row.recap[i].originalReward, original); assert.equal(row.rewards[i].originalReward, original);
        assert.equal(row.recap[i].damage, a.damage); assert.equal(row.recap[i].hits, a.damage / 12);
        assert.equal(row.recap[i].accepted, a.accepted); assert.equal(row.recap[i].observed, a.observed);
        assert.equal(row.recap[i].before, before.find(c => c.role === a.role && c.action === a.tactic).probability);
      });
      const after = policy.request({ op: 'commit' });
      assert.equal(row.encounter, after.encounter);
      assert.deepEqual(row.policy, after.cells);
      for (const r of row.recap) assert.equal(r.after, after.cells.find(c => c.role === r.role && c.action === r.tactic).probability);
      if (!learning) assert.deepEqual(after.cells, frozen);
      count++;
    });
    return policy.request({ op: 'snapshot' });
  } finally { policy.dispose(); }
}

for (const t of trials) {
  const trained = verifyTrace(t.seed, t.training.online, p.training_rounds, p.training_style, true);
  assert.deepEqual(trained, t.snapshots.online);
  assert.deepEqual(Object.keys(t.branches), p.switches);
  for (const style of p.switches) {
    assert.deepEqual(Object.keys(t.branches[style]), ['online', 'trained-frozen']);
    for (const condition of ['online', 'trained-frozen']) verifyTrace(t.seed, t.branches[style][condition], p.post_switch_rounds, style, condition === 'online', trained);
    const a = t.branches[style].online[0], b = t.branches[style]['trained-frozen'][0];
    assert.deepEqual([a.damage, a.result, a.duration, a.rewards], [b.damage, b.result, b.duration, b.rewards]);
  }
}
assert.equal(count, p.seeds.length * (p.training_rounds + 2 * p.switches.length * p.post_switch_rounds));
const reconstructed = summarizeRewards(p, trials, reference);
const { actualEncounters, protocolSha256, ...storedAnalysis } = summary;
assert.deepEqual(reconstructed, storedAnalysis);
assert.deepEqual(actualEncounters, { candidate: count, referenceReplay: 264, totalNew: count + 264, reusedReference: reference.summary.actualEncounters });
assert.deepEqual(summary, JSON.parse(await readFile(path.replace(/\.results\.json$/, '.summary.json'), 'utf8')));
console.log(JSON.stringify({ verifiedCandidateEncounters: count, replayedPolicyDecisions: count * 3, verifiedSeeds: trials.length,
  sourceHashes: Object.keys(result.provenance.sourceHashes).length, disposition: summary.disposition, gates: summary.gates }, null, 2));
