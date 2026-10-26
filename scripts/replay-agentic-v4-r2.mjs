import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, isAbsolute } from 'node:path';
import { ROOT } from './agentic-v4/io.mjs';
import { PLANS, sha, mean, decisionFrom, validateDecision, schedule } from './agentic-v2/design.mjs';
import { observation, algorithmDecision, surveySchedule } from './agentic-v4/design.mjs';
import { summarize } from './agentic-v4/trial.mjs';

const args = process.argv.slice(2);
assert.ok(args.length === 2 && args.every(Boolean), 'Use <results.json[.gz]> <new-view.html>');
const [input, output] = args;
const bytes = await readFile(resolve(ROOT, input));
const results = JSON.parse((input.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
const p = results.protocol;
assert.equal(p?.id, 'agentic-npc-matched-v4', 'Expected the v4 matched-experience study');
assert.ok(!results.incomplete, 'A standalone study viewer requires complete results');
assert.equal(p.agentReplicates, 2, 'Expected two model repetitions');
assert.equal(p.postRounds, 24, 'Expected 24 evaluation fights per branch');
assert.equal(p.warmupRounds, 10, 'Expected ten warmups');
assert.equal(p.cases.length, 2, 'Expected two familiar development cases');
assert.deepEqual([...p.histories].sort(), ['recurring', 'stable']);
assert.ok(p.gate == null, 'This study has no execution gate');
if (results.protocolSha256) assert.equal(results.protocolSha256, sha(p), 'Protocol hash differs');
if (results.sourcesSha256) assert.equal(results.sourcesSha256, sha(results.sources), 'Source manifest hash differs');
const caseKey = c => JSON.stringify([c.seed, c.index]);
assert.equal(new Set(results.cases.map(caseKey)).size, results.cases.length, 'Duplicate cases');
assert.deepEqual(results.cases.map(caseKey).sort(), p.cases.map(caseKey).sort(), 'Missing protocol cases');

const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));
const bounded = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const numeric = value => Number.isFinite(value) && value >= 0 ? value : null;
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 512 &&
  !isAbsolute(path) && !path.startsWith('\\') && !path.includes(':') && !path.split(/[\\/]/).includes('..');
const telemetry = rows => (rows ?? []).map(r => pick(r, ['role', 'visibleSeconds', 'meanVisibleSpeed', 'stoppedFraction', 'meanVisibleRange', 'shotsFired', 'hits']));
const publicFrame = f => {
  assert.ok([f.player?.x, f.player?.y, f.player?.hp].every(Number.isFinite), 'Invalid recorded player state');
  assert.ok(typeof f.active === 'boolean' && Array.isArray(f.enemies) && f.enemies.length > 0 && Array.isArray(f.bullets), 'Invalid recorded frame');
  for (const e of f.enemies) assert.ok([e.x, e.y, e.hp, e.windup, e.target?.x, e.target?.y].every(Number.isFinite), 'Invalid recorded NPC state');
  for (const b of f.bullets) assert.ok([b.x, b.y].every(Number.isFinite) && (b.enemy === null || Number.isInteger(b.enemy)), 'Invalid recorded projectile');
  return {
    time: f.time, active: f.active, player: pick(f.player, ['x', 'y', 'hp']),
    enemies: f.enemies.map(e => ({ ...pick(e, ['id', 'role', 'tactic', 'x', 'y', 'hp', 'windup']), target: pick(e.target, ['x', 'y']) })),
    bullets: f.bullets.map(b => pick(b, ['x', 'y', 'enemy'])),
  };
};
const publicFight = f => ({
  round: f.round, planId: f.planId, tactic: f.choice?.action,
  feedback: pick(f.feedback, ['observed', 'reward']),
  physical: {
    ...pick(f.physical, ['damage', 'duration', 'result']),
    enemies: f.physical.enemies.map(e => pick(e, ['role', 'hp', 'damage'])),
    npcTelemetry: telemetry(f.physical.npcTelemetry),
  },
  ...(Array.isArray(f.frames) && f.frames.length ? { frames: f.frames.map(publicFrame) } : {}),
});

// The diagnostic fixed plan is inherited from v2, never selected from v4.
assert.ok(safePath(p.fixedReference?.summary), 'Expected a repository-relative prior summary');
const prior = JSON.parse(await readFile(resolve(ROOT, p.fixedReference.summary), 'utf8'));
assert.equal(prior.id, 'agentic-npc-ablation-v2', 'Expected the prior v2 summary');
assert.equal(results.fixedReferenceSha256, sha(prior), 'Prior fixed-reference summary hash differs');
assert.equal(p.fixedReference.previousCalibrationFights, prior.calibrationFights, 'Prior calibration budget differs');
assert.equal(prior.calibrationFights, 1384, 'Expected the previously reported calibration experience');
assert.equal(p.budget?.newCalibrationFights, 0, 'v4 must not add separate calibration fights');
const selection = new Map(p.fixedReference.plans.map(c => [caseKey(c), c]));
assert.equal(selection.size, results.cases.length, 'Expected one prior fixed selection per case');
const fixedReference = {
  summary: p.fixedReference.summary, sha256: results.fixedReferenceSha256,
  previousCalibrationFights: prior.calibrationFights,
  selection: p.fixedReference.plans.map(c => {
    const previous = prior.selection.find(x => caseKey(x) === caseKey(c));
    assert.equal(previous?.planId, c.planId, 'Fixed plan differs from prior v2 selection');
    return { seed: c.seed, index: c.index, planId: c.planId,
      means: previous.means.map(m => pick(m, ['planId', 'meanDamage'])),
      tieBreak: bounded(previous.tieBreak, 300), calibrationSha256: previous.calibrationSha256 };
  }),
};

// Provider envelopes can contain prompts, sessions, stdout and command-line
// arguments. Export only the same public metadata allowlist as the v3 viewer.
const journal = new Map();
const calls = results.calls.map(c => {
  assert.ok(typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 512 && !journal.has(c.id), 'Duplicate or invalid call ID');
  journal.set(c.id, c);
  assert.equal(c.id, sha(c.key), 'Call identity differs from journal key hash');
  assert.ok(['ok', 'error'].includes(c.response?.status), 'Unknown call status');
  const m = c.response.metadata ?? {};
  let validDecision = false;
  try { validateDecision(c.response.decision); validDecision = true; } catch { /* Executed fallback is checked below. */ }
  return {
    id: c.id, observationSha256: c.observationSha256, dispatched: c.dispatched === true,
    status: c.response.status, errorCode: bounded(c.response.error?.code, 100),
    validDecision, fallback: c.response.status !== 'ok' || !validDecision,
    metadata: {
      durationMs: numeric(m.durationMs), costUsd: numeric(m.costUsd),
      models: (Array.isArray(m.models) ? m.models : []).filter(x => typeof x === 'string').slice(0, 16).map(x => bounded(x, 128)),
      fallbackApplied: m.fallbackApplied === true,
    },
  };
});
const usedCalls = new Set();
const requiredBranches = ['retained:0', 'fixed:0', 'algorithm:0', 'algorithm-initial:0', 'agent:1', 'agent-initial:1', 'agent:2', 'agent-initial:2'].sort();
let recordedFights = 0;
const cases = results.cases.map(c => {
  assert.ok(selection.has(caseKey(c)), 'Missing prior fixed plan');
  const t = c.training;
  assert.equal(t.warmup.rows.length, p.warmupRounds, 'Incomplete warmup history');
  assert.deepEqual(t.survey.schedule, surveySchedule(c, p), 'Preparation survey differs from protocol');
  assert.ok(t.survey.rows.length > 0, 'Missing shared plan survey');
  assert.equal(t.survey.rows.length, t.survey.schedule.length, 'Incomplete survey history');
  assert.deepEqual(t.rows, [...t.warmup.rows, ...t.survey.rows], 'Preparation history is not chronological warmup plus survey');
  for (const [i, f] of t.rows.entries()) {
    assert.equal(f.round, i + 1, 'Preparation clock differs');
    assert.ok(Number.isFinite(f.physical.damage), 'Missing preparation damage');
    assert.equal(f.planId, i < p.warmupRounds ? 'baseline' : t.survey.schedule[i - p.warmupRounds].planId, 'Preparation plan differs');
    assert.ok(!f.frames?.length, 'Preparation must not add replay recordings');
  }
  const counts = PLANS.map(plan => t.survey.rows.filter(f => f.planId === plan.id).length);
  assert.ok(counts[0] > 0 && counts.every(n => n === counts[0]), 'Survey must allocate equally to every plan');
  assert.deepEqual(Object.keys(c.histories).sort(), [...p.histories].sort());
  return {
    seed: c.seed, index: c.index,
    preparation: {
      warmupRounds: t.warmup.rows.length, surveyRounds: t.survey.rows.length, rounds: t.rows.length,
      checkpointSha256: sha(t.checkpoint), rows: t.rows.map(publicFight),
      plans: PLANS.map(plan => {
        const rows = t.survey.rows.filter(f => f.planId === plan.id), observed = rows.filter(f => f.feedback.observed);
        return { planId: plan.id, fights: rows.length, observed: observed.length,
          meanDamage: mean(rows.map(f => f.physical.damage)),
          meanObservedDamage: mean(observed.map(f => f.physical.enemies.find(e => e.role === 'ranger').damage)) };
      }),
    },
    histories: Object.fromEntries(Object.entries(c.histories).map(([history, branches]) => {
      assert.deepEqual(branches.map(b => `${b.arm}:${b.replicate}`).sort(), requiredBranches, `Expected all eight branches: ${caseKey(c)} ${history}`);
      for (const [arm, replicate] of [['algorithm', 0], ['agent', 1], ['agent', 2]]) {
        const active = branches.find(b => b.arm === arm && b.replicate === replicate);
        const held = branches.find(b => b.arm === `${arm}-initial` && b.replicate === replicate);
        assert.equal(held.planId, active.rows[0].decision.planId, 'Held initial plan differs from first selection');
        assert.deepEqual(held.rows[0], active.rows[0].fight, 'Active and held-initial first fights differ');
        assert.equal(held.originCallId, active.rows[0].callId, 'Held initial origin differs');
      }
      return [history, branches.map(b => {
        assert.equal(b.rows.length, p.postRounds, 'Incomplete evaluation branch');
        assert.equal(b.schedule.length, p.postRounds, 'Incomplete replay schedule');
        assert.deepEqual(b.schedule, branches[0].schedule, 'Paired schedules differ');
        assert.deepEqual(b.schedule, schedule(c, p, history), 'Evaluation schedule differs from protocol');
        assert.deepEqual(b.initial, t.checkpoint, 'Branch does not start from the shared preparation checkpoint');
        if (b.arm === 'fixed') assert.equal(b.planId, selection.get(caseKey(c)).planId, 'Fixed plan differs from prior selection');
        if (b.arm === 'retained') assert.equal(b.planId, 'baseline', 'Retained plan differs from baseline');
        const active = b.arm === 'agent' || b.arm === 'algorithm';
        if (active) assert.ok(b.planId == null, 'Active branch cannot declare a held plan');
        if (b.arm !== 'agent-initial') assert.ok(b.originCallId == null, 'Only held-agent controls can reference an origin call');
        return {
          arm: b.arm, replicate: b.replicate, planId: b.planId ?? null, originCallId: b.originCallId ?? null,
          schedule: b.schedule.map(s => ({ round: s.round, side: s.side, probabilityB: s.probabilityB,
            walls: s.scenario.world.walls.map(w => pick(w, ['x', 'y', 'w', 'h'])) })),
          rows: b.rows.map((row, i) => {
            const f = active ? row.fight : row;
            const currentPlanId = i ? (b.rows[i - 1].fight ?? b.rows[i - 1]).planId : t.rows.at(-1).planId;
            const captured = Array.isArray(f.frames) && f.frames.length > 0;
            assert.equal(captured, i === 0 || i === b.rows.length - 1, `Expected first/final captures only: ${caseKey(c)} ${history} ${b.arm}/${b.replicate} round ${i + 1}`);
            if (captured) {
              recordedFights++;
              assert.ok(f.frames.every((frame, j) => Number.isFinite(frame.time) && (j === 0 || frame.time > f.frames[j - 1].time)), 'Invalid replay clock');
            }
            let expected = null;
            if (active) {
              assert.equal(row.postRound, i + 1, 'Post-round index differs');
              assert.ok(row.gate == null, 'An active selector cannot have a gate');
              const previousMemory = i ? b.rows[i - 1].decision.memory : '';
              expected = observation([...t.rows, ...b.rows.slice(0, i).map(r => r.fight)], currentPlanId, previousMemory, p);
              assert.deepEqual(Object.keys(expected).sort(), ['schema', 'objective', 'nextRound', 'preparationRounds', 'currentPlanId', 'plans', 'rules', 'history', 'memory'].sort(), 'Observation fields differ from public allowlist');
              assert.deepEqual(row.observation, expected, 'Expected full own-history, actual current plan, clock, menu and private previous note');
              assert.equal(row.observationSha256, sha(row.observation), 'Row observation hash differs');
              if (b.arm === 'agent') {
                const call = journal.get(row.callId);
                assert.ok(call, 'Missing agent call');
                assert.deepEqual(call.key, { caseSeed: c.seed, caseIndex: c.index, history, replicate: b.replicate, arm: 'agent', round: i + 1 }, 'Journal call belongs to a different trajectory or round');
                assert.ok(!usedCalls.has(row.callId), 'Each agent decision must have its own journal call');
                usedCalls.add(row.callId);
                assert.equal(call.observationSha256, row.observationSha256, 'Journal observation hash differs');
                assert.deepEqual(call.observation, row.observation, 'Journal observation differs');
                assert.deepEqual(row.decision, decisionFrom(call.response, currentPlanId, previousMemory), 'Recorded decision differs from call or fallback');
              } else {
                assert.equal(row.callId, null, 'Algorithm must not make a model call');
                assert.deepEqual(row.decision, algorithmDecision(expected, p.selector), 'Algorithm decision differs from deterministic selector');
              }
              validateDecision(row.decision);
              assert.equal(f.planId, row.decision.planId, 'Fight differs from applied decision');
              assert.equal(row.changed, f.planId !== currentPlanId, 'Applied-plan change differs');
            } else assert.equal(f.planId, b.planId, 'Held control changed its complete plan');
            assert.equal(f.round, t.rows.length + i + 1, 'Physical round differs from preparation plus evaluation clock');
            assert.ok(Number.isFinite(f.physical.damage), 'Missing measured NPC damage');
            return { postRound: i + 1, decision: active ? row.decision : null,
              // Reconstruct from the trusted observation builder, not a raw
              // journal spread; the exact object is checked above before export.
              observation: expected, observationSha256: active ? row.observationSha256 : null,
              callId: active ? row.callId : null, changed: f.planId !== currentPlanId, fight: publicFight(f) };
          }),
        };
      })];
    })),
  };
});
const expectedRecordedFights = p.cases.length * p.histories.length * requiredBranches.length * 2;
assert.equal(recordedFights, expectedRecordedFights, 'Missing first/final fight recordings');
assert.equal(recordedFights, 64, 'The registered two-case study requires 64 recordings');
assert.equal(usedCalls.size, calls.length, 'Unreferenced journal calls');
assert.equal(calls.length, p.cases.length * p.histories.length * p.agentReplicates * p.postRounds, 'Incomplete call journal');
assert.equal(calls.length, 192, 'Expected 192 unique model requests');

const template = await readFile(new URL('./agentic-v4/view-r2.html', import.meta.url), 'utf8');
assert.equal(template.split('__DATA__').length, 2, 'Expected one data placeholder');
const summary = summarize(results);
assert.equal(summary.preparationFights, cases.reduce((n, c) => n + c.preparation.rounds, 0), 'Summary preparation count differs');
assert.equal(summary.evaluationFights, 768, 'Expected 768 evaluation fights');
assert.equal(summary.scoredFights, summary.preparationFights + summary.evaluationFights, 'Summary physical-fight count differs');
for (const [key, expected] of [['preparationFights', summary.preparationFights], ['evaluationFights', summary.evaluationFights], ['uniqueModelRequests', calls.length]]) {
  if (p.budget[key] !== undefined) assert.equal(p.budget[key], expected, `Protocol budget ${key} differs`);
}
// Cost/latency must not silently treat unavailable measurements as zero.
const costs = calls.map(c => c.metadata.costUsd), durations = calls.map(c => c.metadata.durationMs).filter(Number.isFinite).sort((a, b) => a - b);
Object.assign(summary, {
  models: [...new Set(calls.flatMap(c => c.metadata.models))],
  fallbackCalls: calls.filter(c => c.fallback).length,
  knownReportedCostUsd: costs.filter(Number.isFinite).reduce((a, b) => a + b, 0),
  reportedCostUsd: costs.every(Number.isFinite) ? costs.reduce((a, b) => a + b, 0) : null,
  unknownCostCalls: costs.filter(x => !Number.isFinite(x)).length,
  knownMeanLatencyMs: mean(durations), unknownLatencyCalls: calls.length - durations.length,
  meanLatencyMs: durations.length === calls.length ? mean(durations) : null,
  p95LatencyMs: durations.length === calls.length ? durations[Math.ceil(durations.length * .95) - 1] : null,
});
const data = {
  protocol: p, summary, fixedReference, cases, calls, recordedFights,
  fixture: results.fixture === true || results.testFixture === true,
  resultsSha256: sha(results), inputBytesSha256: sha(bytes), protocolSha256: sha(p), sourcesSha256: sha(results.sources ?? {}),
  sources: Object.fromEntries(Object.entries(results.sources ?? {}).filter(([path, hash]) =>
    safePath(path) && typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash))),
  viewerSources: {
    'scripts/replay-agentic-v4-r2.mjs': sha(await readFile(new URL(import.meta.url))),
    'scripts/agentic-v4/view-r2.html': sha(template),
    'scripts/agentic-v4/design.mjs': sha(await readFile(new URL('./agentic-v4/design.mjs', import.meta.url))),
    'scripts/agentic-v4/trial.mjs': sha(await readFile(new URL('./agentic-v4/trial.mjs', import.meta.url))),
  },
};
const safe = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
// A callback also preserves literal $&, $` and $' in recorded model text.
await writeFile(resolve(ROOT, output), template.replace('__DATA__', () => safe), { flag: 'wx' });
console.log(JSON.stringify({ written: output, resultsSha256: data.resultsSha256, fixedReferenceSha256: fixedReference.sha256,
  recordedFights, expectedRecordedFights, preparationFights: summary.preparationFights, evaluationFights: summary.evaluationFights,
  scoredFights: summary.scoredFights, recordedCalls: calls.length, reusedCalibrationFights: prior.calibrationFights }));
