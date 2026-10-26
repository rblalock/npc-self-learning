import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './evaluate-agentic-v4.mjs';
import { verify, verifyAdmissions } from './verify-agentic-v4.mjs';
import { ROOT, PROTOCOL, SOURCES } from './agentic-v4/io.mjs';
import { PLANS, sha, schedule } from './agentic-v2/design.mjs';
import { publicRound } from './agentic-v1/design.mjs';
import { surveySchedule, observation, algorithmStatistics, algorithmDecision } from './agentic-v4/design.mjs';
import { prepare, fixedBranch, startBranch, advance, initialObservation, nextObservation } from './agentic-v4/trial.mjs';
import { warmup } from './agentic-v2/trial.mjs';
import { SPEC, fight } from './agentic-v1/trial.mjs';
import { createPolicy } from './research/policy.mjs';
import { verifyProvider } from './agentic-v4/provider-audit.mjs';

const original = JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8'));
const previous = JSON.parse(await readFile(new URL('../docs/experiments/agentic-npc-ablation-v2.protocol.json', import.meta.url), 'utf8'));
const prior = JSON.parse(await readFile(resolve(ROOT, original.fixedReference.summary), 'utf8'));
const providerSource = await readFile(new URL('./agentic-v1/provider.mjs', import.meta.url), 'utf8');
const systemPrompt = /const SYSTEM_PROMPT = `([^`]+)`;/.exec(providerSource)[1];
// Retain all eight independent trajectories so small fixtures still exercise
// the four-call waves and round rotation. Never instantiate a live provider.
const protocol = { ...original, warmupRounds: 2, postRounds: 4,
  agent: { ...original.agent, maxCalls: 64, maxReportedCostUsd: 2 } };
const options = { allowProtocolOverride: true };
const replayOptions = { ...options, sources: false };
const ordered = r => [...r.calls].sort((a, b) => a.admissionOrder - b.admissionOrder);
const branch = (r, arm = 'agent', history = 'stable', replicate = arm === 'agent' || arm === 'agent-initial' ? 1 : 0, ci = 0) =>
  r.cases[ci].histories[history].find(b => b.arm === arm && b.replicate === replicate);
const decision = (planId = 'far', memory = 'Observed evidence only.') =>
  ({ planId, reason: 'Use a supplied legal plan.', prediction: 'Measure the next fight.', memory });

function response(obs, p = protocol, { planId = 'far', memory = 'Recorded note', fail = false, costUsd = .001 } = {}) {
  const schema = JSON.stringify({ type: 'object', additionalProperties: false, properties: {
    planId: { type: 'string', enum: obs.plans.map(x => x.id) }, reason: { type: 'string', maxLength: 500 },
    prediction: { type: 'string', maxLength: 300 }, memory: { type: 'string', maxLength: 1500 },
  }, required: ['planId', 'reason', 'prediction', 'memory'] });
  const prompt = `Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(obs)}`;
  const call = { prompt, systemPrompt, schema, promptSha256: sha(prompt), systemPromptSha256: sha(systemPrompt), schemaSha256: sha(schema),
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
      usage: null, timeoutMs: p.agent.timeoutMs, maxBudgetUsd: p.agent.maxBudgetUsdPerCall, maxOutputTokens: 2048,
      attempts: 1, retries: 0, fallbackApplied: fail, exitCode: fail ? null : 0, signal: fail ? 'SIGKILL' : null, permissionDenials: 0 },
    call, ...(fail ? { error: { code: 'timeout' } } : {}) };
}

async function directory(t) {
  const out = await mkdtemp(join(tmpdir(), 'agentic-v4-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  return out;
}
function rewriteObservation(r, b, i, mutate) {
  const row = b.rows[i]; mutate(row.observation); row.observationSha256 = sha(row.observation);
  if (row.callId) {
    const call = r.calls.find(c => c.id === row.callId);
    call.observation = structuredClone(row.observation); call.observationSha256 = row.observationSha256;
    call.response.call = response(call.observation, r.protocol).call;
  }
}
const reseal = r => { r.protocolSha256 = sha(r.protocol); };

test('frozen v4 budgets derive from balanced preparation and eight independent 24-call trajectories', async () => {
  assert.equal(original.warmupRounds, 10); assert.equal(original.postRounds, 24);
  assert.equal(original.agentReplicates, 2); assert.equal(original.maxConcurrency, 4);
  const prep = original.cases.reduce((n, c) => n + original.warmupRounds + surveySchedule(c, original).length, 0);
  const evaluation = original.cases.length * original.histories.length * (4 + 2 * original.agentReplicates) * original.postRounds;
  const calls = original.cases.length * original.histories.length * original.agentReplicates * original.postRounds;
  assert.equal(evaluation, 768); assert.equal(calls, 192);
  assert.equal(original.budget.preparationFights, prep); assert.equal(original.budget.evaluationFights, evaluation);
  assert.equal(original.budget.totalPhysicalFights, prep + evaluation); assert.equal(original.budget.uniqueModelRequests, calls);
  assert.equal(original.agent.maxCalls, calls); assert.equal(original.budget.newCalibrationFights, 0);
  assert.equal(original.budget.extraSimulationProbes, 0); assert.equal(original.budget.newAlgorithmTuningFights, 0);
  assert.equal(prior.calibrationFights, 1384); assert.equal(original.fixedReference.previousCalibrationFights, 1384);
  for (const c of original.cases) {
    assert.equal(original.fixedReference.plans.find(x => x.seed === c.seed && x.index === c.index).planId, 'far');
    for (const history of ['warmup', ...original.histories]) assert.deepEqual(schedule(c, original, history), schedule(c, previous, history));
  }
  for (const source of [PROTOCOL, original.fixedReference.summary, 'scripts/agentic-v4/design.mjs', 'scripts/agentic-v4/trial.mjs',
    'scripts/agentic-v4/provider-audit.mjs', 'scripts/agentic-v3/live-guard.mjs', 'scripts/verify-agentic-v4.mjs']) assert.ok(SOURCES.includes(source), source);
  const runner = await readFile(new URL('./evaluate-agentic-v4.mjs', import.meta.url), 'utf8');
  assert.match(runner, /import\s*\{\s*claimLiveStudy\s*\}\s*from\s*['"]\.\/agentic-v3\/live-guard\.mjs/);
  assert.match(runner, /target\/agentic-npc-matched-v4\.study\.json/);
});

test('preparation preserves v2 warmups, executes the protocol survey sequentially, and retains its Rust checkpoint', () => {
  for (const c of original.cases) {
    const training = prepare(c, original), expectedSurvey = surveySchedule(c, original);
    assert.deepEqual(training.warmup, warmup(c, previous));
    assert.deepEqual(training.survey.schedule, expectedSurvey);
    assert.deepEqual(training.rows, [...training.warmup.rows, ...training.survey.rows]);
    const counts = PLANS.map(plan => expectedSurvey.filter(x => x.planId === plan.id).length);
    assert.ok(counts[0] > 0 && counts.every(n => n === counts[0]));
    assert.deepEqual(expectedSurvey.map(s => s.planId), original.survey.order);
    const policy = createPolicy(training.policySeed, SPEC);
    try {
      policy.request({ op: 'restore', snapshot: training.warmup.checkpoint });
      for (const [i, item] of expectedSurvey.entries()) assert.deepEqual(training.survey.rows[i],
        fight(policy, item, item.planId, original.warmupRounds + i + 1));
      assert.deepEqual(training.checkpoint, policy.request({ op: 'snapshot' }));
    } finally { policy.dispose(); }
    assert.notDeepEqual(training.checkpoint, training.warmup.checkpoint);
    assert.deepEqual(training.rows.map(x => x.round), training.rows.map((_, i) => i + 1));
  }
});

test('matched observation schema excludes evaluator secrets, future records and unobserved damage', () => {
  const c = protocol.cases[0], training = prepare(c, protocol), obs = initialObservation(training, protocol);
  assert.equal(obs.nextRound, training.rows.length + 1); assert.equal(obs.preparationRounds, training.rows.length);
  assert.equal(obs.currentPlanId, training.rows.at(-1).planId); assert.equal(obs.memory, '');
  assert.deepEqual(obs.plans, PLANS); assert.deepEqual(obs.history, training.rows.map(publicRound));
  const hidden = structuredClone(training.rows);
  for (const row of hidden) {
    Object.assign(row, { policy: [{ secret: 'hidden Rust state' }], frames: [{ secret: 'coordinates' }], counterfactual: 999, seed: 99, side: 1 });
    for (const telemetry of row.physical.npcTelemetry) telemetry.hiddenOpponent = 'future';
  }
  assert.deepEqual(observation(hidden, obs.currentPlanId, '', protocol), obs);
  const unobserved = structuredClone(hidden); unobserved[0].feedback.observed = false;
  const missing = observation(unobserved, obs.currentPlanId, '', protocol).history[0];
  assert.equal(missing.reward, null); assert.equal(missing.npcDamage, null);
  for (const key of ['policy', 'arm', 'replicate', 'seed', 'side', 'schedule', 'selector', 'statistics']) assert.equal(Object.hasOwn(obs, key), false);
  const b = startBranch(c, protocol, training, 'stable', 'algorithm');
  const chosen = algorithmDecision(nextObservation(training, b, protocol), protocol.selector);
  advance(protocol, training, b, { decision: chosen });
  const next = nextObservation(training, b, protocol);
  assert.equal(next.nextRound, obs.nextRound + 1); assert.equal(next.preparationRounds, obs.preparationRounds);
  assert.deepEqual(next.history, [...training.rows, b.rows[0].fight].map(publicRound));
  b.arm = 'agent'; b.replicate = 100; b.schedule[1].side = 1 - b.schedule[1].side;
  assert.deepEqual(nextObservation(training, b, protocol), next);
});

test('frozen discounted selector uses observed public damage, elapsed fight age, initialization and declared tie rules', () => {
  const s = original.selector;
  assert.equal(s.id, 'discounted-ucb'); assert.equal(s.halfLifeFights, 12); assert.equal(s.explorationHp, 12); assert.equal(s.damageCapHp, 100);
  const obs = { nextRound: 25, preparationRounds: 3, currentPlanId: 'far', history: [
    { round: 12, planId: 'far', observed: true, npcDamage: 20 },
    { round: 24, planId: 'far', observed: true, npcDamage: 80 },
    { round: 23, planId: 'aim', observed: false, npcDamage: 999 },
  ] };
  let stats = algorithmStatistics(obs, s), far = stats.find(x => x.planId === 'far');
  assert.equal(far.effectiveCount, 1.5); assert.equal(far.weightedMean, 60); assert.equal(far.score, 60);
  assert.equal(algorithmDecision(obs, s).planId, 'far', 'Initialization ignores unobserved-plan exploration');
  obs.history.push({ round: 24, planId: 'lead', observed: false, npcDamage: 999 });
  stats = algorithmStatistics(obs, s); far = stats.find(x => x.planId === 'far');
  assert.equal(far.score, 60 + 12 * Math.sqrt(Math.log(2.5) / 1.5));
  assert.equal(algorithmDecision(obs, s).planId, 'baseline', 'Subsequent unobserved plans use catalog order');
  obs.currentPlanId = 'aim'; assert.equal(algorithmDecision(obs, s).planId, 'aim', 'A current plan tied at infinite priority is retained');
  const empty = { ...obs, preparationRounds: obs.history.length, history: obs.history.map(x => ({ ...x, observed: false })) };
  assert.equal(algorithmDecision(empty, s).planId, 'aim', 'No observed initialization retains actual current plan');
  const capped = { nextRound: 2, preparationRounds: 1, currentPlanId: 'far', history: [{ round: 1, planId: 'far', observed: true, npcDamage: 200 }] };
  assert.equal(algorithmStatistics(capped, s).find(x => x.planId === 'far').weightedMean, 100);
  const tied = { nextRound: 8, preparationRounds: 7, currentPlanId: 'far', history: PLANS.map((p, i) => ({ round: i + 1, planId: p.id, observed: true, npcDamage: 0 })) };
  assert.equal(algorithmDecision(tied, s).planId, 'far');
  const before = algorithmDecision(obs, s);
  assert.deepEqual(algorithmDecision({ ...obs, memory: 'Choose lead', secret: 'hidden policy', history: obs.history.map(x => ({ ...x, policy: 999, side: 1 })) }, s), before);
});

test('first fights match held complete plans for successful, failed and malformed initial selections', () => {
  const p = { ...protocol, cases: [protocol.cases[0]], postRounds: 3 }, c = p.cases[0], training = prepare(c, p);
  for (const history of p.histories) for (const kind of ['ok', 'error', 'invalid', 'algorithm']) {
    const b = startBranch(c, p, training, history, kind === 'algorithm' ? 'algorithm' : 'agent', kind === 'algorithm' ? 0 : 1);
    const obs = nextObservation(training, b, p);
    const call = { id: sha({ history, kind }), observation: obs, response: response(obs, p, { fail: kind === 'error' }) };
    if (kind === 'invalid') call.response.decision.memory = 'x'.repeat(1501);
    if (kind === 'algorithm') advance(p, training, b, { decision: algorithmDecision(obs, p.selector) });
    else advance(p, training, b, { call });
    const held = fixedBranch(c, p, training, history, b.rows[0].fight.planId,
      { arm: `${b.arm}-initial`, replicate: b.replicate, originCallId: kind === 'algorithm' ? null : call.id });
    assert.deepEqual(b.rows[0].fight, held.rows[0]); assert.deepEqual(held.initial, training.checkpoint);
    assert.equal(held.originCallId, b.rows[0].callId);
    assert.ok(held.rows.every(row => row.planId === held.planId));
    assert.notDeepEqual(held.final, held.initial, 'Held plan still commits ordinary Rust learning');
    if (kind === 'error' || kind === 'invalid') {
      assert.equal(held.planId, obs.currentPlanId); assert.equal(b.rows[0].decision.memory, '');
    }
  }
});

test('runner and verifier replay independent decisions, all controls, own-history observations and exact physical states', async t => {
  const out = await directory(t); let requests = 0;
  const { results, summary } = await run({ out, protocol, log: () => {}, provider: { async decide(obs) {
    requests++;
    return response(obs, protocol, { planId: ['far', 'lead', 'aim', 'close'][obs.nextRound - obs.preparationRounds - 1], memory: `Own note ${requests}` });
  } } });
  const expectedCalls = 8 * protocol.postRounds, prep = results.cases.reduce((n, c) => n + c.training.rows.length, 0);
  assert.equal(requests, expectedCalls); assert.equal(summary.recordedCalls, expectedCalls);
  assert.equal(summary.preparationFights, prep); assert.equal(summary.evaluationFights, 4 * 8 * protocol.postRounds);
  assert.equal(summary.scoredFights, prep + summary.evaluationFights); assert.ok(Math.abs(summary.reportedCostUsd - expectedCalls * .001) < 1e-10);
  assert.equal(results.fixedReferenceSha256, sha(prior)); assert.equal(Object.hasOwn(results, 'calibration'), false);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'results.json'), 'utf8')), results);
  for (const c of results.cases) for (const [history, bs] of Object.entries(c.histories)) {
    assert.deepEqual(bs.map(b => `${b.arm}${b.replicate}`), ['retained0', 'fixed0', 'algorithm0', 'algorithm-initial0', 'agent1', 'agent-initial1', 'agent2', 'agent-initial2']);
    for (const b of bs) {
      assert.deepEqual(b.initial, c.training.checkpoint); assert.deepEqual(b.schedule, schedule(c, protocol, history));
      if (!['algorithm', 'agent'].includes(b.arm)) continue;
      for (const [i, row] of b.rows.entries()) {
        assert.deepEqual(row.observation.history, [...c.training.rows, ...b.rows.slice(0, i).map(x => x.fight)].map(publicRound));
        assert.equal(row.observation.nextRound, c.training.rows.length + i + 1);
        assert.equal(row.observation.memory, i ? b.rows[i - 1].decision.memory : '');
        assert.equal(row.observation.currentPlanId, i ? b.rows[i - 1].fight.planId : c.training.rows.at(-1).planId);
        if (b.arm === 'algorithm') assert.deepEqual(row.decision, algorithmDecision(row.observation, protocol.selector));
      }
      const held = bs.find(x => x.arm === `${b.arm}-initial` && x.replicate === b.replicate);
      assert.deepEqual(b.rows[0].fight, held.rows[0]); assert.equal(b.rows[0].callId, held.originCallId);
    }
    const agents = bs.filter(b => b.arm === 'agent');
    assert.deepEqual(agents[0].rows[0].observation, agents[1].rows[0].observation);
    assert.notEqual(agents[0].rows[0].callId, agents[1].rows[0].callId);
    assert.notEqual(agents[0].rows[1].observation.memory, agents[1].rows[1].observation.memory);
    assert.notDeepEqual(bs.find(b => b.arm === 'algorithm').rows[2].observation.history, agents[0].rows[2].observation.history);
  }
  const digest = sha(results), report = await verify(results, options);
  assert.equal(sha(results), digest); assert.equal(requests, expectedCalls); assert.equal(report.verified, true);
  assert.equal(report.preparationFightsReplayed, prep); assert.equal(report.evaluationFightsReplayed, summary.evaluationFights);
  assert.equal(report.totalPhysicalFightsReplayed, summary.scoredFights); assert.equal(report.calibrationFightsReplayed, 0);
  assert.equal(report.reusedCalibrationFights, 1384); assert.equal(report.uniqueAgentDecisionsReplayed, expectedCalls);
  assert.equal(report.sourceHashesChecked, true); assert.equal(report.frozenProtocolChecked, false); assert.equal(report.modelCallsMade, 0);
  await assert.rejects(verify(results), /frozen protocol/);
  await assert.rejects(verify(results, { sources: false }), /frozen protocol/);
  await assert.rejects(run({ out, protocol, provider: { decide() { assert.fail('Completed run redispatched'); } }, log: () => {} }), /Completed result exists/);

  await t.test('source fingerprints are exact and independently controlled from protocol overrides', async () => {
    for (const mutate of [r => { r.sources['scripts/agentic-v4/design.mjs'] = '0'.repeat(64); }, r => { delete r.sources[original.fixedReference.summary]; }]) {
      const bad = structuredClone(results); mutate(bad);
      await assert.rejects(verify(bad, options), /frozen source manifest/);
      assert.equal((await verify(bad, replayOptions)).sourceHashesChecked, false);
      await assert.rejects(verify(bad, { sources: false }), /frozen protocol/);
    }
  });
  const corruptions = [
    ['schema', r => { r.schema = 1; }, /schema/],
    ['protocol hash', r => { r.protocol.postRounds++; }, /Protocol hash/],
    ['incomplete study', r => { r.incomplete = true; }, /incomplete/],
    ['missing completion marker', r => { delete r.completedAt; }, /completion timestamp/],
    ['new calibration', r => { r.calibration = []; }, /no new calibration/],
    ['fixed reference hash', r => { r.fixedReferenceSha256 = '0'.repeat(64); }, /reference summary hash/],
    ['fixed plan reselected', r => { r.protocol.fixedReference.plans[0].planId = 'aim'; reseal(r); }, /Prior calibration selection/],
    ['missing prior selection', r => { r.protocol.fixedReference.plans = []; reseal(r); }, /Missing fixed reference/],
    ['missing unique call', r => { r.calls.pop(); }, /number of unique/],
    ['orphan extra call', r => { r.calls.push(structuredClone(r.calls[0])); }, /number of unique/],
    ['request cap', r => { r.protocol.agent.maxCalls = r.calls.length - 1; reseal(r); }, /Request cap/],
    ['invalid cost budget', r => { r.protocol.agent.maxReportedCostUsd = -1; reseal(r); }, /cost cap/],
    ['missing algorithm runtime', r => { delete r.algorithmRuntime; }, /algorithm timing/],
    ['algorithm timing coverage', r => { r.algorithmRuntime.pop(); }, /timing identities\/coverage/],
    ['algorithm timing identity', r => { r.algorithmRuntime[0].round++; }, /timing identities\/coverage/],
    ['algorithm duration', r => { r.algorithmRuntime[0].durationMs = -1; }, /algorithm duration/],
    ['undispatched call', r => { ordered(r)[0].dispatched = false; }, /not dispatched/],
    ['negative cost', r => { ordered(r)[0].response.metadata.costUsd = -1; }, /reported cost/],
    ['omitted unknown cost', r => { delete ordered(r)[0].response.metadata.costUsd; }, /reported cost/],
    ['string cost', r => { ordered(r)[0].response.metadata.costUsd = '0'; }, /reported cost/],
    ['cost cap before later admission', r => { ordered(r)[0].response.metadata.costUsd = 100; }, /cost cap/],
    ['duplicate admission', r => { ordered(r)[1].admissionOrder = 1; }, /admission order/],
    ['duplicate completion', r => { ordered(r)[1].completionOrder = ordered(r)[0].completionOrder; }, /completion order/],
    ['impossible completion count', r => { ordered(r)[0].completedBeforeAdmission = 1; }, /completion count/],
    ['call identity', r => { r.calls[0].id = '0'.repeat(64); }, /identity/],
    ['shared agent call key', r => { r.calls[0].key.arm = 'shared'; r.calls[0].id = sha(r.calls[0].key); }, /own agent trajectory/],
    ['unknown case', r => { r.calls[0].key.caseIndex = 31; r.calls[0].id = sha(r.calls[0].key); }, /request case/],
    ['unknown history', r => { r.calls[0].key.history = 'future'; r.calls[0].id = sha(r.calls[0].key); }, /request history/],
    ['unknown replicate', r => { r.calls[0].key.replicate = 99; r.calls[0].id = sha(r.calls[0].key); }, /replicate/],
    ['stale observation hash', r => { r.calls[0].observation.memory += 'tamper'; }, /observation hash/],
    ['submitted prompt', r => { r.calls[0].response.call.prompt += 'hidden evidence'; }, /prompt/],
    ['self-consistent system prompt', r => { const c = r.calls[0].response.call; c.systemPrompt += ' additional instruction'; c.systemPromptSha256 = sha(c.systemPrompt); }, /system prompt/],
    ['provider model', r => { r.calls[0].response.metadata.requestedModel = 'another-model'; }, /requestedModel/],
    ['reported model identity', r => { const m=r.calls[0].response.metadata; m.models=['claude-opus-4-6']; m.modelUsage={'claude-opus-4-6':{costUSD:0}}; }, /Reported model identity/],
    ['reported model missing', r => { const m=r.calls[0].response.metadata; m.models=[];m.modelUsage={}; }, /no reported model identity/],
    ['reported web search', r => { r.calls[0].response.metadata.usage={server_tool_use:{web_search_requests:1}}; }, /web-tool use/],
    ['reported web fetch', r => { r.calls[0].response.metadata.usage={server_tool_use:{web_fetch_requests:1}}; }, /web-tool use/],
    ['reported per-model web search', r => { const m=r.calls[0].response.metadata;m.modelUsage[m.models[0]].webSearchRequests=1; }, /web-tool use/],
    ['provider attempts omitted', r => { delete r.calls[0].response.metadata.attempts; }, /attempts/],
    ['provider fallback omitted', r => { delete r.calls[0].response.metadata.fallbackApplied; }, /fallback/],
    ['provider usage leakage', r => { r.calls[0].response.metadata.usage = { secret: 'session' }; }, /usage/],
    ['invalid successful decision', r => { r.calls[0].response.decision.planId = 'invented'; }, /Unknown NPC plan/],
    ['history identity', r => { delete r.cases[0].histories.recurring; }, /History identities/],
    ['branch identities', r => { r.cases[0].histories.stable.push(structuredClone(branch(r))); }, /Branch identities/],
    ['truncated horizon', r => { branch(r).rows.pop(); }, /horizon/],
    ['warmup outcome', r => { r.cases[0].training.warmup.rows[0].physical.damage++; }, /Preparation.*replay/],
    ['survey plan coverage', r => { r.cases[0].training.survey.rows[1].planId = 'baseline'; }, /Preparation.*replay/],
    ['survey schedule', r => { r.cases[0].training.survey.schedule[0].side ^= 1; }, /Preparation.*replay/],
    ['survey checkpoint', r => { r.cases[0].training.checkpoint = r.cases[0].training.warmup.checkpoint; }, /Preparation.*replay/],
    ['preparation chronology', r => { r.cases[0].training.rows.reverse(); }, /Preparation.*replay/],
    ['branch checkpoint', r => { branch(r).initial = r.cases[0].training.warmup.checkpoint; }, /preparation checkpoint/],
    ['future schedule', r => { branch(r).schedule[1].side ^= 1; }, /frozen v2 schedule/],
    ['cross-replicate held origin', r => { branch(r, 'agent-initial').originCallId = branch(r, 'agent', 'stable', 2).rows[0].callId; }, /own first call/],
    ['first-fight physical equality', r => { branch(r, 'agent-initial').rows[0].physical.damage++; }, /Paired first fights/],
    ['first-fight Rust equality', r => { branch(r, 'algorithm-initial').rows[0].policy[0].score++; }, /Paired first fights/],
    ['held complete plan', r => { branch(r, 'agent-initial').rows[1].planId = 'close'; }, /Held control changed/],
    ['cross-replicate later call', r => { branch(r).rows[1].callId = branch(r, 'agent', 'stable', 2).rows[1].callId; }, /another trajectory/],
    ['algorithm consumed agent call', r => { branch(r, 'algorithm').rows[1].callId = branch(r).rows[1].callId; }, /Algorithm cannot/],
    ['algorithm decision replay', r => { branch(r, 'algorithm').rows[1].decision.reason = 'Not the frozen selector'; }, /selector decision/],
    ['algorithm physical state', r => { branch(r, 'algorithm').rows.at(-1).fight.physical.damage++; }, /Trajectory replay/],
    ['changed flag', r => { branch(r).rows[1].changed = !branch(r).rows[1].changed; }, /change mismatch/],
    ['allowlist leakage with valid hashes', r => { rewriteObservation(r, branch(r), 1, o => { o.policy = [{ secret: 1 }]; }); }, /allowlist/],
    ['nested leakage with valid hashes', r => { rewriteObservation(r, branch(r), 1, o => { o.history[0].side = 1; }); }, /allowlisted/],
    ['public clock', r => { rewriteObservation(r, branch(r), 1, o => { o.nextRound--; }); }, /clock/],
    ['preparation clock', r => { rewriteObservation(r, branch(r), 1, o => { o.preparationRounds--; }); }, /preparation clock/],
    ['injected plan tuning', r => { rewriteObservation(r, branch(r), 1, o => { o.plans[0].tuning.rangerDistance++; }); }, /plan menu/],
    ['current plan from proposal', r => { rewriteObservation(r, branch(r), 1, o => { o.currentPlanId = 'close'; }); }, /actual plan/],
    ['another replica note', r => { rewriteObservation(r, branch(r), 1, o => { o.memory = branch(r, 'agent', 'stable', 2).rows[1].observation.memory; }); }, /previous note/],
    ['algorithm sees agent history', r => { rewriteObservation(r, branch(r, 'algorithm'), 2, o => { o.history = structuredClone(branch(r).rows[2].observation.history); }); }, /own-history/],
    ['future evidence', r => { rewriteObservation(r, branch(r), 1, o => { o.history.push(publicRound(branch(r).rows[2].fight)); }); }, /own-history/],
    ['agent physical damage', r => { branch(r).rows.at(-1).fight.physical.damage++; }, /Trajectory replay/],
    ['physical input digest', r => { branch(r).rows.at(-1).fight.physical.inputSha256 = '0'.repeat(64); }, /Trajectory replay/],
    ['replay frames', r => { branch(r).rows.at(-1).fight.frames[0].player.x++; }, /Trajectory replay/],
    ['Rust policy cells', r => { branch(r).rows.at(-1).fight.policy[0].score++; }, /Trajectory replay/],
    ['Rust final checkpoint', r => { branch(r).final = branch(r).initial; }, /Trajectory replay/],
    ['fixed prior replay', r => { branch(r, 'fixed').rows[0].physical.damage++; }, /Trajectory replay/],
  ];
  for (const [name, mutate, error] of corruptions) await t.test(`rejects ${name}`, async () => {
    const bad = structuredClone(results); mutate(bad); await assert.rejects(verify(bad, replayOptions), error);
  });
  await t.test('same-trajectory predecessor completion is stronger than generic accounting', async () => {
    const bad = structuredClone(results), n = bad.calls.length;
    bad.protocol.maxConcurrency = n; bad.protocol.agent.maxReportedCostUsd = n * .1 + 1; reseal(bad);
    for (const call of bad.calls) call.completedBeforeAdmission = 0;
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    await assert.rejects(verify(bad, replayOptions), /before predecessor completed/);
  });
  await t.test('admission cap uses the journal floating point tolerance', async () => {
    const bad = structuredClone(results), settled = [...bad.calls].sort((a, b) => a.completionOrder - b.completionOrder);
    const maximum = Math.max(...bad.calls.map(c => settled.slice(0, c.completedBeforeAdmission).reduce((n, x) => n + x.response.metadata.costUsd, 0) +
      (c.admissionOrder - c.completedBeforeAdmission) * bad.protocol.agent.maxBudgetUsdPerCall));
    bad.protocol.agent.maxReportedCostUsd = maximum - 5e-10; reseal(bad);
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    await assert.rejects(verify(bad, replayOptions), /precise journal cost cap/);
  });
  await t.test('four-call wave must finish even when generic accounting and concurrency permit admission', async () => {
    const bad = structuredClone(results); ordered(bad)[4].completedBeforeAdmission = 3;
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    assert.ok(ordered(bad).every(c => c.admissionOrder - c.completedBeforeAdmission <= protocol.maxConcurrency));
    await assert.rejects(verify(bad, replayOptions), /preceding wave/);
  });
  await t.test('round rotation is required even with legal independent predecessor accounting', async () => {
    const bad = structuredClone(results), calls = ordered(bad), round2 = calls.filter(c => c.key.round === 2);
    [round2[0].admissionOrder, round2[1].admissionOrder] = [round2[1].admissionOrder, round2[0].admissionOrder];
    assert.doesNotThrow(() => verifyAdmissions(bad.calls, bad.protocol.agent));
    await assert.rejects(verify(bad, replayOptions), /rotating round waves/);
  });
  await t.test('completion order may differ within each admitted wave', async () => {
    const varied = structuredClone(results), calls = ordered(varied);
    for (let i = 0; i < calls.length; i += 4) for (let j = 0; j < 4; j++) calls[i + j].completionOrder = i + 4 - j;
    assert.equal((await verify(varied, replayOptions)).verified, true);
  });
});

test('frozen production verification passes offline transcripts and checks rotation wraparound plus strict provenance', async t => {
  const out = await directory(t); let requests = 0;
  const liveRegistration = { schema: 1, studyId: original.id, protocolSha256: sha(original), mode: 'single-live-directory' };
  // Simulate the public registration record without claiming a live study or
  // touching its registry. Every response is canned and every file is temporary.
  const { results } = await run({ out, protocol: original, liveRegistration, log: () => {}, provider: { async decide(obs) {
    requests++; return response(obs, original);
  } } });
  assert.equal(requests, 192);
  const report = await verify(results); assert.equal(report.verified, true); assert.equal(report.frozenProtocolChecked, true);
  assert.equal(report.totalPhysicalFightsReplayed, original.budget.totalPhysicalFights); assert.equal(report.modelCallsMade, 0);
  const jobs = original.cases.flatMap(c => original.histories.flatMap(history => [1, 2].map(replicate =>
    ({ caseSeed: c.seed, caseIndex: c.index, history, replicate, arm: 'agent' }))));
  for (const [round, offset] of [[1, 0], [2, 1], [8, 7], [9, 0]]) {
    assert.deepEqual(ordered(results).filter(c => c.key.round === round).map(c => c.key),
      [...jobs.slice(offset), ...jobs.slice(0, offset)].map(j => ({ ...j, round })));
  }
  for (const [name, mutate, pattern] of [
    ['horizon', r => { r.protocol.postRounds--; reseal(r); }, /frozen protocol/],
    ['survey order', r => { r.protocol.survey.order.reverse(); r.protocol.survey.order[0] = 'far'; reseal(r); }, /frozen protocol/],
    ['selector', r => { r.protocol.selector.halfLifeFights++; reseal(r); }, /frozen protocol/],
    ['missing registration', r => { delete r.liveRegistration; }, /live-study registration/],
    ['missing successful transcript', r => { r.calls[0].response.call = null; }, /no transcript/],
    ['missing attempts', r => { delete r.calls[0].response.metadata.attempts; }, /attempts/],
    ['missing fallback flag', r => { delete r.calls[0].response.metadata.fallbackApplied; }, /fallback/],
    ['missing usage', r => { delete r.calls[0].response.metadata.usage; }, /usage/],
  ]) await t.test(`rejects ${name}`, async () => {
    const bad = structuredClone(results); mutate(bad); await assert.rejects(verify(bad, { sources: false }), pattern);
  });
});

test('timeouts, provider exceptions and malformed output preserve applied plans, notes and unknown costs', async t => {
  const p = { ...protocol, cases: [protocol.cases[0]], histories: ['stable'], agentReplicates: 1, maxConcurrency: 1, postRounds: 6 };
  const out = await directory(t); let requests = 0;
  const { results, summary } = await run({ out, protocol: p, log: () => {}, provider: { async decide(obs) {
    requests++; const round = obs.nextRound - obs.preparationRounds;
    if (round === 4) throw Error('Offline simulated provider exception');
    const r = response(obs, p, { planId: round === 1 ? 'far' : 'lead', memory: `Note ${round}`, fail: round === 2, costUsd: round === 2 ? null : .001 });
    if (round === 5) r.decision.planId = 'invented';
    return r;
  } } });
  assert.equal(requests, 6); assert.equal(summary.failedCalls, 3); assert.equal(summary.unknownCostCalls, 2); assert.equal(summary.reportedCostUsd, null);
  const b = branch(results);
  for (const i of [1, 3, 4]) {
    assert.equal(b.rows[i].fight.planId, b.rows[i - 1].fight.planId); assert.equal(b.rows[i].decision.memory, b.rows[i - 1].decision.memory);
    assert.equal(b.rows[i].changed, false); assert.equal(b.rows[i + 1].observation.memory, b.rows[i - 1].decision.memory);
  }
  assert.equal((await verify(results, options)).uniqueAgentDecisionsReplayed, 6);
  for (const [name, mutate, pattern] of [
    ['fallback plan', c => { c.response.decision.planId = 'close'; }, /fallback plan/],
    ['fallback memory', c => { c.response.decision.memory = 'Injected'; }, /fallback memory/],
    ['missing dispatched failure transcript', c => { c.response.call = null; }, /lacks transcript/],
  ]) await t.test(`rejects ${name}`, async () => {
    const bad = structuredClone(results); mutate(bad.calls.find(c => c.key.round === 2)); await assert.rejects(verify(bad, replayOptions), pattern);
  });
  for (const [field, value] of [['costUsd', 0], ['durationMs', 1], ['models', ['invented-model']], ['retries', 1], ['fallbackApplied', false]]) {
    const bad = structuredClone(results); bad.calls.find(c => c.key.round === 4).response.metadata[field] = value;
    await assert.rejects(verify(bad, replayOptions), field === 'models' ? /Reported model identity/ : /Journal failure|provider|fallback|retries/i);
  }
});

for (const pending of [false, true]) test(`resume reuses completed calls${pending ? ' and converts a pending reservation without resending it' : ''}`, async t => {
  const p = { ...protocol, cases: [protocol.cases[0]], postRounds: 3 };
  const out = await directory(t); let requests = 0;
  const provider = { async decide(obs) { requests++; return response(obs, p, { memory: `Note ${requests}` }); } };
  await assert.rejects(run({ out, protocol: p, provider, log(line) {
    if (JSON.parse(line).completedPostRound === 1) throw Error('Offline checkpoint interruption');
  } }), /checkpoint interruption/);
  assert.equal(requests, 4);
  const partial = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8'));
  await assert.rejects(verify(partial, options), /incomplete/);
  const interrupted = ordered(partial).find(c => c.completionOrder === 4);
  if (pending) {
    const recordPath = join(out, 'calls', 'calls', `${interrupted.id}.json`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')); record.response = null; record.completionOrder = null;
    await writeFile(recordPath, JSON.stringify(record));
    const statePath = join(out, 'calls', 'state.json'), state = JSON.parse(await readFile(statePath, 'utf8'));
    state.completedCalls = 3; await writeFile(statePath, JSON.stringify(state));
  }
  const { results } = await run({ out, resume: true, protocol: p, provider, log: () => {} });
  assert.equal(requests, 12, 'The four reserved requests must never be resent');
  assert.equal(results.calls.length, 12); assert.equal((await verify(results, options)).verified, true);
  if (pending) {
    const call = results.calls.find(c => c.id === interrupted.id);
    assert.equal(call.response.error.code, 'interrupted-request-outcome-unknown'); assert.equal(call.response.metadata.costUsd, null);
    const resumed = branch(results, 'agent', call.key.history, call.key.replicate);
    assert.equal(resumed.rows[0].fight.planId, call.observation.currentPlanId);
    assert.equal(resumed.rows[1].observation.currentPlanId, resumed.rows[0].fight.planId);
    assert.equal(resumed.rows[1].observation.memory, '');
    const bad = structuredClone(results); bad.calls.find(c => c.id === interrupted.id).response.metadata.costUsd = 0;
    await assert.rejects(verify(bad, replayOptions), /canonical unknown-cost/);
  } else for (const first of partial.calls) assert.deepEqual(results.calls.find(c => c.id === first.id), first);
});

for (const kind of ['request cap', 'cost cap', 'failure stop']) test(`${kind} preserves incomplete evidence and cannot be reset on resume`, async t => {
  const p = { ...protocol, cases: [protocol.cases[0]], histories: ['stable'], agentReplicates: 1, maxConcurrency: 1,
    agent: { ...protocol.agent, ...(kind === 'request cap' ? { maxCalls: 2 } : kind === 'cost cap' ? { maxReportedCostUsd: .1015 } : {}) } };
  const out = await directory(t); let requests = 0;
  await assert.rejects(run({ out, protocol: p, log: () => {}, provider: { async decide(obs) {
    requests++; return response(obs, p, { fail: kind === 'failure stop', costUsd: kind === 'failure stop' ? null : .001 });
  } } }), kind === 'failure stop' ? /consecutive provider failures/ : /budget/);
  const partial = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8'));
  assert.equal(requests, kind === 'failure stop' ? 3 : 2); assert.equal(partial.calls.length, requests);
  assert.equal(partial.incomplete, true); assert.ok(partial.stop); assert.equal(partial.protocol.postRounds, p.postRounds);
  assert.equal(branch(partial).schedule.length, p.postRounds); assert.equal(branch(partial, 'algorithm').rows.length, p.postRounds);
  assert.equal(branch(partial, 'fixed').rows.length, p.postRounds);
  await assert.rejects(readFile(join(out, 'results.json')), /ENOENT/);
  await assert.rejects(verify(partial, options), /incomplete/);
  await assert.rejects(run({ out, resume: true, protocol: p, log: () => {}, provider: { decide() { assert.fail('Stopped request redispatched'); } } }));
});

test('admission audit preserves charged in-flight overruns and permanently latches failures despite a later success', () => {
  const limits = { maxCalls: 10, maxReportedCostUsd: .2, maxBudgetUsdPerCall: .1, maxConsecutiveFailures: 3 };
  const calls = [1, 2].map(i => ({ dispatched: true, admissionOrder: i, completedBeforeAdmission: 0, completionOrder: i,
    response: { status: 'ok', metadata: { costUsd: i === 1 ? 100 : 0 } } }));
  assert.doesNotThrow(() => verifyAdmissions(calls, limits));
  calls.push({ dispatched: true, admissionOrder: 3, completedBeforeAdmission: 2, completionOrder: 3, response: { status: 'ok', metadata: { costUsd: 0 } } });
  assert.throws(() => verifyAdmissions(calls, limits), /cost cap/);
  const failed = Array.from({ length: 4 }, (_, i) => ({ dispatched: true, admissionOrder: i + 1, completedBeforeAdmission: 0,
    completionOrder: i + 1, response: { status: i < 3 ? 'error' : 'ok', metadata: { costUsd: null } } }));
  assert.doesNotThrow(() => verifyAdmissions(failed, { ...limits, maxReportedCostUsd: 1 }));
  failed.push({ dispatched: true, admissionOrder: 5, completedBeforeAdmission: 4, completionOrder: 5, response: { status: 'ok', metadata: { costUsd: 0 } } });
  assert.throws(() => verifyAdmissions(failed, { ...limits, maxReportedCostUsd: 1 }), /failure stop/);
});

test('an already-admitted success after three failures cannot reopen the stopped journal on resume', async t => {
  const p = { ...protocol, cases: [protocol.cases[0]] }, out = await directory(t); let requests = 0;
  const provider = { async decide(obs) { requests++; return response(obs, p, { fail: requests <= 3, costUsd: null }); } };
  await assert.rejects(run({ out, protocol: p, provider, log: () => {} }), /consecutive provider failures/);
  assert.equal(requests, 4);
  const partial = JSON.parse(await readFile(join(out, 'partial.json'), 'utf8'));
  assert.deepEqual([...partial.calls].sort((a, b) => a.completionOrder - b.completionOrder).map(c => c.response.status), ['error', 'error', 'error', 'ok']);
  const state = JSON.parse(await readFile(join(out, 'calls', 'state.json'), 'utf8'));
  assert.equal(state.consecutiveFailures, 0); assert.equal(state.stoppedReason, 'provider-failure-threshold');
  await assert.rejects(run({ out, resume: true, protocol: p, log: () => {}, provider: { decide() { assert.fail('Latched stop redispatched'); } } }), /consecutive provider failures/);
});

// These checks use the production provider boundary, not fixture relaxations.
test('production provider boundary enforces reported model identity and zero reported web tools', async () => {
  const obs={plans:structuredClone(PLANS),currentPlanId:'baseline',memory:'',history:[]};
  const call={observation:obs,response:response(obs,original)};
  assert.doesNotThrow(()=>verifyProvider(call,original,false));
  for(const mutate of [
    m=>{m.models=['claude-opus-4-6'];m.modelUsage={'claude-opus-4-6':{costUSD:0}};},
    m=>{m.models=[];m.modelUsage={};},
    m=>{m.usage={server_tool_use:{web_search_requests:1}};},
    m=>{m.usage={server_tool_use:{web_fetch_requests:1}};},
    m=>{m.modelUsage[m.models[0]].webSearchRequests=1;},
  ]) {const bad=structuredClone(call);mutate(bad.response.metadata);assert.throws(()=>verifyProvider(bad,original,false),/model identity|web-tool use/);}
  call.response.metadata.usage={server_tool_use:{web_search_requests:0,web_fetch_requests:0}};
  call.response.metadata.modelUsage[original.agent.model].webSearchRequests=0;
  assert.doesNotThrow(()=>verifyProvider(call,original,false));
});

test('runner stops before combat on a disallowed reported model while preserving charged evidence', async t => {
  const out=await directory(t),p={...protocol,cases:[protocol.cases[0]],histories:['stable'],agentReplicates:1,maxConcurrency:1,postRounds:2};
  await assert.rejects(run({out,protocol:p,log:()=>{},provider:{async decide(obs){
    const value=response(obs,p);value.metadata.models=['claude-opus-4-6'];value.metadata.modelUsage={'claude-opus-4-6':{costUSD:.001}};return value;
  }}}),/Reported model identity/);
  const partial=JSON.parse(await readFile(join(out,'partial.json'),'utf8'));
  assert.equal(partial.incomplete,true);assert.equal(partial.calls.length,1);
  assert.equal(partial.calls[0].response.metadata.costUsd,.001);assert.equal(branch(partial).rows.length,0);
});
