import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  DEFAULT_INPUT, SOURCE_PATHS, DESIGN, fingerprintFile, sourceFingerprints, catalogBest,
  simulateFromSnapshot, loadEvidence, expectedCounts, computeAudit, verifyAuditStructure,
  summarizeAudit, checkUnchanged, prepareOutputDirectory,
} from './audit-agentic-menu-v1.mjs';
import { PLANS, sha } from './agentic-v1/design.mjs';
import { ROOT } from './agentic-v2/io.mjs';

let loaded, result, summary, directory, originalInputHash, originalSources;
before(async () => {
  directory = await mkdtemp('/tmp/agentic-menu-audit-test-');
  originalInputHash = await fingerprintFile(resolve(ROOT, DEFAULT_INPUT));
  originalSources = await sourceFingerprints();
  loaded = await loadEvidence();
  result = computeAudit(loaded);
  summary = summarizeAudit(result);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

const rawRow = ({ frames, ...row }) => row;
const total = xs => xs.reduce((a, b) => a + b, 0);
const average = xs => total(xs) / xs.length;
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); }
  return value;
}

test('all seven counterfactuals restore exact state/RNG, ignore enumeration order, and preserve inputs', () => {
  const c = loaded.evidence.cases[0], snapshot = deepFreeze(structuredClone(c.training.checkpoint));
  const item = deepFreeze(structuredClone(c.histories.stable[0].schedule[0]));
  const original = sha({ snapshot, item }), ordered = new Map();
  for (const plan of PLANS) {
    const transition = simulateFromSnapshot(c.training.policySeed, snapshot, item, plan.id, 11);
    ordered.set(plan.id, transition);
    assert.deepEqual(transition.before, snapshot);
    assert.equal(transition.before.rng_state, snapshot.rng_state);
    assert.equal(transition.after.encounter, snapshot.encounter + 1);
    assert.equal(transition.after.next_decision_id, snapshot.next_decision_id + 1);
    assert.equal(transition.fight.feedback.accepted, true);
    assert.equal(transition.policyDelta.cells.reduce((n, c) => n + c.samples.delta, 0), 1);
  }
  for (const plan of [...PLANS].reverse()) {
    assert.deepEqual(simulateFromSnapshot(c.training.policySeed, snapshot, item, plan.id, 11), ordered.get(plan.id));
  }
  assert.equal(sha({ snapshot, item }), original);
  assert.deepEqual(ordered.get('baseline').fight, rawRow(c.histories.stable[0].rows[0]));
  assert.notDeepEqual(ordered.get('aim').after.cells, ordered.get('lead').after.cells, 'Forced choices must actually update different cells');
});

test('every trajectory starts at the shared checkpoint and probes never contaminate reference or greedy state', () => {
  for (const c of result.cases) for (const history of Object.values(c.histories)) {
    const baseline = history.held.find(branch => branch.planId === 'baseline');
    assert.deepEqual(history.reference.steps.map(step => step.committed), baseline.steps);
    for (const kind of ['reference', 'greedy']) {
      let state = c.initial;
      for (const step of history[kind].steps) {
        assert.equal(step.probes.length, 7);
        for (const probe of step.probes) assert.deepEqual(probe.before, state);
        assert.deepEqual(step.committed.before, state);
        assert.deepEqual(step.committed, step.probes.find(probe => probe.fight.planId === step.selectedPlanId));
        if (kind === 'greedy') {
          const max = Math.max(...step.probes.map(probe => probe.fight.physical.damage));
          const first = step.probes.find(probe => probe.fight.physical.damage === max);
          assert.equal(step.selectedPlanId, first.fight.planId);
        } else assert.equal(step.selectedPlanId, 'baseline');
        state = step.committed.after;
      }
      assert.deepEqual(history[kind].final, state);
    }
    assert.equal(history.recordedMatches.length, 4, 'Retained, calibrated, and both held-initial v2 branches must match');
  }
});

test('catalog ties are independent of input order and invalid/partial menus are rejected', () => {
  const tied = PLANS.map(plan => ({ planId: plan.id, meanDamage: 0 })).reverse();
  assert.equal(catalogBest(tied).planId, 'baseline');
  for (const row of tied) row.meanDamage = ['far', 'lead'].includes(row.planId) ? 24 : 0;
  assert.equal(catalogBest(tied).planId, 'lead');
  assert.throws(() => catalogBest(tied.slice(1)), /every catalog plan/);
  assert.throws(() => catalogBest([...tied.slice(1), tied[1]]), /Duplicate/);
  assert.throws(() => catalogBest(tied.map(row => ({ ...row, meanDamage: NaN }))), /Non-finite/);
});

test('simulation budget independently reconciles all probe and separately committed fight records', () => {
  const counts = { checkpointProbes: 0, heldCommitted: 0, referenceProbes: 0, referenceCommitted: 0, greedyProbes: 0, greedyCommitted: 0 };
  for (const c of result.cases) {
    counts.checkpointProbes += total(c.checkpointPlans.map(table => table.probes.length));
    for (const history of Object.values(c.histories)) {
      counts.heldCommitted += total(history.held.map(branch => branch.steps.length));
      counts.referenceCommitted += history.reference.steps.length;
      counts.greedyCommitted += history.greedy.steps.length;
      counts.referenceProbes += total(history.reference.steps.map(step => step.probes.length));
      counts.greedyProbes += total(history.greedy.steps.map(step => step.probes.length));
    }
  }
  assert.deepEqual(counts, { checkpointProbes: 28, heldCommitted: 672, referenceProbes: 672, referenceCommitted: 96, greedyProbes: 672, greedyCommitted: 96 });
  assert.deepEqual(result.simulations.byCategory, counts);
  assert.deepEqual(expectedCounts(2, 24), counts);
  assert.equal(total(Object.values(counts)), 2236);
  assert.equal(result.simulations.totalPhysicalFights, 2236);
  assert.equal(result.simulations.probeFights, 1372);
  assert.equal(result.simulations.committedTrajectoryFights, 864);
  assert.equal(result.simulations.reusedWarmupFights, 20);
  assert.equal(result.simulations.inheritedV2CalibrationFights, 1384);
  assert.equal(result.simulations.newWarmupFights, 0);
  assert.equal(result.simulations.newCalibrationFights, 0);
  assert.equal(result.simulations.modelCalls, 0);
});

test('summary keeps local reference opportunities separate from realized held/greedy trajectories', () => {
  for (const pair of summary.pairs) {
    const c = result.cases.find(c => c.seed === pair.seed), h = c.histories[pair.history];
    const held = h.held.map(branch => ({ planId: branch.planId, meanDamage: average(branch.steps.map(step => step.fight.physical.damage)) }));
    const bestHeld = held.reduce((a, b) => b.meanDamage > a.meanDamage ? b : a);
    const fixed = held.find(branch => branch.planId === c.calibratedPlanId);
    const greedy = average(h.greedy.steps.map(step => step.committed.fight.physical.damage));
    const maxima = h.reference.steps.map(step => Math.max(...step.probes.map(probe => probe.fight.physical.damage)));
    const fixedProbes = h.reference.steps.map(step => step.probes.find(probe => probe.fight.planId === c.calibratedPlanId).fight.physical.damage);
    assert.deepEqual(pair.bestHeldOnThisSchedule, bestHeld);
    assert.equal(pair.realized.calibratedHeld, fixed.meanDamage);
    assert.equal(pair.realized.greedy, greedy);
    assert.equal(pair.realized.greedyMinusBestHeldOnThisSchedule, greedy - bestHeld.meanDamage);
    assert.equal(pair.localReferenceStates.meanBestNextFightDamage, average(maxima));
    assert.equal(pair.localReferenceStates.meanBestMinusCalibrated, average(maxima.map((max, i) => max - fixedProbes[i])));
    assert.equal(pair.localReferenceStates.statesWithGainOverCalibrated, maxima.filter((max, i) => max > fixedProbes[i]).length);
    assert.equal(pair.localReferenceStates.states, 24);
  }
  for (const key of Object.keys(summary.overall.realized)) {
    assert.equal(summary.overall.realized[key], average(summary.pairs.map(pair => pair.realized[key])));
  }
  // Independent known published controls: these must survive the expanded audit.
  assert.equal(summary.byHistory.stable.realized.baseline, 13.5);
  assert.equal(summary.byHistory.recurring.realized.baseline, 17.25);
  assert.equal(summary.overall.realized.calibratedHeld, 25.625);
  assert.match(DESIGN.localOpportunity, /not.*realizable global oracle/);
  assert.match(DESIGN.information, /hidden current scenario/);
  assert.match(DESIGN.information, /No agent receives/);
});

test('fingerprints cover exact input bytes, decoded content, catalog, all sources and runtime dependencies', async () => {
  const bytes = await readFile(resolve(ROOT, DEFAULT_INPUT));
  const decoded = gunzipSync(bytes), provenance = loaded.provenance;
  assert.equal(provenance.input.sha256, sha(bytes));
  assert.equal(provenance.input.decodedSha256, sha(decoded));
  assert.equal(provenance.input.parsedSha256, sha(JSON.parse(decoded)));
  assert.equal(provenance.catalogSha256, sha(PLANS));
  assert.equal(provenance.sourceManifestSha256, sha(provenance.sources));
  assert.deepEqual(Object.keys(provenance.sources), SOURCE_PATHS);
  assert.ok(SOURCE_PATHS.includes('target/agentic-sim/sim.js'));
  assert.ok(SOURCE_PATHS.includes('target/evidence-baseline-v1/apps/arena/public/wasm/tactical_air_bg.wasm'));
  assert.ok(SOURCE_PATHS.includes('scripts/audit-agentic-menu-v1.mjs'));
  for (const [path, hash] of Object.entries(loaded.evidence.sources)) assert.equal(provenance.sources[path].sha256, hash);
  const file = resolve(directory, 'bytes.txt');
  await writeFile(file, 'same-length-A'); const first = await fingerprintFile(file);
  await writeFile(file, 'same-length-B'); const second = await fingerprintFile(file);
  assert.equal(first.bytes, second.bytes); assert.notEqual(first.sha256, second.sha256);
  assert.equal(summary.resultsSha256, sha(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'Result must survive exact JSON serialization');
});

test('input and source artifacts are unchanged after the full audit, and changed input is rejected', async () => {
  assert.deepEqual(await fingerprintFile(resolve(ROOT, DEFAULT_INPUT)), originalInputHash);
  assert.deepEqual(await sourceFingerprints(), originalSources);
  await checkUnchanged(loaded);
  const tampered = structuredClone(loaded.evidence);
  tampered.cases[0].histories.stable[0].schedule[0].side = 1;
  const path = resolve(directory, 'tampered.json');
  await writeFile(path, JSON.stringify(tampered));
  await assert.rejects(loadEvidence(path), /Recorded schedule mismatch/);
});

test('structural verifier rejects missing charges, broken RNG state and altered learning deltas', () => {
  assert.equal(verifyAuditStructure(result).totalPhysicalFights, 2236);
  const badCounts = structuredClone(result); badCounts.simulations.byCategory.greedyCommitted--;
  assert.throws(() => verifyAuditStructure(badCounts), /Charged executions/);
  const badRng = structuredClone(result); badRng.cases[0].histories.stable.greedy.steps[1].probes[0].before.rng_state = '0';
  assert.throws(() => verifyAuditStructure(badRng), /Broken state chain/);
  const badDelta = structuredClone(result); badDelta.cases[0].checkpointPlans[0].probes[0].policyDelta.cells[0].score.delta++;
  assert.throws(() => verifyAuditStructure(badDelta));
});

test('output protection refuses existing paths, evidence/source destinations and symlink escapes', async () => {
  await assert.rejects(prepareOutputDirectory(directory), /Output exists/);
  await assert.rejects(prepareOutputDirectory('docs/experiments/menu-audit-forbidden'), /Output must/);
  await assert.rejects(prepareOutputDirectory('scripts/agentic-menu-forbidden'), /Output must/);
  await symlink(resolve(ROOT, 'docs'), resolve(directory, 'docs-link'));
  await assert.rejects(prepareOutputDirectory(resolve(directory, 'docs-link', 'menu-audit-forbidden')), /Output must/);
  const output = await prepareOutputDirectory(resolve(directory, 'new-output'));
  assert.equal(output, resolve(directory, 'new-output'));
  assert.deepEqual(await fingerprintFile(resolve(ROOT, DEFAULT_INPUT)), originalInputHash);
});
