import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PROTOCOL, checkSources } from './agentic-v3/io.mjs';
import { sha, observation, decisionFrom, validateDecision } from './agentic-v3/design.mjs';
import { warmup, fixedBranch, agentBranch, initialObservation, summarize } from './agentic-v3/trial.mjs';
import { verifyAdmissions } from './verify-agentic-v2.mjs';
export { verifyAdmissions };

const numeric = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const positiveInteger = x => Number.isSafeInteger(x) && x > 0;
const caseKey = c => JSON.stringify([c.seed, c.index]);
const dependencyKey = k => JSON.stringify([k.caseSeed, k.caseIndex, k.history, k.replicate, k.arm, k.round]);
// The unchanged v1 provider owns the request wording. Pin its system prompt as
// well as checking recorded hashes, so a self-consistently rewritten prompt is
// not mistaken for evidence from the frozen experiment.
const SYSTEM_PROMPT_SHA256 = 'f07bbe7f47f1ddef51f874612aac5aaf4c384b6a42d163329d31a40a51db5214';

function verifyProvider(call, p, fixture) {
  const { response, observation: obs } = call, m = response?.metadata;
  assert.ok(object(m), 'Missing provider metadata');
  assert.ok(numeric(m.durationMs), 'Invalid provider duration');
  assert.ok(Array.isArray(m.models) && m.models.every(x => typeof x === 'string' && x.length), 'Invalid provider models');
  assert.equal(new Set(m.models).size, m.models.length, 'Duplicate provider model');
  // The durable journal normalizes failures to legal decisions as well. A
  // malformed saved fallback is corruption, even though execution retains the
  // last applied plan independently of that provider payload.
  validateDecision(response.decision);
  if (response.status !== 'ok') {
    assert.ok(object(response.error) && typeof response.error.code === 'string' && response.error.code.length, 'Missing provider error code');
    assert.equal(response.decision.planId, obs.currentPlanId, 'Failed provider fallback plan differs from applied plan');
    assert.equal(response.decision.memory, obs.memory, 'Failed provider fallback memory differs from previous note');
  }

  // A journal-generated failure can lack adapter provenance (e.g. a crashed
  // request with unknown outcome). A successful production call cannot.
  const adapter = response.call != null || m.provider !== undefined;
  if (!fixture && response.status === 'ok') assert.ok(response.call, 'Successful provider call has no transcript');
  for (const [field, expected] of [
    ['provider', p.agent.provider], ['requestedModel', p.agent.model], ['effort', p.agent.effort],
    ['timeoutMs', p.agent.timeoutMs], ['maxBudgetUsd', p.agent.maxBudgetUsdPerCall], ['retries', p.agent.retries],
    ['maxOutputTokens', 2048],
  ]) {
    if (m[field] !== undefined || (adapter && !fixture)) assert.equal(m[field], expected, `Provider metadata ${field} differs from protocol`);
  }
  if (m.fallbackApplied !== undefined) assert.equal(m.fallbackApplied, response.status === 'error', 'Provider fallback metadata mismatch');
  if (m.attempts !== undefined) {
    assert.ok([0, 1].includes(m.attempts), 'Unexpected provider attempts');
    if (response.status === 'ok') assert.equal(m.attempts, 1, 'Successful call needs one provider attempt');
  }
  for (const field of ['cliDurationMs', 'apiDurationMs', 'numTurns', 'stdoutBytes', 'stderrBytes', 'permissionDenials']) {
    if (m[field] !== undefined) assert.ok(m[field] === null || numeric(m[field]), `Invalid provider ${field}`);
  }
  if (m.modelUsage !== undefined) {
    assert.ok(object(m.modelUsage), 'Invalid provider model usage');
    assert.deepEqual(Object.keys(m.modelUsage).sort(), [...m.models].sort(), 'Provider models differ from model usage');
    for (const usage of Object.values(m.modelUsage)) {
      assert.ok(object(usage) && Object.values(usage).every(numeric), 'Invalid provider model usage values');
    }
  }
  if (m.provider === 'claude-cli' && response.status === 'ok') {
    assert.equal(m.exitCode, 0, 'Successful provider exit code mismatch');
    assert.equal(m.permissionDenials, 0, 'Successful provider call had permission denials');
    assert.match(m.cliVersion ?? '', /^\d+\.\d+\.\d+$/, 'Missing provider CLI version');
    const [major, minor, patch] = m.cliVersion.split('.').map(Number);
    assert.ok(major > 2 || (major === 2 && (minor > 1 || (minor === 1 && patch >= 310))), 'Unsupported provider CLI version');
  }
  if (!response.call) {
    if (!fixture && !adapter) {
      assert.equal(response.status, 'error', 'Missing provider provenance');
      assert.ok(['provider-exception', 'invalid-response', 'invalid-decision', 'interrupted-request-outcome-unknown'].includes(response.error.code), 'Unknown journal failure without provider provenance');
      assert.equal(m.retries, 0, 'Journal failure retries mismatch');
      assert.equal(m.fallbackApplied, true, 'Journal failure fallback mismatch');
    }
    return;
  }
  const t = response.call;
  if (t.sampling !== undefined || !fixture) assert.equal(t.sampling, 'CLI defaults; nondeterministic; no seed or temperature control', 'Provider sampling metadata mismatch');
  assert.equal(t.prompt, `Choose the enemy NPC plan for the NEXT round using this observation JSON only.\n${JSON.stringify(obs)}`, 'Submitted model prompt mismatch');
  for (const field of ['prompt', 'systemPrompt', 'schema']) {
    assert.equal(typeof t[field], 'string', `Missing provider ${field}`);
    assert.equal(sha(t[field]), t[field + 'Sha256'], 'Provider transcript hash mismatch');
  }
  assert.equal(t.systemPromptSha256, SYSTEM_PROMPT_SHA256, 'Provider system prompt differs from frozen adapter');
  assert.deepEqual(JSON.parse(t.schema), {
    type: 'object', additionalProperties: false,
    properties: {
      planId: { type: 'string', enum: obs.plans.map(x => x.id) },
      reason: { type: 'string', maxLength: 500 }, prediction: { type: 'string', maxLength: 300 },
      memory: { type: 'string', maxLength: 1500 },
    }, required: ['planId', 'reason', 'prediction', 'memory'],
  }, 'Provider decision schema differs from frozen adapter');
  assert.equal(m.requestedModel, p.agent.model, 'Provider requested model mismatch');
  assert.equal(m.effort, p.agent.effort, 'Provider effort mismatch');
  if (t.args !== undefined || !fixture) {
    assert.deepEqual(t.args, [
      '--print', '--safe-mode', '--restricted', '--no-session-persistence',
      '--setting-sources', '', '--settings', JSON.stringify({ disableAllHooks: true, enabledPlugins: {}, autoMemoryEnabled: false, autoConnectIde: false, enableAllProjectMcpServers: false }),
      '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
      '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
      '--model', p.agent.model, '--effort', p.agent.effort, '--max-budget-usd', String(p.agent.maxBudgetUsdPerCall),
      '--max-turns', '1', '--output-format', 'json', '--input-format', 'text',
      '--system-prompt-snapshot', 'off', '--system-prompt', t.systemPrompt, '--json-schema', t.schema,
    ], 'Provider arguments differ from frozen adapter');
  }
}

function verifyDispatchWaves(calls, p) {
  const pairs = p.cases.flatMap(c => p.histories.flatMap(history => Array.from({ length: p.agentReplicates }, (_, i) => ({ caseSeed: c.seed, caseIndex: c.index, history, replicate: i + 1 }))));
  const waves = [];
  const append = keys => {
    for (let i = 0; i < keys.length; i += p.maxConcurrency) waves.push(keys.slice(i, i + p.maxConcurrency));
  };
  append(pairs.map(key => ({ ...key, arm: 'shared', round: 1 })));
  const jobs = pairs.flatMap(key => ['immediate', 'gated'].map(arm => ({ ...key, arm })));
  for (let round = 2; round <= p.postRounds; round++) {
    const offset = (round - 2) % jobs.length;
    append([...jobs.slice(offset), ...jobs.slice(0, offset)].map(key => ({ ...key, round })));
  }
  const admitted = [...calls].sort((a, b) => a.admissionOrder - b.admissionOrder);
  assert.deepEqual(admitted.map(c => c.key), waves.flat(), 'Request admission order differs from rotating round waves');
  let offset = 0, priorCompletion = 0;
  for (const wave of waves) {
    const records = admitted.slice(offset, offset + wave.length);
    for (const call of records) assert.ok(call.completedBeforeAdmission >= priorCompletion, 'Request admitted before preceding wave completed');
    priorCompletion = Math.max(priorCompletion, ...records.map(c => c.completionOrder));
    offset += wave.length;
  }
}

// Audit the exposure rule separately from applyGate/advanceAgent. Count only
// completed observed evaluation fights under the plan that actually ran.
function verifyGateHistory(branch, training, calls, p) {
  let currentPlanId = 'baseline', memory = '', count = 0;
  const completed = [...training.rows];
  for (const [i, row] of branch.rows.entries()) {
    const call = calls.get(row.callId);
    assert.ok(call, 'Missing branch decision call');
    const expectedObservation = observation(completed, currentPlanId, memory, i === 0);
    assert.deepEqual(row.observation, expectedObservation, 'Observation must use own full history, applied plan and previous note');
    assert.deepEqual(call.observation, expectedObservation, 'Call observation differs from branch history');
    const decision = decisionFrom(call.response, currentPlanId, memory);
    assert.deepEqual(row.decision, decision, 'Recorded proposal/fallback differs from provider decision');
    let applied = currentPlanId, reason;
    if (i === 0) { applied = decision.planId; reason = 'shared-initial'; }
    else if (call.response.status !== 'ok') reason = 'provider-fallback';
    else if (branch.arm === 'immediate') { applied = decision.planId; reason = 'immediate'; }
    else if (decision.planId === currentPlanId) reason = 'retain-recommended';
    else if (count >= p.gate.minimumObservedFights) { applied = decision.planId; reason = 'gate-accepted'; }
    else reason = 'gate-wait';
    const changed = applied !== currentPlanId, before = { observedOnPlan: count };
    if (i === 0 || changed) count = 0;
    assert.equal(typeof row.fight.feedback.observed, 'boolean', 'Invalid observed-feedback flag');
    if (row.fight.feedback.observed) count++;
    assert.equal(row.postRound, i + 1, 'Invalid evaluation round');
    assert.equal(row.fight.planId, applied, 'Fight used proposed rather than applied plan');
    assert.equal(row.changed, changed, 'Applied plan change mismatch');
    assert.deepEqual(row.gate, { executedPlanId: applied, changed, reason, before, after: { observedOnPlan: count } }, 'Gate history mismatch');
    currentPlanId = applied; memory = decision.memory; completed.push(row.fight);
  }
  assert.deepEqual(branch.gate, { observedOnPlan: count }, 'Final gate state mismatch');
}

export async function verify(r, { sources = true, allowProtocolOverride = false } = {}) {
  assert.equal(r.schema, 2, 'Unknown results schema');
  assert.equal(r.protocolSha256, sha(r.protocol), 'Protocol hash mismatch');
  if (!allowProtocolOverride) assert.deepEqual(r.protocol, JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8')), 'Results differ from frozen protocol');
  if (sources) await checkSources(r.sources);
  assert.ok(!r.incomplete, 'Cannot verify incomplete study');
  assert.ok(!Object.hasOwn(r, 'calibration') && !Object.hasOwn(r, 'calibrationSha256'), 'v3 reuses prior calibration; no new calibration belongs in this study');
  const p = r.protocol;
  if (!allowProtocolOverride) assert.deepEqual(r.liveRegistration,
    {schema: 1, studyId: p.id, protocolSha256: sha(p), mode: 'single-live-directory'},
    'Missing or inconsistent live-study registration');
  for (const field of ['warmupRounds', 'postRounds', 'agentReplicates', 'maxConcurrency']) assert.ok(positiveInteger(p[field]), `Invalid protocol ${field}`);
  assert.ok(positiveInteger(p.gate.minimumObservedFights), 'Invalid gate minimum');
  assert.ok(p.cases.length > 0 && new Set(p.cases.map(caseKey)).size === p.cases.length, 'Duplicate or empty cases');
  assert.ok(p.histories.length > 0 && p.histories.every(h => ['stable', 'recurring'].includes(h)) && new Set(p.histories).size === p.histories.length, 'Invalid histories');
  const expectedCalls = p.cases.length * p.histories.length * p.agentReplicates * (1 + 2 * (p.postRounds - 1));
  const expectedFights = p.cases.length * (p.warmupRounds + p.histories.length * (2 + 3 * p.agentReplicates) * p.postRounds);
  if (!allowProtocolOverride) {
    assert.equal(p.budget.uniqueModelRequests, expectedCalls, 'Protocol request arithmetic mismatch');
    assert.equal(p.budget.evaluationFights, expectedFights, 'Protocol fight arithmetic mismatch');
    assert.equal(p.budget.newCalibrationFights, 0, 'Protocol must not rerun calibration');
  }

  // Only read the previously published summary; never simulate calibration.
  const fixedReference = JSON.parse(await readFile(resolve(ROOT, p.fixedReference.summary), 'utf8'));
  assert.equal(r.fixedReferenceSha256, sha(fixedReference), 'Fixed reference summary hash mismatch');
  assert.equal(p.fixedReference.previousCalibrationFights, fixedReference.calibrationFights, 'Prior calibration fight count mismatch');
  const fixedPlans = new Map();
  for (const selection of p.fixedReference.plans) {
    const key = caseKey(selection);
    assert.ok(!fixedPlans.has(key), 'Duplicate fixed reference case');
    const prior = fixedReference.selection.filter(x => caseKey(x) === key);
    assert.equal(prior.length, 1, 'Missing or duplicate prior fixed selection');
    assert.equal(selection.planId, prior[0].planId, 'Prior calibration selection differs');
    fixedPlans.set(key, selection.planId);
  }
  for (const c of p.cases) assert.ok(fixedPlans.has(caseKey(c)), 'Missing fixed reference plan');

  assert.equal(r.calls.length, expectedCalls, 'Unexpected number of unique model requests');
  verifyAdmissions(r.calls, p.agent);
  const byId = new Map(), byDependency = new Map(), used = new Set();
  for (const call of r.calls) {
    assert.equal(call.id, sha(call.key), 'Call identity differs from key hash');
    assert.ok(!byId.has(call.id), 'Duplicate call identity');
    byId.set(call.id, call);
    const k = call.key, dependency = dependencyKey(k);
    assert.ok(!byDependency.has(dependency), 'Duplicate call key');
    byDependency.set(dependency, call);
    assert.deepEqual(Object.keys(k).sort(), ['arm', 'caseIndex', 'caseSeed', 'history', 'replicate', 'round'], 'Unexpected call key fields');
    assert.ok(p.cases.some(c => c.seed === k.caseSeed && c.index === k.caseIndex), 'Unknown request case');
    assert.ok(p.histories.includes(k.history), 'Unknown request history');
    assert.ok(positiveInteger(k.replicate) && k.replicate <= p.agentReplicates, 'Invalid request replicate');
    assert.ok(positiveInteger(k.round) && k.round <= p.postRounds, 'Invalid request round');
    assert.ok(k.round === 1 ? k.arm === 'shared' : ['immediate', 'gated'].includes(k.arm), 'Invalid request arm');
    assert.equal(call.observationSha256, sha(call.observation), 'Call observation hash mismatch');
    verifyProvider(call, p, allowProtocolOverride);
  }
  for (const call of r.calls) {
    const k = call.key;
    if (k.round === 1) continue;
    const predecessor = byDependency.get(dependencyKey({ ...k, arm: k.round === 2 ? 'shared' : k.arm, round: k.round - 1 }));
    assert.ok(predecessor, 'Missing decision predecessor');
    assert.ok(call.completedBeforeAdmission >= predecessor.completionOrder, 'Decision admitted before predecessor completed');
  }
  for (const call of r.calls) assert.ok(call.admissionOrder - call.completedBeforeAdmission <= p.maxConcurrency, 'Request concurrency exceeded');
  verifyDispatchWaves(r.calls, p);
  const lookup = (key, obs) => {
    const call = byId.get(sha(key));
    assert.ok(call, 'Missing call');
    assert.deepEqual(call.key, key, 'Call key mismatch');
    assert.deepEqual(call.observation, obs, 'Call observation mismatch');
    used.add(call.id); return call;
  };

  assert.equal(r.cases.length, p.cases.length, 'Case count mismatch');
  let evaluationFights = 0;
  for (const [ci, spec] of p.cases.entries()) {
    const c = r.cases[ci];
    assert.equal(c.seed, spec.seed); assert.equal(c.index, spec.index);
    const training = warmup(spec, p);
    assert.deepEqual(c.training, training, 'Warm-up physics/policy replay mismatch');
    evaluationFights += training.rows.length;
    assert.deepEqual(Object.keys(c.histories), p.histories, 'History identities mismatch');
    for (const [history, branches] of Object.entries(c.histories)) {
      const identities = [['retained', 0], ['fixed', 0], ...Array.from({ length: p.agentReplicates }, (_, i) => [['initial', i + 1], ['immediate', i + 1], ['gated', i + 1]]).flat()];
      assert.deepEqual(branches.map(b => [b.arm, b.replicate]), identities, 'Branch identities mismatch');
      for (const b of branches) {
        assert.equal(b.rows.length, p.postRounds, 'Branch horizon mismatch');
        assert.deepEqual(b.initial, training.checkpoint, 'Branches must share the warm-up checkpoint');
        let replay;
        if (b.arm === 'retained' || b.arm === 'fixed') {
          replay = fixedBranch(spec, p, training, history, b.arm === 'retained' ? 'baseline' : fixedPlans.get(caseKey(spec)), { arm: b.arm });
        } else {
          const first = lookup({ caseSeed: c.seed, caseIndex: c.index, history, replicate: b.replicate, arm: 'shared', round: 1 }, initialObservation(training));
          if (b.arm === 'initial') replay = fixedBranch(spec, p, training, history, decisionFrom(first.response, 'baseline', '').planId, { arm: 'initial', replicate: b.replicate, originCallId: first.id });
          else {
            verifyGateHistory(b, training, byId, p);
            replay = await agentBranch(spec, p, training, history, b.arm, b.replicate, first, async (key, obs) => lookup(key, obs));
          }
        }
        assert.deepEqual(b, replay, `Trajectory replay mismatch: ${c.seed}/${history}/${b.arm}/${b.replicate}`);
        evaluationFights += b.rows.length;
      }
      for (let replicate = 1; replicate <= p.agentReplicates; replicate++) {
        const held = branches.find(b => b.arm === 'initial' && b.replicate === replicate);
        for (const arm of ['immediate', 'gated']) {
          const b = branches.find(x => x.arm === arm && x.replicate === replicate);
          assert.equal(b.rows[0].callId, held.originCallId, 'Initial request must be shared');
          assert.deepEqual(b.rows[0].fight, held.rows[0], 'Paired first fights and Rust state differ');
        }
      }
    }
  }
  assert.equal(used.size, r.calls.length, 'Orphan call in results');
  assert.equal(evaluationFights, expectedFights, 'Physical fight count mismatch');
  const summary = summarize(r);
  assert.equal(summary.evaluationFights, evaluationFights);
  assert.equal(summary.recordedCalls, used.size);
  return {
    schema: 1, verified: true, resultsSha256: sha(r), calibrationFightsReplayed: 0,
    evaluationFightsReplayed: evaluationFights, totalPhysicalFightsReplayed: evaluationFights,
    reusedCalibrationFights: fixedReference.calibrationFights, fixedReferenceSha256: r.fixedReferenceSha256,
    uniqueAgentDecisionsReplayed: used.size, sourceHashesChecked: sources,
    frozenProtocolChecked: !allowProtocolOverride, modelCallsMade: 0,
    scope: 'Exact replay of recorded proposals, gate decisions, observations and physical/policy trajectories. Prior calibration is referenced, not rerun. Not independent replication or regenerated model outputs.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]; assert.ok(file, 'Supply results.json[.gz]');
  const raw = await readFile(resolve(ROOT, file));
  console.log(JSON.stringify(await verify(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString())), null, 2));
}
