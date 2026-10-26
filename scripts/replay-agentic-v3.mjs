import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, isAbsolute } from 'node:path';
import { ROOT } from './agentic-v3/io.mjs';
import { sha, observation, decisionFrom, validateDecision, initialGate, applyGate } from './agentic-v3/design.mjs';
import { summarize } from './agentic-v3/trial.mjs';

const args = process.argv.slice(2);
assert.ok(args.length === 2 && args.every(Boolean), 'Use <results.json[.gz]> <new-view.html>');
const [input, output] = args;
const bytes = await readFile(resolve(ROOT, input));
const results = JSON.parse((input.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
const p = results.protocol;
assert.equal(p?.id, 'agentic-npc-switching-v3', 'Expected the v3 NPC switching study');
assert.ok(!results.incomplete, 'A standalone study viewer requires complete results');
assert.equal(p.agentReplicates, 2, 'Expected two paired agent repetitions');
assert.equal(p.gate?.minimumObservedFights, 3, 'Expected the registered three-observed-fight gate');
assert.ok(Number.isInteger(p.postRounds) && p.postRounds >= 2, 'Expected distinct first and final fights');
assert.deepEqual([...p.histories].sort(), ['recurring', 'stable']);
if (results.protocolSha256) assert.equal(results.protocolSha256, sha(p), 'Protocol hash differs');
const caseKey = c => `${c.seed}/${c.index}`;
assert.equal(new Set(results.cases.map(caseKey)).size, results.cases.length, 'Duplicate cases');
assert.deepEqual(results.cases.map(caseKey).sort(), p.cases.map(caseKey).sort(), 'Missing protocol cases');

const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));
const bounded = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 512 &&
  !isAbsolute(path) && !path.startsWith('\\') && !path.includes(':') && !path.split(/[\\/]/).includes('..');
const telemetry = rows => (rows ?? []).map(r => pick(r, ['role', 'visibleSeconds', 'meanVisibleSpeed', 'stoppedFraction', 'meanVisibleRange', 'shotsFired', 'hits']));
const evidence = obs => ({
  ...pick(obs, ['nextRound', 'currentPlanId']), memory: bounded(obs.memory, 3000),
  history: obs.history.map(r => ({
    ...pick(r, ['round', 'planId', 'tactic', 'reward', 'observed', 'npcDamage', 'npcRemainingHealth', 'duration']),
    telemetry: telemetry(r.telemetry),
  })),
});
const decision = d => ({
  planId: bounded(d.planId, 80), reason: bounded(d.reason, 1000),
  prediction: bounded(d.prediction, 600), memory: bounded(d.memory, 3000),
});

// The fixed comparator was selected before the prior v2 evaluation. Read and
// fingerprint that existing summary; never calibrate or run a fight here.
assert.ok(safePath(p.fixedReference?.summary), 'Expected a repository-relative prior summary');
const prior = JSON.parse(await readFile(resolve(ROOT, p.fixedReference.summary), 'utf8'));
assert.equal(prior.id, 'agentic-npc-ablation-v2', 'Expected the prior v2 summary');
assert.equal(results.fixedReferenceSha256, sha(prior), 'Prior fixed-reference summary hash differs');
assert.equal(p.fixedReference.previousCalibrationFights, prior.calibrationFights, 'Prior calibration budget differs');
assert.equal(p.budget?.newCalibrationFights, 0, 'v3 must not add calibration fights');
const selection = new Map(p.fixedReference.plans.map(c => [caseKey(c), c]));
assert.equal(selection.size, results.cases.length, 'Expected one prior fixed selection per case');
const fixedReference = {
  summary: p.fixedReference.summary, sha256: results.fixedReferenceSha256,
  previousCalibrationFights: prior.calibrationFights,
  selection: p.fixedReference.plans.map(c => {
    const previous = prior.selection.find(x => caseKey(x) === caseKey(c));
    assert.equal(previous?.planId, c.planId, 'Fixed plan differs from prior v2 selection');
    return {
      seed: c.seed, index: c.index, planId: c.planId,
      means: previous.means.map(m => pick(m, ['planId', 'meanDamage'])),
      tieBreak: bounded(previous.tieBreak, 300), calibrationSha256: previous.calibrationSha256,
    };
  }),
};

// Raw journal envelopes can include provider prompts, sessions, stdout and
// arguments. Only these explicitly allowed metadata fields reach the viewer.
const journal = new Map();
const calls = results.calls.map(c => {
  assert.ok(typeof c.id === 'string' && c.id.length <= 512 && !journal.has(c.id), 'Duplicate or invalid call ID');
  journal.set(c.id, c);
  const m = c.response?.metadata ?? {};
  return {
    id: c.id, observationSha256: c.observationSha256, dispatched: c.dispatched === true,
    status: bounded(c.response?.status, 20), errorCode: bounded(c.response?.error?.code, 100),
    metadata: {
      durationMs: Number.isFinite(m.durationMs) ? m.durationMs : null,
      costUsd: Number.isFinite(m.costUsd) ? m.costUsd : null,
      models: (Array.isArray(m.models) ? m.models : []).filter(x => typeof x === 'string').slice(0, 16).map(x => bounded(x, 128)),
      fallbackApplied: m.fallbackApplied === true,
    },
  };
});
const usedCalls = new Map();
const requiredBranches = ['retained:0', 'fixed:0', 'initial:1', 'immediate:1', 'gated:1', 'initial:2', 'immediate:2', 'gated:2'].sort();
let recordedFights = 0;
const cases = results.cases.map(c => {
  assert.ok(selection.has(caseKey(c)), 'Missing prior fixed plan');
  assert.equal(c.training.rows.length, p.warmupRounds, 'Incomplete warmup history');
  assert.deepEqual(Object.keys(c.histories).sort(), [...p.histories].sort());
  return { seed: c.seed, index: c.index, histories: Object.fromEntries(Object.entries(c.histories).map(([history, branches]) => {
    assert.deepEqual(branches.map(b => `${b.arm}:${b.replicate}`).sort(), requiredBranches, `Expected all eight branches: ${caseKey(c)} ${history}`);
    for (let replicate = 1; replicate <= p.agentReplicates; replicate++) {
      const initial = branches.find(b => b.arm === 'initial' && b.replicate === replicate);
      const immediate = branches.find(b => b.arm === 'immediate' && b.replicate === replicate);
      const gated = branches.find(b => b.arm === 'gated' && b.replicate === replicate);
      assert.ok(journal.has(initial.originCallId), 'Missing shared-initial origin call');
      assert.equal(immediate.rows[0]?.callId, initial.originCallId, 'Immediate initial call is not shared');
      assert.equal(gated.rows[0]?.callId, initial.originCallId, 'Gated initial call is not shared');
      assert.deepEqual(immediate.rows[0].fight, gated.rows[0].fight, 'Paired first fights differ');
      assert.deepEqual(initial.rows[0], gated.rows[0].fight, 'Held-initial first fight differs');
    }
    return [history, branches.map(b => {
      assert.equal(b.rows.length, p.postRounds, 'Incomplete evaluation branch');
      assert.equal(b.schedule.length, p.postRounds, 'Incomplete replay schedule');
      assert.deepEqual(b.schedule, branches[0].schedule, 'Paired schedules differ');
      if (b.arm === 'fixed') assert.equal(b.planId, selection.get(caseKey(c)).planId, 'Fixed plan differs from prior selection');
      if (b.arm === 'retained') assert.equal(b.planId, 'baseline', 'Retained plan differs from baseline');
      const agent = b.arm === 'immediate' || b.arm === 'gated';
      let state = initialGate();
      return {
        arm: b.arm, replicate: b.replicate, planId: b.planId ?? null, originCallId: b.originCallId ?? null,
        schedule: b.schedule.map(s => ({ round: s.round, side: s.side, probabilityB: s.probabilityB, walls: s.scenario.world.walls })),
        rows: b.rows.map((row, i) => {
          const f = agent ? row.fight : row;
          const currentPlanId = i ? (b.rows[i - 1].fight ?? b.rows[i - 1]).planId : 'baseline';
          const captured = Array.isArray(f.frames) && f.frames.length > 0;
          assert.equal(captured, i === 0 || i === b.rows.length - 1, `Expected first/final captures only: ${caseKey(c)} ${history} ${b.arm}/${b.replicate} round ${i + 1}`);
          if (captured) recordedFights++;
          if (agent) {
            assert.equal(row.postRound, i + 1, 'Post-round index differs');
            const call = journal.get(row.callId);
            assert.ok(call, 'Missing agent call');
            const previousMemory = i ? b.rows[i - 1].decision.memory : '';
            const expected = observation([...c.training.rows, ...b.rows.slice(0, i).map(r => r.fight)], currentPlanId, previousMemory, i === 0);
            assert.deepEqual(row.observation, expected, 'Expected full own-history, actual current plan and previous note');
            assert.equal(row.observationSha256, sha(row.observation), 'Row observation hash differs');
            assert.equal(call.observationSha256, row.observationSha256, 'Journal observation hash differs');
            assert.deepEqual(call.observation, row.observation, 'Journal observation differs');
            assert.deepEqual(row.decision, decisionFrom(call.response, currentPlanId, previousMemory), 'Recorded recommendation differs from call');
            let successful = call.response.status === 'ok';
            try { validateDecision(call.response.decision); } catch { successful = false; }
            const expectedGate = applyGate(state, currentPlanId, row.decision, successful, i === 0, b.arm, p.gate);
            if (f.feedback.observed) expectedGate.after.observedOnPlan++;
            assert.deepEqual(row.gate, expectedGate, 'Gate event differs from the registered exposure rule');
            assert.equal(f.planId, row.gate.executedPlanId, 'Fight differs from actually applied plan');
            assert.equal(row.changed, row.gate.changed, 'Applied-plan change differs');
            state = expectedGate.after;
            const references = usedCalls.get(row.callId) ?? [];
            references.push({ pair: `${caseKey(c)}/${history}/${b.replicate}`, round: i + 1 });
            usedCalls.set(row.callId, references);
          } else assert.equal(f.planId, b.planId, 'Held control changed its complete plan');
          assert.equal(f.round, p.warmupRounds + i + 1, 'Physical round differs');
          assert.ok(Number.isFinite(f.physical.damage), 'Missing measured NPC damage');
          return {
            postRound: i + 1, decision: agent ? decision(row.decision) : null,
            observation: agent ? evidence(row.observation) : null,
            observationSha256: agent ? row.observationSha256 : null,
            callId: agent ? row.callId : null,
            gate: agent ? {
              ...pick(row.gate, ['executedPlanId', 'changed', 'reason']),
              before: pick(row.gate.before, ['observedOnPlan']), after: pick(row.gate.after, ['observedOnPlan']),
            } : null,
            changed: f.planId !== currentPlanId,
            fight: {
              round: f.round, planId: f.planId, tactic: f.choice?.action,
              feedback: pick(f.feedback, ['observed', 'reward']),
              physical: {
                ...pick(f.physical, ['damage', 'duration', 'result']),
                enemies: f.physical.enemies.map(e => pick(e, ['role', 'hp', 'damage'])),
                npcTelemetry: telemetry(f.physical.npcTelemetry),
              },
              ...(captured ? { frames: f.frames } : {}),
            },
          };
        }),
      };
    })];
  })) };
});
const expectedRecordedFights = p.cases.length * p.histories.length * requiredBranches.length * 2;
assert.equal(recordedFights, expectedRecordedFights, 'Missing first/final fight recordings');
assert.equal(recordedFights, 64, 'The registered two-case study requires 64 recordings');
assert.equal(usedCalls.size, calls.length, 'Unreferenced journal calls');
for (const references of usedCalls.values()) {
  assert.equal(references.length, references[0].round === 1 ? 2 : 1, 'Only paired initial calls may be shared');
  assert.ok(references.every(r => r.pair === references[0].pair && r.round === references[0].round), 'Call shared across different pairs or rounds');
}
assert.equal(calls.length, p.cases.length * p.histories.length * p.agentReplicates * (1 + 2 * (p.postRounds - 1)), 'Incomplete call journal');

const template = await readFile(new URL('./agentic-v3/view.html', import.meta.url), 'utf8');
assert.equal(template.split('__DATA__').length, 2, 'Expected one data placeholder');
const summary = summarize(results);
// Supplement the trial summary with the requested immediate-minus-initial
// contrast, without changing the frozen trial or counting initial selections.
for (const aggregate of [summary.overall, ...Object.values(summary.byHistory), ...summary.pairs]) {
  aggregate.differences.immediateVsInitial = aggregate.means.immediate - aggregate.means.initial;
}
for (const pair of summary.pairs) for (const paired of pair.paired) {
  const immediate = pair.arms.immediate.find(b => b.replicate === paired.replicate);
  const initial = pair.arms.initial.find(b => b.replicate === paired.replicate);
  const gated = pair.arms.gated.find(b => b.replicate === paired.replicate);
  paired.immediateVsInitial = immediate.meanDamage - initial.meanDamage;
  paired.gatedVsFixed = gated.meanDamage - pair.means.fixed;
}
summary.models = [...new Set(calls.flatMap(c => c.metadata.models))];
const data = {
  protocol: p, summary, fixedReference, cases, calls, recordedFights,
  resultsSha256: sha(results), protocolSha256: sha(p), sourcesSha256: sha(results.sources ?? {}),
  sources: Object.fromEntries(Object.entries(results.sources ?? {}).filter(([path, hash]) =>
    safePath(path) && typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash))),
  viewerSources: {
    'scripts/replay-agentic-v3.mjs': sha(await readFile(new URL(import.meta.url))),
    'scripts/agentic-v3/view.html': sha(template),
  },
};
const safe = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
// A callback preserves literal $&, $` and $' in recorded model text.
await writeFile(resolve(ROOT, output), template.replace('__DATA__', () => safe), { flag: 'wx' });
console.log(JSON.stringify({ written: output, resultsSha256: data.resultsSha256, fixedReferenceSha256: fixedReference.sha256,
  recordedFights, expectedRecordedFights, newCalibrationFights: 0, reusedCalibrationFights: fixedReference.previousCalibrationFights,
  evaluationFights: summary.evaluationFights, recordedCalls: summary.recordedCalls }));
