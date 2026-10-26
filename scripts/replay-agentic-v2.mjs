import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve, isAbsolute } from 'node:path';
import { ROOT } from './agentic-v1/io.mjs';
import { sha } from './agentic-v1/design.mjs';
import { summarize } from './agentic-v2/trial.mjs';

const args = process.argv.slice(2);
assert.ok(args.length === 2 && args.every(Boolean), 'Use <results.json[.gz]> <new-view.html>');
const [input, output] = args;
const bytes = await readFile(resolve(ROOT, input));
const results = JSON.parse((input.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString());
const p = results.protocol;
assert.equal(p?.id, 'agentic-npc-ablation-v2', 'Expected the v2 NPC study');
assert.ok(!results.incomplete, 'A standalone study viewer requires complete results');
assert.equal(p.agentReplicates, 2, 'Expected two paired agent repetitions');
assert.ok(Number.isInteger(p.postRounds) && p.postRounds >= 2, 'Expected distinct first and final fights');
assert.deepEqual([...p.histories].sort(), ['recurring', 'stable']);
const caseKey = c => `${c.seed}/${c.index}`;
assert.equal(new Set(results.cases.map(caseKey)).size, results.cases.length, 'Duplicate cases');
assert.deepEqual(results.cases.map(caseKey).sort(), p.cases.map(caseKey).sort(), 'Missing protocol cases');

const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));
const bounded = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const telemetry = rows => (rows ?? []).map(r => pick(r, ['role', 'visibleSeconds', 'meanVisibleSpeed', 'stoppedFraction', 'meanVisibleRange', 'shotsFired', 'hits']));
const evidence = observation => observation ? {
  ...pick(observation, ['nextRound', 'currentPlanId']), memory: bounded(observation.memory, 3000),
  history: observation.history.map(r => ({
    ...pick(r, ['round', 'planId', 'tactic', 'reward', 'observed', 'npcDamage', 'npcRemainingHealth', 'duration']),
    telemetry: telemetry(r.telemetry),
  })),
} : null;
const decision = d => d ? {
  planId: bounded(d.planId, 80), reason: bounded(d.reason, 1000),
  prediction: bounded(d.prediction, 600), memory: bounded(d.memory, 3000),
} : null;

// Journal envelopes may contain provider prompts, stdout, arguments or sessions.
// Only this explicit, bounded metadata projection reaches the standalone HTML.
const journal = new Map();
const calls = results.calls.map(c => {
  assert.ok(typeof c.id === 'string' && !journal.has(c.id), 'Duplicate or missing call ID');
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
const selection = new Map(results.calibration.map(c => [caseKey(c.data), c.selection]));
assert.equal(selection.size, results.cases.length, 'Expected one calibration selection per case');
const requiredBranches = ['retained:0', 'fixed:0', 'initial:1', 'full:1', 'recent:1', 'initial:2', 'full:2', 'recent:2'].sort();
let recordedFights = 0;
const cases = results.cases.map(c => {
  assert.ok(selection.has(caseKey(c)), 'Missing calibrated plan');
  assert.deepEqual(Object.keys(c.histories).sort(), [...p.histories].sort());
  return { seed: c.seed, index: c.index, histories: Object.fromEntries(Object.entries(c.histories).map(([history, branches]) => {
    assert.deepEqual(branches.map(b => `${b.arm}:${b.replicate}`).sort(), requiredBranches, `Expected all eight branches: ${caseKey(c)} ${history}`);
    return [history, branches.map(b => {
      assert.equal(b.rows.length, p.postRounds, 'Incomplete evaluation branch');
      assert.equal(b.schedule.length, p.postRounds, 'Incomplete replay schedule');
      if (b.arm === 'fixed') assert.equal(b.planId, selection.get(caseKey(c)).planId, 'Fixed plan differs from calibration');
      if (b.arm === 'initial') assert.ok(journal.has(b.originCallId), 'Missing held-initial origin call');
      const agent = b.arm === 'full' || b.arm === 'recent';
      return {
        arm: b.arm, replicate: b.replicate, planId: b.planId ?? null, originCallId: b.originCallId ?? null,
        // Only replay geometry and evaluator-side schedule labels are needed.
        schedule: b.schedule.map(s => ({ round: s.round, side: s.side, probabilityB: s.probabilityB, walls: s.scenario.world.walls })),
        rows: b.rows.map((row, i) => {
          const f = agent ? row.fight : row;
          const captured = Array.isArray(f.frames) && f.frames.length > 0;
          assert.equal(captured, i === 0 || i === b.rows.length - 1, `Expected first/final captures only: ${caseKey(c)} ${history} ${b.arm}/${b.replicate} round ${i + 1}`);
          if (captured) recordedFights++;
          if (agent) {
            assert.equal(row.postRound, i + 1, 'Post-round index differs');
            const call = journal.get(row.callId);
            assert.ok(call, 'Missing agent call');
            assert.equal(row.observationSha256, sha(row.observation), 'Row observation hash differs');
            assert.equal(call.observationSha256, row.observationSha256, 'Journal observation hash differs');
          }
          assert.ok(Number.isFinite(f.physical.damage), 'Missing measured NPC damage');
          return {
            postRound: i + 1, decision: agent ? decision(row.decision) : null,
            observation: agent ? evidence(row.observation) : null,
            observationSha256: agent ? row.observationSha256 : null,
            callId: agent ? row.callId : null,
            changed: f.planId !== (i ? (b.rows[i - 1].fight ?? b.rows[i - 1]).planId : 'baseline'),
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
// The registered two-case study must embed 2 × 2 × 8 × 2 = 64 recordings.
if (p.cases.length === 2) assert.equal(recordedFights, 64);

const template = await readFile(new URL('./agentic-v2/view.html', import.meta.url), 'utf8');
assert.equal(template.split('__DATA__').length, 2, 'Expected one data placeholder');
const summary = summarize(results);
// Keep the summary's numerical analysis, but take model names from filtered metadata.
summary.models = [...new Set(calls.flatMap(c => c.metadata.models))];
const data = {
  protocol: p, summary, cases, calls, recordedFights,
  resultsSha256: sha(results), protocolSha256: sha(p), sourcesSha256: sha(results.sources ?? {}),
  sources: Object.fromEntries(Object.entries(results.sources ?? {}).filter(([path, hash]) =>
    path.length <= 512 && !isAbsolute(path) && !path.split(/[\\/]/).includes('..') && /^[a-f0-9]{64}$/i.test(hash))),
  viewerSources: {
    'scripts/replay-agentic-v2.mjs': sha(await readFile(new URL(import.meta.url))),
    'scripts/agentic-v2/view.html': sha(template),
  },
};
const safe = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
// A replacement callback preserves literal $&, $` and $' in recorded decisions.
await writeFile(resolve(ROOT, output), template.replace('__DATA__', () => safe), { flag: 'wx' });
console.log(JSON.stringify({ written: output, resultsSha256: data.resultsSha256, recordedFights, expectedRecordedFights,
  calibrationFights: summary.calibrationFights, evaluationFights: summary.evaluationFights, recordedCalls: summary.recordedCalls }));
