import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './evaluate-agentic-v3.mjs';
import { verify, verifyAdmissions } from './verify-agentic-v3.mjs';
import { ROOT, PROTOCOL, SOURCES } from './agentic-v3/io.mjs';
import { applyGate, initialGate, observation, schedule, sha } from './agentic-v3/design.mjs';
import { warmup, fixedBranch, startAgent, advanceAgent, initialObservation, nextObservation } from './agentic-v3/trial.mjs';
import { publicRound } from './agentic-v1/design.mjs';
import { schedule as previousSchedule } from './agentic-v2/design.mjs';

const original = JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8'));
const prior = JSON.parse(await readFile(resolve(ROOT, original.fixedReference.summary), 'utf8'));
const previous = JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-ablation-v2.protocol.json', import.meta.url), 'utf8'));
const providerSource = await readFile(new URL('./agentic-v1/provider.mjs', import.meta.url), 'utf8');
const systemPrompt = /const SYSTEM_PROMPT = `([^`]+)`;/.exec(providerSource)[1];
const protocol = { ...original, cases: [original.cases[0]], warmupRounds: 2, postRounds: 4,
  agent: { ...original.agent, maxCalls: 64, maxReportedCostUsd: 2 } };
const options = { allowProtocolOverride: true };
const replayOptions = { ...options, sources: false };
const ordered = r => [...r.calls].sort((a, b) => a.admissionOrder - b.admissionOrder);
const branch = (r, arm = 'gated', history = 'stable', replicate = 1) =>
  r.cases[0].histories[history].find(b => b.arm === arm && b.replicate === replicate);
const decision = (planId = 'far', memory = 'Observed game evidence only.') =>
  ({ planId, reason: 'Use the supplied legal NPC plan.', prediction: 'Measure the next fight.', memory });

// Canned responses with the real adapter contract. Never instantiate a live
// provider or invoke a model executable, including when verifying transcripts.
function response(obs, p = protocol, { planId = 'far', memory = 'Recorded note', fail = false, costUsd = .01 } = {}) {
  const schema = JSON.stringify({ type: 'object', additionalProperties: false, properties: {
    planId: { type: 'string', enum: obs.plans.map(x => x.id) },
    reason: { type: 'string', maxLength: 500 }, prediction: { type: 'string', maxLength: 300 }, memory: { type: 'string', maxLength: 1500 },
  }, required: ['planId', 'reason', 'prediction', 'memory'] });
  const prompt = `Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(obs)}`;
  const call = { prompt, systemPrompt, schema,
    promptSha256: sha(prompt), systemPromptSha256: sha(systemPrompt), schemaSha256: sha(schema),
    args: ['--print', '--safe-mode', '--restricted', '--no-session-persistence', '--setting-sources', '',
      '--settings', '{"disableAllHooks":true,"enabledPlugins":{},"autoMemoryEnabled":false,"autoConnectIde":false,"enableAllProjectMcpServers":false}',
      '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--model', p.agent.model, '--effort', p.agent.effort,
      '--max-budget-usd', String(p.agent.maxBudgetUsdPerCall), '--max-turns', '1', '--output-format', 'json', '--input-format', 'text',
      '--system-prompt-snapshot', 'off', '--system-prompt', systemPrompt, '--json-schema', schema],
    sampling: 'CLI defaults; nondeterministic; no seed or temperature control' };
  return { status: fail ? 'error' : 'ok',
    decision: fail ? { planId: obs.currentPlanId, reason: 'Provider failed; retaining a supplied legal NPC plan.', prediction: '', memory: obs.memory } : decision(planId, memory),
    metadata: { provider: p.agent.provider, requestedModel: p.agent.model, effort: p.agent.effort, cliVersion: '2.1.310',
      durationMs: 1, costUsd, models: fail ? [] : [p.agent.model], modelUsage: fail ? {} : { [p.agent.model]: { costUSD: costUsd ?? 0 } },
      timeoutMs: p.agent.timeoutMs, maxBudgetUsd: p.agent.maxBudgetUsdPerCall, maxOutputTokens: 2048,
      attempts: 1, retries: 0, fallbackApplied: fail, exitCode: fail ? null : 0, signal: fail ? 'SIGKILL' : null, permissionDenials: 0 },
    call, ...(fail ? { error: { code: 'timeout' } } : {}) };
}

async function directory(t) {
  const out = await mkdtemp(join(tmpdir(), 'agentic-v3-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  return out;
}
function advance(p, training, b, selection = {}) {
  const obs = nextObservation(training, b), key = { arm: b.arm, round: b.rows.length + 1 };
  const call = { id: sha(key), key, observation: obs, observationSha256: sha(obs), response: response(obs, p, selection) };
  advanceAgent(p, training, b, call);
  return call;
}
function rewriteObservation(r, b, index, mutate) {
  const row = b.rows[index], call = r.calls.find(c => c.id === row.callId);
  mutate(row.observation);
  row.observationSha256 = sha(row.observation);
  call.observation = structuredClone(row.observation); call.observationSha256 = row.observationSha256;
  // Keep transcript and hashes consistent so semantic history replay must reject.
  call.response.call = response(call.observation, r.protocol).call;
}

test('frozen v3 arithmetic and fixed far reference reuse v2 schedules without new calibration', () => {
  const fights = original.cases.length * (original.warmupRounds + original.histories.length * (2 + 3 * original.agentReplicates) * original.postRounds);
  const calls = original.cases.length * original.histories.length * original.agentReplicates * (1 + 2 * (original.postRounds - 1));
  assert.equal(fights, 788); assert.equal(calls, 376);
  assert.equal(original.budget.evaluationFights, fights); assert.equal(original.budget.uniqueModelRequests, calls);
  assert.equal(original.agent.maxCalls, 376); assert.equal(original.agent.maxReportedCostUsd, 12.8);
  assert.equal(original.budget.newCalibrationFights, 0); assert.equal(original.fixedReference.previousCalibrationFights, 1384);
  assert.equal(prior.calibrationFights, 1384);
  for (const c of original.cases) {
    const fixed = original.fixedReference.plans.find(x => x.seed === c.seed && x.index === c.index);
    assert.equal(fixed.planId, 'far');
    assert.equal(prior.selection.find(x => x.seed === c.seed && x.index === c.index).planId, fixed.planId);
    for (const history of ['warmup', ...original.histories]) assert.deepEqual(schedule(c, original, history), previousSchedule(c, previous, history));
  }
  assert.ok(SOURCES.includes(original.fixedReference.summary));
  assert.ok(SOURCES.includes('scripts/verify-agentic-v3.mjs'));
});

test('gate boundaries use completed exposure, reset on switching and leave input state detached', () => {
  const cases = [
    [0, 'lead', true, false, 'gated', 'far', false, 'gate-wait', 0],
    [2, 'lead', true, false, 'gated', 'far', false, 'gate-wait', 2],
    [3, 'lead', true, false, 'gated', 'lead', true, 'gate-accepted', 0],
    [4, 'far', true, false, 'gated', 'far', false, 'retain-recommended', 4],
    [3, 'lead', false, false, 'gated', 'far', false, 'provider-fallback', 3],
    [0, 'lead', true, false, 'immediate', 'lead', true, 'immediate', 0],
    [3, 'lead', false, false, 'immediate', 'far', false, 'provider-fallback', 3],
    [0, 'lead', true, true, 'gated', 'lead', true, 'shared-initial', 0],
    [0, 'lead', false, true, 'gated', 'far', false, 'shared-initial', 0],
  ];
  assert.deepEqual(initialGate(), { observedOnPlan: 0 });
  for (const [count, proposal, successful, initial, arm, executedPlanId, changed, reason, after] of cases) {
    const state = { observedOnPlan: count }, chosen = decision(proposal);
    const actual = applyGate(state, 'far', chosen, successful, initial, arm, original.gate);
    assert.deepEqual(actual, { executedPlanId, changed, reason, before: { observedOnPlan: count }, after: { observedOnPlan: after } });
    actual.before.observedOnPlan = 99; actual.after.observedOnPlan = 100;
    assert.deepEqual(state, { observedOnPlan: count }); assert.deepEqual(chosen, decision(proposal));
  }
});

test('missing sightings, provider failure, retained proposals and resets cannot queue blocked plans', () => {
  const p = { ...protocol, warmupRounds: 10, postRounds: 9 }, c = p.cases[0], training = warmup(c, p);
  const b = startAgent(c, p, training, 'stable', 'gated', 1);
  assert.deepEqual(b.gate, { observedOnPlan: 0 }, 'Ten warmups do not count as evaluation exposure');
  // Valid connected world with a stationary player occluded from NPC patrols.
  // The real simulator produces zero sightings; no feedback is fabricated.
  b.schedule[1].scenario = { id: 'v3-test-no-sightings', world: {
    player: { x: 50, y: 50 }, spawns: [{ x: 105, y: 300 }, { x: 815, y: 475 }, { x: 870, y: 300 }],
    walls: [{ x: 0, y: 100, w: 800, h: 30 }],
  } };
  const proposals = ['far', 'close', 'lead', 'far', 'far', 'aim', 'far', 'far', 'far'];
  for (const [i, planId] of proposals.entries()) advance(p, training, b, { planId, memory: `Note ${i + 1}`, fail: i === 2 });
  assert.deepEqual(b.rows.map(x => x.fight.planId), ['far', 'far', 'far', 'far', 'far', 'aim', 'aim', 'aim', 'far']);
  assert.deepEqual(b.rows.map(x => x.gate.after.observedOnPlan), [1, 1, 2, 3, 4, 1, 2, 3, 1]);
  assert.deepEqual(b.rows.map(x => x.gate.reason), ['shared-initial', 'gate-wait', 'provider-fallback', 'retain-recommended', 'retain-recommended', 'gate-accepted', 'gate-wait', 'gate-wait', 'gate-accepted']);
  assert.equal(b.rows[1].fight.feedback.observed, false);
  assert.equal(b.rows[1].fight.physical.enemies[0].sightings, 0);
  assert.equal(b.rows[2].observation.currentPlanId, 'far');
  assert.equal(b.rows[2].observation.memory, 'Note 2', 'A blocked successful recommendation still supplies the next note');
  assert.equal(b.rows[2].observation.history.at(-1).planId, 'far');
  assert.equal(b.rows[2].observation.history.at(-1).reward, null);
  assert.equal(b.rows[2].observation.history.at(-1).npcDamage, null);
  assert.equal(b.rows[2].decision.memory, 'Note 2', 'Failure preserves the previous note');
  assert.equal(b.rows[3].observation.memory, 'Note 2');
  assert.equal(b.rows[4].fight.planId, 'far', 'The blocked close proposal is discarded when exposure becomes sufficient');
  for (const [i, row] of b.rows.entries()) {
    assert.equal(row.observation.history.length, 10 + i); assert.equal(row.observation.nextRound, 11 + i);
    assert.deepEqual(row.observation.history, [...training.rows, ...b.rows.slice(0, i).map(x => x.fight)].map(publicRound));
  }
  const before = nextObservation(training, b);
  b.gate.observedOnPlan = 999; b.arm = 'immediate'; b.replicate = 99;
  assert.deepEqual(nextObservation(training, b), before, 'Gate and arm identity are not extra planner inputs');
  const hidden = structuredClone(training.rows);
  for (const row of hidden) { row.policy = [{ secret: 'hidden policy' }]; row.frames = [{ secret: 'coordinates' }]; row.counterfactual = 999; }
  assert.deepEqual(observation(hidden, 'far', 'note'), observation(training.rows, 'far', 'note'));
  for (const key of ['policy', 'gate', 'arm', 'replicate', 'seed', 'schedule']) assert.equal(Object.hasOwn(before, key), false);
});

test('shared successful, failed and malformed initialization yields identical first fights and Rust states', () => {
  for (const history of original.histories) for (const kind of ['ok', 'error', 'invalid']) {
    const p = { ...protocol, postRounds: 1 }, c = p.cases[0], training = warmup(c, p), obs = initialObservation(training);
    const call = { id: sha({ history, kind }), observation: obs, response: response(obs, p, { fail: kind === 'error' }) };
    if (kind === 'invalid') call.response.decision.memory = 'x'.repeat(1501);
    const held = fixedBranch(c, p, training, history, kind === 'ok' ? 'far' : 'baseline', { arm: 'initial', replicate: 1, originCallId: call.id });
    for (const arm of ['immediate', 'gated']) {
      const b = startAgent(c, p, training, history, arm, 1);
      advanceAgent(p, training, b, call);
      assert.equal(b.rows[0].callId, held.originCallId); assert.deepEqual(b.rows[0].fight, held.rows[0]);
      assert.deepEqual(b.initial, training.checkpoint); assert.deepEqual(b.final, held.final);
      assert.equal(b.rows[0].decision.memory, kind === 'ok' ? 'Recorded note' : '');
    }
  }
});

test('paired runner replays all histories, own applied-plan observations, transcripts and physical trajectories', async t => {
  const out = await directory(t); let requests = 0;
  const provider = { async decide(obs) {
    requests++;
    return response(obs, protocol, { planId: ['far', 'lead', 'aim', 'close'][obs.nextRound - protocol.warmupRounds - 1], memory: `Own note from request ${requests}` });
  } };
  const { results, summary } = await run({ out, protocol, provider, log: () => {} });
  assert.equal(requests, 28); assert.equal(results.calls.length, 28); assert.equal(summary.recordedCalls, 28);
  assert.equal(summary.scoredFights, 66); assert.equal(summary.evaluationFights, 66); assert.equal(summary.reusedCalibrationFights, 1384);
  assert.ok(Math.abs(summary.reportedCostUsd - .28) < 1e-10); assert.equal(summary.failedCalls, 0);
  assert.equal(results.fixedReferenceSha256, sha(prior)); assert.equal(Object.hasOwn(results, 'calibration'), false);
  assert.equal(Object.hasOwn(results, 'calibrationSha256'), false);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'results.json'), 'utf8')), results);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'summary.json'), 'utf8')), summary);
  for (const history of protocol.histories) {
    const branches = results.cases[0].histories[history], training = results.cases[0].training;
    assert.equal(branches.length, 8); assert.equal(branch(results, 'fixed', history, 0).planId, 'far');
    for (const b of branches) { assert.deepEqual(b.initial, training.checkpoint); assert.deepEqual(b.schedule, schedule(protocol.cases[0], protocol, history)); }
    for (let rep = 1; rep <= protocol.agentReplicates; rep++) {
      const immediate = branch(results, 'immediate', history, rep), gated = branch(results, 'gated', history, rep), held = branch(results, 'initial', history, rep);
      assert.equal(immediate.rows[0].callId, gated.rows[0].callId); assert.equal(gated.rows[0].callId, held.originCallId);
      assert.deepEqual(immediate.rows[0].fight, held.rows[0]); assert.deepEqual(gated.rows[0].fight, held.rows[0]);
      assert.notEqual(immediate.rows[1].callId, gated.rows[1].callId);
      assert.deepEqual(immediate.rows.map(x => x.fight.planId), ['far', 'lead', 'aim', 'close']);
      assert.deepEqual(gated.rows.map(x => x.fight.planId), ['far', 'far', 'far', 'close']);
      assert.equal(gated.rows[2].observation.currentPlanId, 'far'); assert.equal(gated.rows[1].decision.planId, 'lead');
      assert.notDeepEqual(immediate.rows[2].observation.history, gated.rows[2].observation.history);
      assert.notEqual(immediate.rows[2].observation.memory, gated.rows[2].observation.memory);
      for (const b of [immediate, gated]) for (const [i, row] of b.rows.entries()) {
        assert.equal(row.observation.history.length, protocol.warmupRounds + i); assert.equal(row.observation.nextRound, protocol.warmupRounds + i + 1);
        assert.deepEqual(row.observation.history, [...training.rows, ...b.rows.slice(0, i).map(x => x.fight)].map(publicRound));
        assert.equal(row.observation.memory, i ? b.rows[i - 1].decision.memory : '');
        assert.equal(row.observation.currentPlanId, i ? b.rows[i - 1].fight.planId : 'baseline');
      }
    }
  }
  assert.equal(new Set(results.calls.map(c => c.id)).size, 28);
  const digest = sha(results), report = await verify(results, options);
  assert.equal(sha(results), digest, 'Verification must not mutate evidence'); assert.equal(requests, 28, 'Replay makes no provider requests');
  assert.equal(report.verified, true); assert.equal(report.totalPhysicalFightsReplayed, 66); assert.equal(report.calibrationFightsReplayed, 0);
  assert.equal(report.uniqueAgentDecisionsReplayed, 28); assert.equal(report.reusedCalibrationFights, 1384);
  assert.equal(report.modelCallsMade, 0); assert.equal(report.sourceHashesChecked, true); assert.equal(report.frozenProtocolChecked, false);
  await assert.rejects(verify(results), /frozen protocol/);
  await assert.rejects(run({ out, protocol, provider: { decide() { assert.fail('Completed study must not dispatch again'); } }, log: () => {} }), /Completed result exists/);

  await t.test('source checks are exact and bypassing them does not bypass the frozen protocol', async () => {
    for (const mutate of [r => { r.sources['scripts/agentic-v3/trial.mjs'] = '0'.repeat(64); }, r => { delete r.sources[original.fixedReference.summary]; }]) {
      const bad = structuredClone(results); mutate(bad);
      await assert.rejects(verify(bad, options), /frozen source manifest/);
      assert.equal((await verify(bad, replayOptions)).sourceHashesChecked, false);
      await assert.rejects(verify(bad, { sources: false }), /frozen protocol/);
    }
  });

  const corruptions = [
    ['result schema', r => { r.schema = 1; }, /schema/i],
    ['protocol hash', r => { r.protocol.postRounds++; }, /Protocol hash/],
    ['incomplete result', r => { r.incomplete = true; }, /incomplete/],
    ['new calibration smuggled into v3', r => { r.calibration = []; }, /no new calibration/],
    ['fixed reference digest', r => { r.fixedReferenceSha256 = '0'.repeat(64); }, /reference summary hash/],
    ['rehashed prior fixed plan', r => { r.protocol.fixedReference.plans[0].planId = 'aim'; r.protocolSha256 = sha(r.protocol); }, /Prior calibration selection/],
    ['missing fixed reference plan', r => { r.protocol.fixedReference.plans = []; r.protocolSha256 = sha(r.protocol); }, /Missing fixed reference/],
    ['missing call', r => { r.calls.pop(); }, /number of unique/],
    ['orphan call', r => { r.calls.push(structuredClone(r.calls[0])); }, /number of unique/],
    ['false dispatch', r => { ordered(r)[0].dispatched = false; }, /not dispatched/],
    ['negative cost', r => { ordered(r)[0].response.metadata.costUsd = -1; }, /reported cost/],
    ['unknown cost omitted', r => { delete ordered(r)[0].response.metadata.costUsd; }, /reported cost/],
    ['cost cap exceeded before later admission', r => { ordered(r)[0].response.metadata.costUsd = 100; }, /cost cap/],
    ['duplicate admission', r => { ordered(r)[1].admissionOrder = 1; }, /admission order/],
    ['duplicate completion', r => { ordered(r)[1].completionOrder = ordered(r)[0].completionOrder; }, /completion order/],
    ['impossible completion count', r => { ordered(r)[0].completedBeforeAdmission = 1; }, /completion count/],
    ['call identity', r => { r.calls[0].id = '0'.repeat(64); }, /identity/],
    ['duplicate key', r => { const a = ordered(r); a[1].key = structuredClone(a[0].key); a[1].id = a[0].id; }, /Duplicate|order/],
    ['rehashed unknown case', r => { r.calls[0].key.caseIndex = 31; r.calls[0].id = sha(r.calls[0].key); }, /case|order/i],
    ['rehashed unknown history', r => { r.calls[0].key.history = 'future'; r.calls[0].id = sha(r.calls[0].key); }, /history|order/i],
    ['rehashed invalid replicate', r => { r.calls[0].key.replicate = 99; r.calls[0].id = sha(r.calls[0].key); }, /replicate|order/i],
    ['observation hash', r => { r.calls[0].observation.memory += 'tamper'; }, /observation hash/],
    ['submitted prompt', r => { r.calls[0].response.call.prompt += 'tamper'; }, /prompt mismatch/],
    ['system prompt hash', r => { r.calls[0].response.call.systemPromptSha256 = '0'.repeat(64); }, /transcript hash/],
    ['self-consistent wrong system prompt', r => { const c = r.calls[0].response.call; c.systemPrompt += 'tamper'; c.systemPromptSha256 = sha(c.systemPrompt); }, /system prompt differs/],
    ['self-consistent wrong schema', r => { const c = r.calls[0].response.call; c.schema = '{}'; c.schemaSha256 = sha(c.schema); }, /schema differs/],
    ['CLI arguments', r => { r.calls[0].response.call.args.push('--resume'); }, /arguments differ/],
    ['provider', r => { r.calls[0].response.metadata.provider = 'other'; }, /provider.*differs/],
    ['requested model', r => { r.calls[0].response.metadata.requestedModel = 'other'; }, /requestedModel.*differs/],
    ['effort', r => { r.calls[0].response.metadata.effort = 'high'; }, /effort.*differs/],
    ['retry', r => { r.calls[0].response.metadata.retries = 1; }, /retries.*differs/],
    ['output token cap', r => { r.calls[0].response.metadata.maxOutputTokens = 4096; }, /output|Output/],
    ['sampling claim', r => { r.calls[0].response.call.sampling = 'deterministic seed'; }, /sampling/i],
    ['exit status', r => { r.calls[0].response.metadata.exitCode = 1; }, /exit code/],
    ['permission denials', r => { r.calls[0].response.metadata.permissionDenials = 1; }, /permission denials/],
    ['old CLI', r => { r.calls[0].response.metadata.cliVersion = '2.1.309'; }, /Unsupported.*CLI/],
    ['model usage mismatch', r => { r.calls[0].response.metadata.models = ['other']; }, /model usage/],
    ['invalid successful decision', r => { r.calls[0].response.decision.planId = 'invented'; }, /Unknown NPC plan/],
    ['missing history', r => { delete r.cases[0].histories.recurring; }, /History identities/],
    ['duplicate branch', r => { r.cases[0].histories.stable.push(structuredClone(branch(r))); }, /Branch identities/],
    ['truncated horizon', r => { branch(r).rows.pop(); }, /horizon/],
    ['warmup physical outcome', r => { r.cases[0].training.rows[0].physical.damage++; }, /Warm-up.*replay/],
    ['shared initial state', r => { branch(r).initial = r.cases[0].training.initial; }, /share.*checkpoint/],
    ['paired first call', r => { branch(r).rows[0].callId = branch(r, 'gated', 'stable', 2).rows[0].callId; }, /replay|Initial request|differs from provider decision/],
    ['applied plan rewritten to blocked proposal', r => { branch(r).rows[1].fight.planId = branch(r).rows[1].decision.planId; }, /applied plan/],
    ['gate count includes warmups', r => { branch(r).rows[0].gate.before.observedOnPlan = protocol.warmupRounds; }, /Gate history/],
    ['gate wait reported accepted', r => { branch(r).rows[1].gate.reason = 'gate-accepted'; }, /Gate history/],
    ['gate reset lost', r => { branch(r).rows[3].gate.after.observedOnPlan = 4; }, /Gate history/],
    ['changed flag follows proposal', r => { branch(r).rows[1].changed = true; }, /change mismatch/],
    ['final gate', r => { branch(r).gate.observedOnPlan++; }, /Final gate/],
    ['proposed current plan with consistent hashes', r => { rewriteObservation(r, branch(r), 2, o => { o.currentPlanId = 'lead'; }); }, /Observation must use/],
    ['sibling history with consistent hashes', r => { rewriteObservation(r, branch(r), 2, o => { o.history = structuredClone(branch(r, 'immediate').rows[2].observation.history); }); }, /Observation must use/],
    ['sibling note with consistent hashes', r => { rewriteObservation(r, branch(r), 2, o => { o.memory = branch(r, 'immediate').rows[2].observation.memory; }); }, /Observation must use/],
    ['physical damage', r => { branch(r).rows.at(-1).fight.physical.damage++; }, /Trajectory replay/],
    ['physical input hash', r => { branch(r).rows.at(-1).fight.physical.inputSha256 = '0'.repeat(64); }, /Trajectory replay/],
    ['replay frames', r => { branch(r).rows.at(-1).fight.frames[0].player.x++; }, /Trajectory replay/],
    ['Rust policy cells', r => { branch(r).rows.at(-1).fight.policy[0].score++; }, /Trajectory replay/],
    ['final Rust checkpoint', r => { branch(r).final = branch(r).initial; }, /Trajectory replay/],
    ['fixed far control', r => { branch(r, 'fixed', 'stable', 0).rows[0].physical.damage++; }, /Trajectory replay/],
  ];
  for (const [name, mutate, error] of corruptions) await t.test(`rejects ${name}`, async () => {
    const bad = structuredClone(results); mutate(bad);
    await assert.rejects(verify(bad, replayOptions), error);
  });

  await t.test('branch dependencies reject a predecessor that generic admissions permit', async () => {
    const bad = structuredClone(results), initial = ordered(bad)[0], n = bad.calls.length;
    // No completed-before claims: generic admission accounting allows this
    // with enlarged concurrency/budget, but round two needs its shared result.
    bad.protocol.maxConcurrency = n; bad.protocol.agent.maxReportedCostUsd = n * .1 + 1; bad.protocolSha256 = sha(bad.protocol);
    for (const c of bad.calls) { c.completedBeforeAdmission = 0; c.completionOrder = c === initial ? n : c.completionOrder - 1; }
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    await assert.rejects(verify(bad, replayOptions), /before predecessor completed|preceding wave|previous wave/);
  });

  await t.test('round waves forbid advancing a branch before the preceding round finishes', async () => {
    const bad = structuredClone(results), calls = ordered(bad);
    const early = calls.find(c => c.key.arm === 'immediate' && c.key.round === 3 && c.key.history === 'stable' && c.key.replicate === 1);
    calls.splice(calls.indexOf(early), 1);
    calls.splice(calls.findIndex(c => c.key.arm === 'gated' && c.key.round === 2), 0, early);
    calls.forEach((c, i) => Object.assign(c, { admissionOrder: i + 1, completionOrder: i + 1, completedBeforeAdmission: i }));
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    await assert.rejects(verify(bad, replayOptions), /round|wave|order/);
  });
});

test('runner failures retain actual plan and note and preserve unknown cost without retries', async t => {
  const p = { ...protocol, histories: ['stable'], agentReplicates: 1, maxConcurrency: 1, postRounds: 4 };
  const out = await directory(t); let requests = 0;
  const { results, summary } = await run({ out, protocol: p, log: () => {}, provider: { async decide(obs) {
    requests++;
    const round = obs.nextRound - p.warmupRounds;
    return response(obs, p, { planId: round === 1 ? 'far' : 'lead', memory: `Note ${requests}`, fail: round === 3, costUsd: round === 3 ? null : .01 });
  } } });
  assert.equal(requests, 7); assert.equal(summary.failedCalls, 2); assert.equal(summary.unknownCostCalls, 2); assert.equal(summary.reportedCostUsd, null);
  for (const arm of ['immediate', 'gated']) {
    const b = branch(results, arm), failed = b.rows[2];
    assert.equal(failed.gate.reason, 'provider-fallback'); assert.equal(failed.changed, false);
    assert.equal(failed.fight.planId, b.rows[1].fight.planId); assert.equal(failed.decision.memory, b.rows[1].decision.memory);
    assert.equal(b.rows[3].observation.memory, b.rows[1].decision.memory);
  }
  assert.equal((await verify(results, options)).uniqueAgentDecisionsReplayed, 7);
  for (const [name, mutate] of [
    ['invalid failed decision', c => { c.response.decision.planId = 'invented'; c.response.decision.memory = 'x'.repeat(1501); }],
    ['failed fallback plan', c => { c.response.decision.planId = c.observation.currentPlanId === 'far' ? 'lead' : 'far'; }],
    ['failed fallback memory', c => { c.response.decision.memory = 'injected note'; }],
  ]) await t.test(`rejects ${name}`, async () => {
    const bad = structuredClone(results); mutate(bad.calls.find(c => c.response.status === 'error'));
    await assert.rejects(verify(bad, replayOptions), /plan|memory|fallback|decision/i);
  });
});

for (const kind of ['request cap', 'cost cap', 'failure stop']) test(`${kind} leaves durable incomplete evidence without shortening or retrying`, async t => {
  const out = await directory(t), p = { ...protocol, histories: ['stable'], agentReplicates: 1, maxConcurrency: 1,
    agent: { ...protocol.agent, ...(kind === 'request cap' ? { maxCalls: 2 } : kind === 'cost cap' ? { maxReportedCostUsd: .11 } : {}) } };
  let requests = 0;
  await assert.rejects(run({ out, protocol: p, log: () => {}, provider: { async decide(obs) {
    requests++; return response(obs, p, { fail: kind === 'failure stop', costUsd: kind === 'failure stop' ? null : .01 });
  } } }), kind === 'failure stop' ? /consecutive provider failures/ : /budget/);
  const partial = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8'));
  assert.equal(requests, kind === 'failure stop' ? 3 : 2); assert.equal(partial.calls.length, requests);
  assert.equal(partial.incomplete, true); assert.ok(partial.stop); assert.equal(partial.protocol.postRounds, 4);
  assert.equal(partial.protocol.agentReplicates, 1); assert.equal(branch(partial).schedule.length, 4);
  assert.equal(branch(partial, 'fixed', 'stable', 0).rows.length, 4);
  for (const c of partial.calls) assert.deepEqual(JSON.parse(await readFile(join(out, 'calls', 'calls', `${c.id}.json`), 'utf8')), c);
  await assert.rejects(readFile(join(out, 'results.json')), /ENOENT/);
  await assert.rejects(verify(partial, options), /incomplete/);
  await assert.rejects(run({ out, resume: true, protocol: p, log: () => {}, provider: { decide() { assert.fail('Stopped requests must not dispatch on resume'); } } }));
});

test('admission replay accepts already-admitted overruns and rejects requests after permanent failure', () => {
  const limits = { maxCalls: 10, maxReportedCostUsd: .2, maxBudgetUsdPerCall: .1, maxConsecutiveFailures: 3 };
  const calls = [1, 2].map(i => ({ dispatched: true, admissionOrder: i, completedBeforeAdmission: 0, completionOrder: i,
    response: { status: 'ok', metadata: { costUsd: i === 1 ? 100 : 0 } } }));
  assert.doesNotThrow(() => verifyAdmissions(calls, limits));
  calls.push({ dispatched: true, admissionOrder: 3, completedBeforeAdmission: 2, completionOrder: 3, response: { status: 'ok', metadata: { costUsd: 0 } } });
  assert.throws(() => verifyAdmissions(calls, limits), /cost cap/);
  const stopped = Array.from({ length: 5 }, (_, i) => ({ dispatched: true, admissionOrder: i + 1, completedBeforeAdmission: i,
    completionOrder: i + 1, response: { status: i < 3 ? 'error' : 'ok', metadata: { costUsd: 0 } } }));
  assert.throws(() => verifyAdmissions(stopped, { ...limits, maxReportedCostUsd: 1 }), /failure stop/);
});
