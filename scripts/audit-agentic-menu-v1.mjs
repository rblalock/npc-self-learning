import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createPolicy } from './research/policy.mjs';
import { fight, SPEC } from './agentic-v1/trial.mjs';
import { PLANS, sha, mean, schedule, selectFixed } from './agentic-v2/design.mjs';
import { ROOT, PROTOCOL, SOURCES as V2_SOURCES } from './agentic-v2/io.mjs';

// Standalone, offline development diagnostic. No provider import, agent requests,
// calibration reruns, source changes, or writes to the published v2 evidence.
export const DEFAULT_INPUT = 'docs/experiments/agentic-npc-ablation-v2.results.json.gz';
export const SOURCE_PATHS = [...new Set([...V2_SOURCES,
  'docs/agentic-npc-ablation-v2.md',
  'target/evidence-baseline-v1/scripts/adaptation-trial.mjs',
  'target/evidence-baseline-v1/scripts/evaluation-support.mjs',
  'scripts/audit-agentic-menu-v1.mjs', 'scripts/agentic-menu-audit.test.mjs',
])].sort();
const HISTORIES = ['stable', 'recurring'];
const COUNTERS = ['checkpointProbes', 'heldCommitted', 'referenceProbes', 'referenceCommitted', 'greedyProbes', 'greedyCommitted'];
const CASES = [{ seed: 31001, index: 0 }, { seed: 31042, index: 2 }];
export const DESIGN = {
  id: 'agentic-menu-opportunity-v1',
  scope: 'Separate post-v2 development diagnostic on the same two familiar worlds and recorded evaluation schedules. Not fresh-world validation or an agent experiment.',
  objective: 'Measure seven-plan next-fight opportunity and realized greedy damage relative to strong held plans, with ordinary Rust learning throughout.',
  reference: 'Commit baseline at every round. Independently simulate every plan at each pre-fight reference state, restoring the entire snapshot including RNG, then separately execute and commit baseline.',
  greedy: 'At its own pre-fight state, simulate and normally commit all seven candidates in isolated restored policies. Select highest current-fight NPC damage; break exact ties by catalog order. Separately execute and commit the selected plan on the trajectory.',
  held: 'Run all seven complete held plans through each recorded schedule from its shared warmup checkpoint. Their learned policy states and tactic draws may diverge.',
  checkpointTable: 'Probe both recorded A/B scenarios with all seven plans at each shared warmup checkpoint. These 28 probes are additional simulations and are not trajectories.',
  restoration: 'Every fight starts in a fresh policy restored to its trajectory snapshot. Restore equality includes cells, configuration, encounter, next decision ID, and RNG state. Every probe uses normal choose, feedback, and commit, then its policy is discarded.',
  information: 'The evaluator reads the hidden current scenario, complete policy/RNG state, and simulated counterfactual outcomes. Greedy has exact current-fight simulation access. No agent receives this information or these tables; no live model calls occur. Greedy does not search future fights.',
  randomness: 'Within a next-fight comparison, all plans use identical starting policy/RNG and the same scenario/player seed. Legal action masks may consume RNG differently. Opponent inputs can respond to NPC behavior, so identical input traces are not required.',
  selection: 'The v2 calibration winner is inherited unchanged. Best held plan per schedule and best aggregate held plan are selected retrospectively on this diagnostic, with catalog ties; neither is a preselected agent benchmark.',
  localOpportunity: 'Reference-state next-fight maxima describe local opportunities only. Averaging or summing those maxima does not produce a realizable global oracle trajectory or a bound on the globally optimal policy. Greedy is a realized privileged policy, not a globally optimal policy or evidence that an agent can predict these outcomes.',
  weighting: 'Mean NPC damage in HP, higher favors the NPC. Average rounds within each case/history, then cases equally within history and histories equally overall. No model repetitions or probes count as independent worlds.',
  accounting: 'Charge each actual probe and committed fight separately, including duplicate baseline/selected re-executions. Reuse 20 recorded warmups and existing v2 calibration without simulating or charging them anew. The original v2 study budget remains separate.',
  tieBreak: 'First plan in declared seven-plan catalog; exact numeric damage ties, no epsilon.',
};

export async function fingerprintFile(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function sourceFingerprints() {
  return Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path => [path, await fingerprintFile(resolve(ROOT, path))])));
}

export function catalogBest(rows, value = row => row.meanDamage) {
  assert.equal(rows.length, PLANS.length, 'Expected every catalog plan exactly once');
  assert.equal(new Set(rows.map(row => row.planId)).size, PLANS.length, 'Duplicate plan');
  const ordered = PLANS.map(plan => {
    const row = rows.find(row => row.planId === plan.id);
    assert.ok(row, `Missing plan ${plan.id}`);
    assert.ok(Number.isFinite(value(row)), 'Non-finite plan value');
    return row;
  });
  return ordered.reduce((best, row) => value(row) > value(best) ? row : best);
}

const withoutFrames = ({ frames, ...row }) => row;
const identity = c => ({ seed: c.seed, index: c.index });
const cellKey = c => JSON.stringify([c.role, c.context, c.action]);
const sum = xs => xs.reduce((a, b) => a + b, 0);

// These differences describe actual learning; they never replace or edit cells.
export function cellDeltas(before, after) {
  assert.equal(before.length, after.length);
  return after.map(next => {
    const previous = before.find(cell => cellKey(cell) === cellKey(next));
    assert.ok(previous, 'Policy cell identity changed');
    const row = { role: next.role, context: next.context, action: next.action };
    for (const field of ['score', 'samples', 'probability']) {
      assert.ok(Number.isFinite(previous[field]) && Number.isFinite(next[field]));
      row[field] = { before: previous[field], after: next[field], delta: next[field] - previous[field] };
    }
    return row;
  });
}

export function simulateFromSnapshot(policySeed, snapshot, item, planId, round) {
  const original = sha({ snapshot, item });
  const policy = createPolicy(policySeed, SPEC);
  try {
    policy.request({ op: 'restore', snapshot });
    const before = policy.request({ op: 'snapshot' });
    assert.deepEqual(before, snapshot, 'Restore must preserve the entire state, including RNG');
    const inspection = policy.request({ op: 'inspect' });
    assert.equal(inspection.pending, 0); assert.equal(inspection.queued, 0);
    const row = fight(policy, item, planId, round);
    const after = policy.request({ op: 'snapshot' });
    const finalInspection = policy.request({ op: 'inspect' });
    assert.equal(finalInspection.pending, 0); assert.equal(finalInspection.queued, 0);
    assert.equal(after.encounter, before.encounter + 1);
    assert.equal(after.next_decision_id, before.next_decision_id + 1);
    assert.deepEqual(after.config, before.config);
    assert.deepEqual(row.policy, finalInspection.cells);
    assert.equal(sha({ snapshot, item }), original, 'Simulation mutated an input');
    return {
      before, beforeSha256: sha(before), beforePolicy: inspection.cells,
      fight: row, after, afterSha256: sha(after),
      policyDelta: {
        encounter: after.encounter - before.encounter,
        nextDecisionId: after.next_decision_id - before.next_decision_id,
        rngState: { before: before.rng_state, after: after.rng_state },
        cells: cellDeltas(inspection.cells, row.policy),
      },
    };
  } finally { policy.dispose(); }
}

function damageSummary(steps) {
  const rows = steps.map(step => step.committed?.fight ?? step.fight);
  const plans = rows.map(row => row.planId), damage = rows.map(row => row.physical.damage);
  return {
    fights: rows.length, meanDamage: mean(damage), totalDamage: sum(damage), damage, plans,
    initialPlanId: plans[0],
    betweenFightSwitches: plans.slice(1).filter((plan, i) => plan !== plans[i]).length,
    playerDefeats: rows.filter(row => row.physical.result === 'down').length,
    npcSurvivals: rows.filter(row => row.physical.enemies[0].hp > 0).length,
  };
}

function probeComparisons(probes, calibratedPlanId) {
  const baseline = probes.find(probe => probe.fight.planId === 'baseline');
  const calibrated = probes.find(probe => probe.fight.planId === calibratedPlanId);
  const ranked = probes.map(probe => ({ planId: probe.fight.planId, damage: probe.fight.physical.damage }));
  const best = catalogBest(ranked, row => row.damage);
  return {
    bestPlanId: best.planId, bestDamage: best.damage,
    tiedBestPlanIds: ranked.filter(row => row.damage === best.damage).map(row => row.planId),
    baselineDamage: baseline.fight.physical.damage, calibratedPlanId, calibratedDamage: calibrated.fight.physical.damage,
    bestMinusBaseline: best.damage - baseline.fight.physical.damage,
    bestMinusCalibrated: best.damage - calibrated.fight.physical.damage,
    plans: probes.map(probe => ({
      planId: probe.fight.planId, damage: probe.fight.physical.damage, tactic: probe.fight.choice.action,
      damageMinusBaseline: probe.fight.physical.damage - baseline.fight.physical.damage,
      damageMinusCalibrated: probe.fight.physical.damage - calibrated.fight.physical.damage,
      tacticDiffersFromBaseline: probe.fight.choice.action !== baseline.fight.choice.action,
      policyAfterMinusBaseline: cellDeltas(baseline.fight.policy, probe.fight.policy),
    })),
  };
}

export function auditCase(record, protocol, calibratedPlanId, { log = () => {} } = {}) {
  const original = sha(record), counts = Object.fromEntries(COUNTERS.map(key => [key, 0]));
  const initial = record.training.checkpoint;
  const simulate = (snapshot, item, planId, round, category) => {
    assert.ok(COUNTERS.includes(category));
    const transition = simulateFromSnapshot(record.training.policySeed, snapshot, item, planId, round);
    counts[category]++;
    return transition;
  };
  const result = { ...identity(record), policySeed: record.training.policySeed, initial: structuredClone(initial),
    initialSha256: sha(initial), calibratedPlanId, checkpointPlans: [], histories: {} };
  for (const side of [0, 1]) {
    const item = [...record.training.schedule, ...Object.values(record.histories).flatMap(bs => bs[0].schedule)].find(item => item.side === side);
    assert.ok(item, `No recorded scenario for side ${side}`);
    const probes = PLANS.map(plan => simulate(initial, item, plan.id, protocol.warmupRounds + 1, 'checkpointProbes'));
    result.checkpointPlans.push({ side, scenario: structuredClone(item.scenario), probes, comparison: probeComparisons(probes, calibratedPlanId) });
  }
  for (const history of HISTORIES) {
    const recordedBranches = record.histories[history], s = recordedBranches[0].schedule;
    const held = PLANS.map(plan => {
      let state = initial;
      const steps = s.map((item, i) => {
        const step = simulate(state, item, plan.id, protocol.warmupRounds + i + 1, 'heldCommitted');
        state = step.after; return step;
      });
      return { planId: plan.id, initial: structuredClone(initial), steps, final: state, summary: damageSummary(steps) };
    });
    const runProbed = kind => {
      let state = initial;
      const steps = s.map((item, i) => {
        const probes = PLANS.map(plan => simulate(state, item, plan.id, protocol.warmupRounds + i + 1, `${kind}Probes`));
        const comparison = probeComparisons(probes, calibratedPlanId);
        const selectedPlanId = kind === 'reference' ? 'baseline' : comparison.bestPlanId;
        // Do not adopt a probe snapshot as a free trajectory fight. Re-execute,
        // normally commit, assert exact equality, and charge that execution.
        const committed = simulate(state, item, selectedPlanId, protocol.warmupRounds + i + 1, `${kind}Committed`);
        assert.deepEqual(committed, probes.find(probe => probe.fight.planId === selectedPlanId), 'Selected probe and committed fight differ');
        state = committed.after;
        return { postRound: i + 1, side: item.side, probes, comparison, selectedPlanId, committed };
      });
      return { initial: structuredClone(initial), steps, final: state, summary: damageSummary(steps) };
    };
    const reference = runProbed('reference'), greedy = runProbed('greedy');
    const baseline = held.find(branch => branch.planId === 'baseline');
    assert.deepEqual(reference.steps.map(step => step.committed), baseline.steps);
    assert.deepEqual(reference.final, baseline.final);
    // Compare newly simulated held branches against ALL applicable recorded v2
    // branches, ignoring only the old visualization frames. No extra simulation.
    const recordedMatches = recordedBranches.filter(b => ['retained', 'fixed', 'initial'].includes(b.arm)).map(branch => {
      const replay = held.find(b => b.planId === branch.planId);
      assert.ok(replay); assert.deepEqual(replay.initial, branch.initial);
      assert.deepEqual(replay.steps.map(step => step.fight), branch.rows.map(withoutFrames), 'Held branch differs from recorded v2');
      assert.deepEqual(replay.final, branch.final, 'Held final state differs from recorded v2');
      return { arm: branch.arm, replicate: branch.replicate, planId: branch.planId, fights: branch.rows.length };
    });
    result.histories[history] = { schedule: structuredClone(s), scheduleSha256: sha(s), held, reference, greedy, recordedMatches };
    log({ caseSeed: record.seed, history, complete: true });
  }
  assert.equal(sha(record), original, 'Audit mutated the original v2 case');
  return { record: result, counts };
}

export async function loadEvidence(input = DEFAULT_INPUT) {
  const inputPath = resolve(ROOT, input), bytes = await readFile(inputPath);
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const evidence = JSON.parse(decoded.toString('utf8'));
  assert.ok(evidence.completedAt && !evidence.incomplete, 'Require completed v2 evidence');
  assert.deepEqual(evidence.protocol, JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8')), 'Require frozen v2 protocol');
  assert.equal(evidence.protocolSha256, sha(evidence.protocol));
  assert.deepEqual(evidence.protocol.cases, CASES);
  assert.deepEqual(evidence.cases.map(identity), CASES);
  assert.deepEqual(evidence.protocol.histories, HISTORIES);
  assert.equal(evidence.protocol.warmupRounds, 10); assert.equal(evidence.protocol.postRounds, 24);
  assert.equal(evidence.calibrationSha256, sha(evidence.calibration));
  assert.equal(evidence.calibration.length, CASES.length);
  const sources = await sourceFingerprints();
  assert.deepEqual(Object.keys(evidence.sources).sort(), [...V2_SOURCES].sort(), 'Incomplete v2 source manifest');
  for (const [path, hash] of Object.entries(evidence.sources)) assert.equal(sources[path].sha256, hash, `Frozen v2 source changed: ${path}`);
  for (const [i, c] of evidence.cases.entries()) {
    const calibration = evidence.calibration[i];
    assert.deepEqual(identity(calibration.data), identity(c));
    assert.deepEqual(calibration.selection, selectFixed(calibration.data), 'Inherited calibration selection mismatch');
    assert.equal(c.training.rows.length, 10);
    assert.deepEqual(c.training.schedule, schedule(c, evidence.protocol, 'warmup'));
    assert.deepEqual(Object.keys(c.histories), HISTORIES);
    for (const [history, branches] of Object.entries(c.histories)) {
      assert.ok(branches.some(b => b.arm === 'retained' && b.planId === 'baseline'));
      assert.ok(branches.some(b => b.arm === 'fixed' && b.planId === calibration.selection.planId));
      for (const branch of branches) {
        assert.deepEqual(branch.initial, c.training.checkpoint, 'Unshared initial checkpoint');
        assert.deepEqual(branch.schedule, schedule(c, evidence.protocol, history), 'Recorded schedule mismatch');
        assert.equal(branch.rows.length, 24);
      }
    }
  }
  return {
    evidence, inputPath,
    provenance: {
      input: { file: basename(inputPath), bytes: bytes.length, sha256: sha(bytes), decodedSha256: sha(decoded), parsedSha256: sha(evidence) },
      v2ProtocolSha256: evidence.protocolSha256, v2SourceManifestSha256: sha(evidence.sources),
      v2CalibrationSha256: evidence.calibrationSha256, sources,
      sourceManifestSha256: sha(sources), catalogSha256: sha(PLANS),
      runtime: { node: process.version, platform: process.platform, arch: process.arch },
    },
  };
}

export function expectedCounts(cases, rounds, histories = HISTORIES.length) {
  const states = cases * histories * rounds;
  return {
    checkpointProbes: cases * 2 * PLANS.length,
    heldCommitted: states * PLANS.length, referenceProbes: states * PLANS.length,
    referenceCommitted: states, greedyProbes: states * PLANS.length, greedyCommitted: states,
  };
}

export function verifyAuditStructure(result) {
  const actual = Object.fromEntries(COUNTERS.map(key => [key, 0]));
  const check = (step, before, category) => {
    actual[category]++;
    assert.deepEqual(step.before, before, 'Broken state chain or unmatched probe state');
    assert.equal(step.beforeSha256, sha(step.before)); assert.equal(step.afterSha256, sha(step.after));
    assert.equal(step.after.encounter, before.encounter + 1);
    assert.equal(step.after.next_decision_id, before.next_decision_id + 1);
    assert.deepEqual(step.after.config, before.config);
    assert.equal(step.fight.feedback.accepted, true);
    assert.deepEqual(step.after.cells, step.fight.policy.map(({ probability, ...cell }) => cell));
    assert.deepEqual(step.policyDelta, {
      encounter: 1, nextDecisionId: 1, rngState: { before: before.rng_state, after: step.after.rng_state },
      cells: cellDeltas(step.beforePolicy, step.fight.policy),
    });
  };
  for (const c of result.cases) {
    assert.equal(c.initialSha256, sha(c.initial));
    assert.deepEqual(c.checkpointPlans.map(table => table.side), [0, 1]);
    for (const table of c.checkpointPlans) {
      assert.deepEqual(table.probes.map(probe => probe.fight.planId), PLANS.map(plan => plan.id));
      for (const probe of table.probes) check(probe, c.initial, 'checkpointProbes');
      assert.deepEqual(table.comparison, probeComparisons(table.probes, c.calibratedPlanId));
    }
    assert.deepEqual(Object.keys(c.histories), HISTORIES);
    for (const history of Object.values(c.histories)) {
      assert.equal(history.scheduleSha256, sha(history.schedule));
      assert.equal(history.schedule.length, result.postRounds);
      assert.deepEqual(history.held.map(branch => branch.planId), PLANS.map(plan => plan.id));
      for (const branch of history.held) {
        assert.deepEqual(branch.initial, c.initial); assert.equal(branch.steps.length, result.postRounds);
        let state = c.initial;
        for (const step of branch.steps) { check(step, state, 'heldCommitted'); assert.equal(step.fight.planId, branch.planId); state = step.after; }
        assert.deepEqual(branch.final, state); assert.deepEqual(branch.summary, damageSummary(branch.steps));
      }
      for (const kind of ['reference', 'greedy']) {
        const branch = history[kind];
        assert.deepEqual(branch.initial, c.initial); assert.equal(branch.steps.length, result.postRounds);
        let state = c.initial;
        for (const [i, step] of branch.steps.entries()) {
          assert.equal(step.postRound, i + 1); assert.equal(step.side, history.schedule[i].side);
          assert.deepEqual(step.probes.map(probe => probe.fight.planId), PLANS.map(plan => plan.id));
          for (const probe of step.probes) check(probe, state, `${kind}Probes`);
          assert.deepEqual(step.comparison, probeComparisons(step.probes, c.calibratedPlanId));
          assert.equal(step.selectedPlanId, kind === 'reference' ? 'baseline' : step.comparison.bestPlanId);
          assert.deepEqual(step.committed, step.probes.find(probe => probe.fight.planId === step.selectedPlanId));
          check(step.committed, state, `${kind}Committed`); state = step.committed.after;
        }
        assert.deepEqual(branch.final, state); assert.deepEqual(branch.summary, damageSummary(branch.steps));
      }
      assert.deepEqual(history.reference.steps.map(step => step.committed), history.held[0].steps);
    }
  }
  const expected = expectedCounts(result.cases.length, result.postRounds);
  assert.deepEqual(actual, expected, 'Fight-record count does not reconcile');
  assert.deepEqual(result.simulations.byCategory, actual, 'Charged executions differ from recorded fights');
  assert.equal(result.simulations.totalPhysicalFights, sum(Object.values(actual)));
  assert.equal(result.simulations.probeFights, actual.checkpointProbes + actual.referenceProbes + actual.greedyProbes);
  assert.equal(result.simulations.committedTrajectoryFights, actual.heldCommitted + actual.referenceCommitted + actual.greedyCommitted);
  assert.equal(result.simulations.modelCalls, 0);
  return { verified: true, byCategory: actual, totalPhysicalFights: sum(Object.values(actual)) };
}

function localSummary(steps) {
  const comparisons = steps.map(step => step.comparison);
  return {
    states: steps.length,
    meanBestNextFightDamage: mean(comparisons.map(c => c.bestDamage)),
    meanBaselineNextFightDamage: mean(comparisons.map(c => c.baselineDamage)),
    meanCalibratedNextFightDamage: mean(comparisons.map(c => c.calibratedDamage)),
    meanBestMinusBaseline: mean(comparisons.map(c => c.bestMinusBaseline)),
    meanBestMinusCalibrated: mean(comparisons.map(c => c.bestMinusCalibrated)),
    statesWithGainOverBaseline: comparisons.filter(c => c.bestMinusBaseline > 0).length,
    statesWithGainOverCalibrated: comparisons.filter(c => c.bestMinusCalibrated > 0).length,
    uniqueWinningPlanStates: comparisons.filter(c => c.tiedBestPlanIds.length === 1).length,
    chosenBestCounts: Object.fromEntries(PLANS.map(plan => [plan.id, comparisons.filter(c => c.bestPlanId === plan.id).length])),
  };
}

export function summarizeAudit(result) {
  const pairs = result.cases.flatMap(c => Object.entries(c.histories).map(([history, h]) => {
    const held = h.held.map(branch => ({ planId: branch.planId, ...branch.summary }));
    const best = catalogBest(held), calibrated = held.find(branch => branch.planId === c.calibratedPlanId);
    return {
      ...identity(c), history, held, calibratedPlanId: c.calibratedPlanId,
      bestHeldOnThisSchedule: { planId: best.planId, meanDamage: best.meanDamage },
      realized: {
        baseline: h.reference.summary.meanDamage, calibratedHeld: calibrated.meanDamage,
        bestHeldOnThisSchedule: best.meanDamage, greedy: h.greedy.summary.meanDamage,
        greedyMinusBaseline: h.greedy.summary.meanDamage - h.reference.summary.meanDamage,
        greedyMinusCalibratedHeld: h.greedy.summary.meanDamage - calibrated.meanDamage,
        greedyMinusBestHeldOnThisSchedule: h.greedy.summary.meanDamage - best.meanDamage,
      },
      greedy: h.greedy.summary,
      localReferenceStates: localSummary(h.reference.steps),
      localReferenceBySide: Object.fromEntries([0, 1].map(side => [side, localSummary(h.reference.steps.filter(step => step.side === side))])),
    };
  }));
  const aggregate = rows => ({
    pairs: rows.length,
    realized: Object.fromEntries(Object.keys(rows[0].realized).map(key => [key, mean(rows.map(row => row.realized[key]))])),
    heldMeans: PLANS.map(plan => ({ planId: plan.id, meanDamage: mean(rows.map(row => row.held.find(h => h.planId === plan.id).meanDamage)) })),
    localReference: Object.fromEntries(['meanBestNextFightDamage', 'meanBestMinusBaseline', 'meanBestMinusCalibrated'].map(key => [key, mean(rows.map(row => row.localReferenceStates[key]))])),
  });
  const overall = aggregate(pairs), bestAggregateHeld = catalogBest(overall.heldMeans);
  return {
    schema: 1, id: DESIGN.id, resultsSha256: sha(result), provenance: result.provenance,
    scope: DESIGN.scope, information: DESIGN.information, localOpportunity: DESIGN.localOpportunity,
    selection: DESIGN.selection, weighting: DESIGN.weighting, accounting: DESIGN.accounting,
    independentDevelopmentWorlds: result.cases.length, simulations: result.simulations,
    overall: { ...overall, bestAggregateHeld, greedyMinusBestAggregateHeld: overall.realized.greedy - bestAggregateHeld.meanDamage },
    byHistory: Object.fromEntries(HISTORIES.map(history => [history, aggregate(pairs.filter(pair => pair.history === history))])),
    pairs,
  };
}

export function computeAudit({ evidence, provenance }, { log = () => {} } = {}) {
  const original = sha(evidence), counts = Object.fromEntries(COUNTERS.map(key => [key, 0]));
  const cases = evidence.cases.map((c, i) => {
    const audited = auditCase(c, evidence.protocol, evidence.calibration[i].selection.planId, { log });
    for (const key of COUNTERS) counts[key] += audited.counts[key];
    return audited.record;
  });
  assert.equal(sha(evidence), original, 'Audit mutated original evidence');
  const result = {
    schema: 1, design: structuredClone(DESIGN), catalog: structuredClone(PLANS), provenance,
    warmupRounds: evidence.protocol.warmupRounds, postRounds: evidence.protocol.postRounds,
    simulations: {
      byCategory: counts, totalPhysicalFights: sum(Object.values(counts)),
      probeFights: counts.checkpointProbes + counts.referenceProbes + counts.greedyProbes,
      committedTrajectoryFights: counts.heldCommitted + counts.referenceCommitted + counts.greedyCommitted,
      reusedWarmupFights: sum(evidence.cases.map(c => c.training.rows.length)), newWarmupFights: 0,
      inheritedV2CalibrationFights: evidence.protocol.budget.calibrationFights, newCalibrationFights: 0,
      modelCalls: 0,
    },
    cases,
  };
  verifyAuditStructure(result);
  return result;
}

export async function checkUnchanged(loaded) {
  assert.deepEqual(await fingerprintFile(loaded.inputPath), { bytes: loaded.provenance.input.bytes, sha256: loaded.provenance.input.sha256 }, 'Input artifact changed during audit');
  assert.deepEqual(await sourceFingerprints(), loaded.provenance.sources, 'Source artifact changed during audit');
}

function isWithin(path, parent) {
  const rel = relative(parent, path);
  return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export async function prepareOutputDirectory(out) {
  assert.ok(typeof out === 'string' && out.length, 'Explicit --out <new-directory> required');
  const dir = resolve(ROOT, out);
  try { await lstat(dir); throw Error('Output exists; use a new directory (no overwrite or resume)'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let ancestor = dirname(dir), canonical;
  for (;;) {
    try { canonical = resolve(await realpath(ancestor), relative(ancestor, dir)); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; ancestor = dirname(ancestor); }
  }
  const temp = await realpath('/tmp'), target = resolve(await realpath(ROOT), 'target');
  assert.ok(isWithin(canonical, temp) || isWithin(canonical, target), 'Output must be a new directory under /tmp or repository target; evidence/source paths and escaping symlinks are forbidden');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function runAudit({ out, input = DEFAULT_INPUT, log = () => {} }) {
  const loaded = await loadEvidence(input), dir = await prepareOutputDirectory(out);
  const results = computeAudit(loaded, { log });
  await checkUnchanged(loaded);
  const summary = summarizeAudit(results);
  await writeFile(resolve(dir, 'results.json'), `${JSON.stringify(results)}\n`, { flag: 'wx' });
  await writeFile(resolve(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  return { results, summary, directory: dir };
}

export async function replayAudit(file, { input = DEFAULT_INPUT, log = () => {} } = {}) {
  const recorded = JSON.parse(await readFile(resolve(ROOT, file), 'utf8'));
  verifyAuditStructure(recorded);
  const loaded = await loadEvidence(input);
  assert.deepEqual(recorded.provenance, loaded.provenance, 'Replay source/input/runtime fingerprints differ');
  const replayed = computeAudit(loaded, { log });
  assert.deepEqual(recorded, replayed, 'Physical replay differs');
  await checkUnchanged(loaded);
  return { verified: true, resultsSha256: sha(recorded), totalPhysicalFightsReplayed: replayed.simulations.totalPhysicalFights,
    byCategory: replayed.simulations.byCategory, modelCallsMade: 0, scope: 'Offline deterministic replay of this privileged development diagnostic; no agent predictions or global optimality claim.' };
}

const USAGE = `Offline seven-plan development audit (Node.js 24; existing compile:agentic output required).
  node scripts/audit-agentic-menu-v1.mjs --out /tmp/menu-audit-v1
  node scripts/audit-agentic-menu-v1.mjs --out target/menu-audit-v1 [--input results.json.gz]
  node scripts/audit-agentic-menu-v1.mjs --verify /tmp/menu-audit-v1/results.json [--input results.json.gz]
All schedules/checkpoints come from completed v2 evidence. Full run: 2,236 physical fights,
including 1,372 probes and 864 separately executed trajectory fights; zero live model calls.
Output directories must be new. Replay performs and reports another 2,236 simulations.`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), options = {};
  try {
    if (args.length === 1 && args[0] === '--help') console.log(USAGE);
    else {
      for (let i = 0; i < args.length; i++) {
        const key = { '--out': 'out', '--input': 'input', '--verify': 'verify' }[args[i]];
        assert.ok(key && args[i + 1] && !args[i + 1].startsWith('--') && !Object.hasOwn(options, key), USAGE);
        options[key] = args[++i];
      }
      assert.ok(Boolean(options.out) !== Boolean(options.verify), USAGE);
      const log = value => console.error(JSON.stringify(value));
      if (options.verify) console.log(JSON.stringify(await replayAudit(options.verify, { input: options.input, log }), null, 2));
      else {
        const { summary, directory } = await runAudit({ ...options, log });
        console.log(JSON.stringify({ directory, simulations: summary.simulations, overall: summary.overall, scope: summary.scope }, null, 2));
      }
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
