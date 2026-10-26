import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './evaluate-agentic-v2.mjs';
import { sha } from './agentic-v2/design.mjs';
import { startAgent, advanceAgent } from './agentic-v2/trial.mjs';
import { verify, verifyPartialAdmissions } from './verify-agentic-v2-partial.mjs';

const original = JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-ablation-v2.protocol.json', import.meta.url), 'utf8'));
const protocol = { ...original, cases: [original.cases[0]], postRounds: 4, calibrationReplicates: 1,
  agent: { ...original.agent, maxCalls: 28, maxReportedCostUsd: 10 } };
const providerSource = await readFile(new URL('./agentic-v1/provider.mjs', import.meta.url), 'utf8');
const systemPrompt = /const SYSTEM_PROMPT = `([^`]+)`;/.exec(providerSource)[1];

// A canned adapter envelope, never createClaudeProvider or a CLI executable.
// The real runner and journal create ordering, observations and durable partials.
function response(observation, p, fail = false) {
  const schema = JSON.stringify({ type: 'object', additionalProperties: false, properties: {
    planId: { type: 'string', enum: observation.plans.map(x => x.id) },
    reason: { type: 'string', maxLength: 500 }, prediction: { type: 'string', maxLength: 300 }, memory: { type: 'string', maxLength: 1500 },
  }, required: ['planId', 'reason', 'prediction', 'memory'] });
  const prompt = `Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(observation)}`;
  const call = { prompt, systemPrompt, schema, promptSha256: sha(prompt), systemPromptSha256: sha(systemPrompt), schemaSha256: sha(schema),
    args: ['--print', '--safe-mode', '--restricted', '--no-session-persistence', '--setting-sources', '',
      '--settings', '{"disableAllHooks":true,"enabledPlugins":{},"autoMemoryEnabled":false,"autoConnectIde":false,"enableAllProjectMcpServers":false}',
      '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--model', p.agent.model, '--effort', p.agent.effort,
      '--max-budget-usd', String(p.agent.maxBudgetUsdPerCall), '--max-turns', '1', '--output-format', 'json', '--input-format', 'text',
      '--system-prompt-snapshot', 'off', '--system-prompt', systemPrompt, '--json-schema', schema],
    sampling: 'CLI defaults; nondeterministic; no seed or temperature control' };
  return { status: fail ? 'error' : 'ok', decision: fail ? {
    planId: observation.currentPlanId, reason: 'Provider failed; retaining a supplied legal NPC plan.', prediction: '', memory: observation.memory,
  } : { planId: observation.nextRound === 11 ? 'lead' : 'far', reason: 'Use the recorded legal plan.', prediction: 'Measure the next fight.', memory: `Keep note after round ${observation.nextRound - 1}.` },
  metadata: { provider: p.agent.provider, requestedModel: p.agent.model, effort: p.agent.effort, cliVersion: '2.1.310',
    durationMs: fail ? 90010 : 1500, costUsd: fail ? null : .02, models: fail ? [] : [p.agent.model],
    timeoutMs: p.agent.timeoutMs, maxBudgetUsd: p.agent.maxBudgetUsdPerCall, maxOutputTokens: 2048,
    attempts: 1, retries: 0, fallbackApplied: fail, exitCode: fail ? null : 0, signal: fail ? 'SIGKILL' : null },
  call, ...(fail ? { error: { code: 'timeout', message: 'Claude CLI exceeded the request deadline; its process group was terminated.' } } : {}) };
}

let directory, partial, savedState;
const options = { allowProtocolOverride: true };
const ordered = r => [...r.calls].sort((a, b) => a.admissionOrder - b.admissionOrder);
const branch = (r, history = 'recurring', arm = 'full', replicate = 1) => r.cases[0].histories[history].find(b => b.arm === arm && b.replicate === replicate);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'agentic-v2-partial-'));
  let requests = 0;
  await assert.rejects(run({ out: directory, protocol, log: () => {}, provider: {
    async decide(observation) { return response(observation, protocol, ++requests > 8); },
  } }), /consecutive provider failures/);
  assert.equal(requests, 12, 'Eight canned successes and four concurrent timeouts; no live calls');
  partial = JSON.parse(await readFile(join(directory, 'partial.json'), 'utf8'));
  savedState = JSON.parse(await readFile(join(directory, 'calls/state.json'), 'utf8'));
  await assert.rejects(readFile(join(directory, 'results.json')), /ENOENT/);
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

test('replays a realistic stopped timeout wave, preserving successes, both fallback notes and unknown costs', async () => {
  const before = sha(partial), report = await verify(partial, options);
  assert.equal(sha(partial), before, 'Verification must not mutate recorded evidence');
  assert.equal(report.incomplete, true); assert.equal(report.effectivenessComparisonComplete, false);
  assert.equal(report.sourceHashesChecked, true); assert.equal(report.modelCallsMade, 0);
  assert.equal(report.calibrationFightsReplayed, 66); assert.equal(report.evaluationFightsReplayed, 58);
  assert.equal(report.totalPhysicalFightsReplayed, 124); assert.equal(report.agentFightsReplayed, 16);
  assert.equal(report.fallbackAgentFightsReplayed, 4); assert.equal(report.uniqueAgentDecisionsReplayed, 12);
  assert.equal(report.initializedPairs, 4); assert.equal(report.completedAgentBranches, 0);
  assert.ok(report.branchRounds.every(x => x.full === 2 && x.recent === 2));
  for (const [key, value] of Object.entries(savedState)) if (!['schema', 'limits'].includes(key)) assert.equal(report[key], value, `Journal summary: ${key}`);
  assert.equal(report.reportedCostUsd, null); assert.equal(report.unknownCostCalls, 4);
  assert.equal(report.stoppedReason, 'provider-failure-threshold');
  const full = branch(partial), recent = branch(partial, 'recurring', 'recent');
  assert.equal(full.rows[1].decision.planId, full.rows[0].decision.planId);
  assert.equal(full.rows[1].decision.memory, full.rows[0].decision.memory);
  assert.equal(recent.rows[1].decision.memory, '');
  assert.notEqual(full.rows[1].decision.reason, ordered(partial)[8].response.decision.reason, 'Provider fallback and trial fallback are separately preserved');
});

test('CLI defaults require the actual frozen protocol and exact source manifest', async () => {
  await assert.rejects(verify(partial), /frozen protocol/);
  for (const mutate of [
    r => { r.sources['scripts/agentic-v2/trial.mjs'] = '0'.repeat(64); },
    r => { delete r.sources['scripts/agentic-v2/journal.mjs']; },
  ]) {
    const r = structuredClone(partial); mutate(r);
    await assert.rejects(verify(r, options), /frozen source manifest/);
  }
});

test('rejects completed results even when relabeled incomplete', async () => {
  for (const mutate of [r => { r.incomplete = false; }, r => { r.completedAt = '2026-10-26T00:00:00Z'; },
    r => { r.protocol.postRounds = 2; r.protocolSha256 = sha(r.protocol); }]) {
    const r = structuredClone(partial); mutate(r);
    await assert.rejects(verify(r, options), /incomplete|completedAt|completed-study/);
  }
});

test('rejects malformed call records, changed provenance and corrupted exact replay', async t => {
  const corruptions = [
    ['protocol hash', r => { r.protocolSha256 = '0'.repeat(64); }, /Protocol hash/],
    ['calibration', r => { r.calibration[0].selection.planId = 'close'; r.calibrationSha256 = sha(r.calibration); }, /Calibration replay/],
    ['missing case', r => { r.cases.pop(); }, /evaluation case/],
    ['missing history', r => { delete r.cases[0].histories.stable; }, /history/],
    ['duplicate branch', r => { r.cases[0].histories.recurring.push(...r.cases[0].histories.recurring.slice(2, 5)); }, /Duplicate branch/],
    ['missing initialization group', r => { r.cases[0].histories.recurring.splice(2, 3); }, /do not correspond/],
    ['truncated group', r => { r.cases[0].histories.recurring.pop(); }, /Truncated initialization/],
    ['truncated control', r => { branch(r, 'stable', 'fixed', 0).rows.pop(); }, /control replay/],
    ['truncated agent fight with a valid shorter checkpoint', r => {
      const b = branch(r), replay = startAgent(protocol.cases[0], protocol, r.cases[0].training, 'recurring', 'full', 1);
      advanceAgent(protocol, r.cases[0].training, replay, r.calls.find(c => c.id === b.rows[0].callId));
      Object.assign(b, replay);
    }, /Orphan call/],
    ['removed interior call', r => { r.calls = r.calls.filter(c => c.admissionOrder !== 6); }, /completion order|admission order|round\/wave order/],
    ['missing settled response', r => { ordered(r)[0].response = null; }, /unsettled response/],
    ['pending call', r => { ordered(r)[0].completionOrder = null; }, /completion order/],
    ['false dispatch', r => { ordered(r)[0].dispatched = false; }, /not dispatched/],
    ['unknown cost omitted', r => { delete ordered(r)[8].response.metadata.costUsd; }, /Invalid reported cost/],
    ['negative cost', r => { ordered(r)[0].response.metadata.costUsd = -1; }, /Invalid reported cost/],
    ['completion before admission', r => { ordered(r)[0].completedBeforeAdmission = 1; }, /completion count/],
    ['hidden predecessor completion', r => { ordered(r)[4].completedBeforeAdmission = 0; }, /Concurrency|previous wave/],
    ['wrong round', r => { ordered(r)[4].key.round = 3; }, /round\/wave order/],
    ['duplicate identity', r => { ordered(r)[1].id = ordered(r)[0].id; }, /identity/],
    ['invalid successful decision', r => { ordered(r)[0].response.decision.planId = 'invented'; }, /plan/],
    ['altered provider fallback', r => { ordered(r)[8].response.decision.memory = 'injected note'; }, /fallback differs/],
    ['altered trial fallback', r => { branch(r).rows[1].decision.reason = 'hide failure'; }, /trajectory replay/],
    ['altered fight', r => { branch(r).rows[1].fight.physical.damage++; }, /trajectory replay/],
    ['altered final checkpoint', r => { branch(r).final = branch(r).initial; }, /trajectory replay/],
    ['wrong row identity', r => { branch(r).rows[1].callId = ordered(r)[0].id; }, /wrong decision/],
    ['altered observation', r => {
      const c = ordered(r)[8]; c.observation.memory = 'invented earlier note'; c.observationSha256 = sha(c.observation);
      c.response = response(c.observation, protocol, true);
    }, /observation mismatch|observation differs/],
    ['altered transcript', r => { ordered(r)[0].response.call.prompt += 'invented'; }, /Prompt differs/],
    ['missing successful transcript', r => { ordered(r)[0].response.call = null; }, /lacks transcript/],
    ['removed timeout transcript', r => { ordered(r)[8].response.call = null; }, /lacks transcript/],
    ['rehashed system prompt', r => { const c = ordered(r)[0].response.call; c.systemPrompt += 'changed'; c.systemPromptSha256 = sha(c.systemPrompt); }, /frozen provider/],
    ['rehashed schema', r => { const c = ordered(r)[0].response.call; c.schema = '{}'; c.schemaSha256 = sha(c.schema); }, /schema differs/],
    ['CLI arguments', r => { ordered(r)[0].response.call.args.push('--resume'); }, /CLI arguments/],
    ['requested model', r => { ordered(r)[0].response.metadata.requestedModel = 'other'; }, /model mismatch/],
    ['retry', r => { ordered(r)[0].response.metadata.retries = 1; }, /retried/],
  ];
  for (const [name, mutate, error] of corruptions) await t.test(name, async () => {
    const r = structuredClone(partial); mutate(r);
    await assert.rejects(verify(r, { ...options, sources: false }), error);
  });
});

test('unknown costs consume allowance; in-flight overruns are retained but later admissions fail', () => {
  const calls = structuredClone(ordered(partial).slice(0, 5)), p = structuredClone(protocol);
  p.agent.maxReportedCostUsd = .4;
  for (const c of calls.slice(0, 4)) c.response.metadata.costUsd = null;
  assert.doesNotThrow(() => verifyPartialAdmissions(calls.slice(0, 4), p));
  assert.throws(() => verifyPartialAdmissions(calls, p), /cost cap/);
  calls[0].response.metadata.costUsd = 100;
  assert.ok(Math.abs(verifyPartialAdmissions(calls.slice(0, 4), p).accountedCostUsd - 100.3) < 1e-12);
  assert.throws(() => verifyPartialAdmissions(calls, p), /cost cap/);
});

test('a success after the failure threshold cannot clear the permanent stop', () => {
  const calls = structuredClone(ordered(partial));
  calls.at(-1).response.status = 'ok';
  assert.equal(verifyPartialAdmissions(calls, protocol).stoppedReason, 'provider-failure-threshold');
  calls.push({ ...structuredClone(calls[4]), admissionOrder: 13, completionOrder: 13, completedBeforeAdmission: 12,
    key: { ...calls[4].key, arm: 'recent', round: 3 } });
  assert.throws(() => verifyPartialAdmissions(calls, protocol), /permanent failure stop/);
});

test('also verifies early budget stops and zero-call partials without inventing uninitialized branches', async () => {
  for (const maxCalls of [0, 2]) {
    const p = { ...protocol, agent: { ...protocol.agent, maxCalls } }, out = join(directory, `budget-${maxCalls}`);
    let requests = 0;
    await assert.rejects(run({ out, protocol: p, log: () => {}, provider: { async decide(obs) {
      requests++; return response(obs, p, true);
    } } }), /budget exhausted/);
    const r = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8')), report = await verify(r, options);
    assert.equal(requests, maxCalls); assert.equal(report.initializedPairs, maxCalls);
    assert.equal(report.uniqueAgentDecisionsReplayed, maxCalls);
    assert.equal(report.fallbackAgentFightsReplayed, maxCalls * 2);
    assert.equal(report.stoppedReason, null); assert.equal(report.incomplete, true);
  }
});

test('accepts recorded journal recovery fallbacks without a fabricated provider transcript', async () => {
  const r = structuredClone(partial);
  for (const c of r.calls.filter(c => c.response.status === 'error')) {
    c.response.call = null; c.response.error = { code: 'interrupted-request-outcome-unknown' };
    c.response.metadata = { durationMs: 0, costUsd: null, models: [], retries: 0, fallbackApplied: true };
  }
  assert.equal((await verify(r, options)).unknownCostCalls, 4);
});

test('replays rotating later rounds and individual completed branches in an incomplete study', async () => {
  for (const maxCalls of [16, 27]) {
    const p = { ...protocol, agent: { ...protocol.agent, maxCalls } }, out = join(directory, `later-${maxCalls}`);
    await assert.rejects(run({ out, protocol: p, log: () => {}, provider: {
      async decide(obs) { return response(obs, p); },
    } }), /budget exhausted/);
    const r = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8')), report = await verify(r, options);
    assert.equal(report.successfulCalls, maxCalls); assert.equal(report.failedCalls, 0);
    assert.equal(report.unknownCostCalls, 0); assert.equal(report.effectivenessComparisonComplete, false);
    assert.equal(report.completedAgentBranches, maxCalls === 27 ? 7 : 0);
    const reordered = structuredClone(r), calls = ordered(reordered);
    [calls[12].key, calls[13].key] = [calls[13].key, calls[12].key];
    await assert.rejects(verify(reordered, options), /round\/wave order/);
  }
});

test('the standalone CLI runs through a symlink instead of silently exiting', async () => {
  const link = join(directory, 'verify-link.mjs');
  await symlink(new URL('./verify-agentic-v2-partial.mjs', import.meta.url), link);
  const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(result.error, undefined); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Supply partial.json/);
});
