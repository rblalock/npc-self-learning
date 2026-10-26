import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { ROOT, PROTOCOL, checkSources } from './agentic-v2/io.mjs';
import { sha, decisionFrom, validateDecision } from './agentic-v2/design.mjs';
import { calibrate, warmup, fixedBranch, startAgent, advanceAgent, initialObservation } from './agentic-v2/trial.mjs';

const STOP = 'provider-failure-threshold';
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
// The unexported system prompt in the frozen v1 provider, also covered by checkSources.
const SYSTEM_PROMPT_SHA256 = 'f07bbe7f47f1ddef51f874612aac5aaf4c384b6a42d163329d31a40a51db5214';

function requestSchedule(p) {
  const pairs = p.cases.flatMap(c => p.histories.flatMap(history =>
    Array.from({ length: p.agentReplicates }, (_, i) => ({ caseSeed: c.seed, caseIndex: c.index, history, replicate: i + 1 }))));
  const schedule = [];
  const append = keys => {
    const start = schedule.length;
    keys.forEach((key, i) => schedule.push({ key, waveStart: start + Math.floor(i / p.maxConcurrency) * p.maxConcurrency }));
  };
  append(pairs.map(pair => ({ ...pair, arm: 'shared', round: 1 })));
  const jobs = pairs.flatMap(pair => ['full', 'recent'].map(arm => ({ ...pair, arm })));
  for (let round = 2; round <= p.postRounds; round++) {
    const offset = (round - 2) % jobs.length;
    append([...jobs.slice(offset), ...jobs.slice(0, offset)].map(key => ({ ...key, round })));
  }
  return schedule;
}

// Reconstruct the journal from settled records. Unknown costs consume the full
// allowance; actual overruns are retained, including requests already in flight.
export function verifyPartialAdmissions(calls, p) {
  const limits = p.agent;
  assert.ok(Number.isSafeInteger(p.maxConcurrency) && p.maxConcurrency > 0, 'Invalid concurrency');
  assert.ok(Number.isSafeInteger(limits.maxCalls) && limits.maxCalls >= 0, 'Invalid request cap');
  assert.ok(numeric(limits.maxReportedCostUsd), 'Invalid cost cap');
  assert.ok(numeric(limits.maxBudgetUsdPerCall) && limits.maxBudgetUsdPerCall > 0, 'Invalid per-call allowance');
  assert.ok(Number.isSafeInteger(limits.maxConsecutiveFailures) && limits.maxConsecutiveFailures > 0, 'Invalid failure threshold');
  assert.ok(calls.length <= limits.maxCalls, 'Request cap exceeded');
  const expected = requestSchedule(p);
  assert.ok(calls.length < expected.length, 'All planned requests are present; use the completed-study verifier');
  const admitted = [...calls].sort((a, b) => a.admissionOrder - b.admissionOrder);
  const settled = [...calls].sort((a, b) => a.completionOrder - b.completionOrder);
  const states = [{ successfulCalls: 0, failedCalls: 0, unknownCostCalls: 0, knownReportedCostUsd: 0,
    accountedCostUsd: 0, consecutiveFailures: 0, stoppedReason: null }];
  for (const [i, c] of settled.entries()) {
    assert.equal(c.completionOrder, i + 1, 'Invalid completion order or unsettled call');
    assert.ok(c.response && ['ok', 'error'].includes(c.response.status), 'Invalid or unsettled response');
    const cost = c.response.metadata?.costUsd;
    assert.ok(cost === null || numeric(cost), 'Invalid reported cost (unknown must be null)');
    const next = { ...states.at(-1) }, ok = c.response.status === 'ok';
    next.successfulCalls += +ok; next.failedCalls += +!ok;
    next.unknownCostCalls += +(cost === null);
    next.knownReportedCostUsd += cost ?? 0;
    next.accountedCostUsd += cost ?? limits.maxBudgetUsdPerCall;
    next.consecutiveFailures = ok ? 0 : next.consecutiveFailures + 1;
    if (next.consecutiveFailures >= limits.maxConsecutiveFailures) next.stoppedReason = STOP;
    states.push(next);
  }
  let previousCompleted = 0, waveStart = -1, priorWaveCompletion = 0;
  for (const [i, c] of admitted.entries()) {
    assert.equal(c.dispatched, true, 'Call was not dispatched');
    assert.equal(c.admissionOrder, i + 1, 'Invalid admission order');
    assert.deepEqual(c.key, expected[i].key, 'Requests are not a prefix of the frozen round/wave order');
    const completed = c.completedBeforeAdmission;
    assert.ok(Number.isSafeInteger(completed) && completed >= previousCompleted && completed <= i, 'Invalid admission completion count');
    previousCompleted = completed;
    for (const prior of settled.slice(0, completed)) assert.ok(prior.admissionOrder < c.admissionOrder, 'Completion preceded admission');
    assert.ok(i - completed + 1 <= p.maxConcurrency, 'Concurrency cap exceeded');
    if (waveStart !== expected[i].waveStart) {
      waveStart = expected[i].waveStart;
      priorWaveCompletion = Math.max(0, ...admitted.slice(0, waveStart).map(x => x.completionOrder));
    }
    assert.ok(completed >= priorWaveCompletion, 'Request admitted before previous wave completed');
    const state = states[completed];
    assert.equal(state.stoppedReason, null, 'Request admitted after permanent failure stop');
    const required = state.accountedCostUsd + (i - completed + 1) * limits.maxBudgetUsdPerCall;
    const tolerance = Number.EPSILON * Math.max(required, limits.maxReportedCostUsd) * 4;
    assert.ok(Number.isFinite(required) && required <= limits.maxReportedCostUsd + tolerance, 'Request admitted after cost cap');
  }
  const state = states.at(-1);
  return { dispatchedCalls: calls.length, completedCalls: calls.length, pendingCalls: 0, ...state,
    reportedCostUsd: state.unknownCostCalls ? null : state.knownReportedCostUsd, reservedCostUsd: 0 };
}

function verifyCall(call, p) {
  assert.equal(call.id, sha(call.key), 'Call identity differs from key hash');
  assert.equal(call.observationSha256, sha(call.observation), 'Call observation hash mismatch');
  const { response, observation } = call, m = response.metadata;
  validateDecision(response.decision);
  assert.ok(observation.plans.some(plan => plan.id === response.decision.planId), 'Decision is outside supplied plans');
  assert.ok(numeric(m.durationMs), 'Invalid request duration');
  assert.equal(m.retries, 0, 'Recorded request was retried');
  assert.equal(m.fallbackApplied, response.status === 'error', 'Invalid fallback flag');
  if (response.status === 'error') {
    assert.ok(typeof response.error?.code === 'string' && response.error.code.length, 'Missing failure code');
    assert.deepEqual(response.decision, {
      planId: observation.currentPlanId,
      reason: 'Provider failed; retaining a supplied legal NPC plan.', prediction: '', memory: observation.memory ?? '',
    }, 'Provider fallback differs from supplied plan or memory');
  } else assert.ok(!Object.hasOwn(response, 'error'), 'Successful request has an error');
  const t = response.call;
  if (t === null) {
    // These journal-generated failures have no provider transcript. A pending
    // reservation itself is never a completed decision and is rejected above.
    assert.equal(response.status, 'error', 'Successful request lacks transcript');
    if (m.provider === undefined) {
      assert.ok(['provider-exception', 'invalid-response', 'interrupted-request-outcome-unknown'].includes(response.error.code), 'Unrecognized transcript-free journal failure');
      assert.deepEqual(m, { durationMs: 0, costUsd: null, models: [], retries: 0, fallbackApplied: true }, 'Invalid journal failure metadata');
      return;
    }
    // The frozen adapter can fail internally before assembling its transcript.
    assert.equal(response.error.code, 'internal_error', 'Provider failure lacks transcript');
    assert.equal(m.attempts, 0, 'Dispatched provider request lacks transcript');
  } else {
    assert.ok(t && typeof t === 'object', 'Missing call transcript');
    assert.equal(t.prompt, `Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(observation)}`, 'Prompt differs from observation');
    for (const field of ['prompt', 'systemPrompt', 'schema']) assert.equal(sha(t[field]), t[field + 'Sha256'], `${field} hash mismatch`);
    assert.equal(t.systemPromptSha256, SYSTEM_PROMPT_SHA256, 'System prompt differs from frozen provider');
    const schema = JSON.stringify({ type: 'object', additionalProperties: false, properties: {
      planId: { type: 'string', enum: observation.plans.map(plan => plan.id) },
      reason: { type: 'string', maxLength: 500 }, prediction: { type: 'string', maxLength: 300 }, memory: { type: 'string', maxLength: 1500 },
    }, required: ['planId', 'reason', 'prediction', 'memory'] });
    assert.equal(t.schema, schema, 'Decision schema differs from frozen provider');
    assert.deepEqual(t.args, [
      '--print', '--safe-mode', '--restricted', '--no-session-persistence', '--setting-sources', '',
      '--settings', '{"disableAllHooks":true,"enabledPlugins":{},"autoMemoryEnabled":false,"autoConnectIde":false,"enableAllProjectMcpServers":false}',
      '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--no-chrome',
      '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--model', p.agent.model, '--effort', p.agent.effort,
      '--max-budget-usd', String(p.agent.maxBudgetUsdPerCall), '--max-turns', '1', '--output-format', 'json', '--input-format', 'text',
      '--system-prompt-snapshot', 'off', '--system-prompt', t.systemPrompt, '--json-schema', schema,
    ], 'CLI arguments differ from frozen provider');
    assert.equal(t.sampling, 'CLI defaults; nondeterministic; no seed or temperature control');
  }
  assert.equal(m.provider, p.agent.provider, 'Provider mismatch');
  assert.equal(m.requestedModel, p.agent.model, 'Requested model mismatch');
  assert.equal(m.effort, p.agent.effort, 'Requested effort mismatch');
  assert.equal(m.timeoutMs, p.agent.timeoutMs, 'Request timeout mismatch');
  assert.equal(m.maxBudgetUsd, p.agent.maxBudgetUsdPerCall, 'Request budget mismatch');
  assert.equal(m.maxOutputTokens, 2048, 'Output token limit mismatch');
  assert.ok(m.attempts === 0 || m.attempts === 1, 'Invalid provider attempt count');
  if (response.status === 'ok') assert.equal(m.attempts, 1, 'Successful request was not attempted');
}

/** Replay a frozen partial.json, never a live journal or provider. Overrides are
 * for small offline tests only; the CLI always checks the frozen sources/protocol.
 * A self-consistent earlier snapshot cannot prove that no later journal exists.
 */
export async function verify(r, { sources = true, allowProtocolOverride = false } = {}) {
  assert.equal(r.schema, 2, 'Unknown partial schema');
  assert.equal(r.incomplete, true, 'Expected incomplete partial results');
  assert.ok(!Object.hasOwn(r, 'completedAt'), 'Partial results contain completedAt');
  assert.ok(r.stop === null || r.stop === 'Execution stopped; inspect preserved journal and limits.', 'Invalid partial stop marker');
  assert.equal(r.protocolSha256, sha(r.protocol), 'Protocol hash mismatch');
  if (!allowProtocolOverride) assert.deepEqual(r.protocol, JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8')), 'Results differ from frozen protocol');
  if (sources) await checkSources(r.sources);
  const p = r.protocol, journal = verifyPartialAdmissions(r.calls, p);
  assert.equal(r.calibration.length, p.cases.length, 'Missing or extra calibration case');
  assert.equal(r.cases.length, p.cases.length, 'Missing or extra evaluation case');
  assert.equal(sha(r.calibration), r.calibrationSha256, 'Calibration hash mismatch');
  const byKey = new Map(), used = new Set();
  for (const call of r.calls) {
    verifyCall(call, p);
    assert.ok(!byKey.has(call.id), 'Duplicate call key'); byKey.set(call.id, call);
  }
  const lookup = key => byKey.get(sha(key));
  const use = (key, obs) => {
    const call = lookup(key); assert.ok(call, 'Missing recorded call');
    assert.deepEqual(call.key, key, 'Call key mismatch');
    if (obs) assert.equal(JSON.stringify(call.observation), JSON.stringify(obs), 'Recorded observation differs from replay');
    used.add(call.id); return call;
  };
  let calibrationFights = 0, warmupFights = 0, controlFights = 0, agentFights = 0, fallbackFights = 0;
  let initializedPairs = 0, completedAgentBranches = 0;
  const branchRounds = [];
  for (const [ci, spec] of p.cases.entries()) {
    const cal = calibrate(spec, p);
    assert.deepEqual(r.calibration[ci], cal, 'Calibration replay mismatch');
    for (const batch of cal.data.batches) calibrationFights += batch.training.rows.length + Object.values(batch.histories).flat().reduce((n, b) => n + b.rows.length, 0);
    const c = r.cases[ci];
    assert.deepEqual(Object.fromEntries(Object.entries(c).filter(([key]) => !['training', 'histories'].includes(key))), spec, 'Evaluation case mismatch');
    const training = warmup(spec, p); assert.deepEqual(c.training, training, 'Warmup replay mismatch');
    warmupFights += training.rows.length;
    assert.deepEqual(Object.keys(c.histories), p.histories, 'Missing, extra or reordered history');
    for (const history of p.histories) {
      const branches = c.histories[history];
      assert.deepEqual(branches.slice(0, 2).map(b => [b.arm, b.replicate]), [['retained', 0], ['fixed', 0]], 'Missing or reordered fixed controls');
      assert.equal((branches.length - 2) % 3, 0, 'Truncated initialization group');
      const identities = new Map();
      branches.forEach(b => {
        const identity = `${b.arm}/${b.replicate}`;
        assert.ok(!identities.has(identity), 'Duplicate branch'); identities.set(identity, b);
      });
      for (const [index, arm, plan] of [[0, 'retained', 'baseline'], [1, 'fixed', cal.selection.planId]]) {
        assert.deepEqual(branches[index], fixedBranch(spec, p, training, history, plan, { arm }), 'Fixed control replay mismatch');
        controlFights += branches[index].rows.length;
      }
      const present = new Set();
      for (let i = 2; i < branches.length; i += 3) {
        const rep = branches[i].replicate;
        assert.ok(Number.isSafeInteger(rep) && rep >= 1 && rep <= p.agentReplicates, 'Invalid branch replicate');
        assert.deepEqual(branches.slice(i, i + 3).map(b => [b.arm, b.replicate]), [['initial', rep], ['full', rep], ['recent', rep]], 'Invalid initialization group');
        present.add(rep);
      }
      for (let replicate = 1; replicate <= p.agentReplicates; replicate++) {
        const key = { caseSeed: spec.seed, caseIndex: spec.index, history, replicate, arm: 'shared', round: 1 };
        const first = lookup(key);
        assert.equal(present.has(replicate), !!first, 'Shared call and initialized branches do not correspond');
        const counts = { caseSeed: spec.seed, caseIndex: spec.index, history, replicate, full: 0, recent: 0 };
        branchRounds.push(counts);
        if (!first) continue;
        use(key, initialObservation(training)); initializedPairs++;
        const initial = identities.get(`initial/${replicate}`);
        assert.deepEqual(initial, fixedBranch(spec, p, training, history, decisionFrom(first.response, 'baseline', '').planId,
          { arm: 'initial', replicate, originCallId: first.id }), 'Held-initial replay mismatch');
        controlFights += initial.rows.length;
        for (const arm of ['full', 'recent']) {
          const b = identities.get(`${arm}/${replicate}`), replay = startAgent(spec, p, training, history, arm, replicate);
          assert.ok(b.rows.length >= 1 && b.rows.length <= p.postRounds, 'Invalid partial branch length');
          for (const [i, row] of b.rows.entries()) {
            const call = use(i === 0 ? key : { ...key, arm, round: i + 1 });
            assert.equal(row.callId, call.id, 'Fight references wrong decision');
            advanceAgent(p, training, replay, call);
            // advanceAgent checks structural equality; the prompt also commits
            // to exact JSON ordering, just as the journal's duplicate check does.
            assert.equal(JSON.stringify(call.observation), JSON.stringify(replay.rows[i].observation), 'Recorded observation differs from replay');
            if (call.response.status === 'error') fallbackFights++;
          }
          assert.deepEqual(b, replay, `Partial trajectory replay mismatch: ${spec.seed}/${history}/${arm}/${replicate}`);
          assert.deepEqual(b.rows[0].fight, initial.rows[0], 'Shared first fight differs');
          agentFights += b.rows.length; counts[arm] = b.rows.length;
          if (b.rows.length === p.postRounds) completedAgentBranches++;
        }
      }
    }
  }
  assert.equal(used.size, r.calls.length, 'Orphan call or truncated recorded trajectory');
  const evaluationFights = warmupFights + controlFights + agentFights;
  return { schema: 1, verified: true, incomplete: true, effectivenessComparisonComplete: false,
    resultsSha256: sha(r), protocolSha256: r.protocolSha256, sourceHashesChecked: sources, frozenProtocolChecked: !allowProtocolOverride,
    calibrationFightsReplayed: calibrationFights, evaluationFightsReplayed: evaluationFights,
    totalPhysicalFightsReplayed: calibrationFights + evaluationFights, warmupFightsReplayed: warmupFights,
    controlFightsReplayed: controlFights, agentFightsReplayed: agentFights, fallbackAgentFightsReplayed: fallbackFights,
    uniqueAgentDecisionsReplayed: used.size, initializedPairs, completedAgentBranches, branchRounds,
    ...journal, modelCallsMade: 0,
    scope: 'Exact offline replay of all recorded calibration, controls, observations, decisions and partial agent fights. No absent outcomes are inferred; no completed effectiveness comparison or independent model-output replication. Snapshot consistency does not authenticate provider reports or prove that no later journal records exist.' };
}

// Resolve symlinks (including macOS /var -> /private/var temporary kits).
const invokedPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const file = process.argv[2]; assert.ok(file && process.argv.length === 3, 'Supply partial.json[.gz]');
  const raw = await readFile(resolve(ROOT, file));
  console.log(JSON.stringify(await verify(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString())), null, 2));
}
