import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, PROTOCOL, checkSources } from './agentic-v4/io.mjs';
import { PLANS, sha, schedule, decisionFrom } from './agentic-v2/design.mjs';
import { publicRound } from './agentic-v1/design.mjs';
import { surveySchedule, observation, algorithmDecision } from './agentic-v4/design.mjs';
import { prepare, fixedBranch, algorithmBranch, agentBranch, initialObservation, summarize } from './agentic-v4/trial.mjs';
import { verifyProvider } from './agentic-v4/provider-audit.mjs';
import { verifyAdmissions } from './verify-agentic-v2.mjs';
export { verifyAdmissions };

const positiveInteger = x => Number.isSafeInteger(x) && x > 0;
const numeric = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const caseKey = c => JSON.stringify([c.seed, c.index]);
const dependencyKey = k => JSON.stringify([k.caseSeed, k.caseIndex, k.history, k.replicate, k.arm, k.round]);
const observationFields = ['schema', 'objective', 'nextRound', 'preparationRounds', 'currentPlanId', 'plans', 'rules', 'history', 'memory'].sort();

function verifyProviderEvidence(call, p, fixture) {
  verifyProvider(call, p, fixture);
  const { response } = call, m = response.metadata;
  if (!response.call && m.provider === undefined && response.status === 'error') {
    assert.deepEqual(m, { durationMs: 0, costUsd: null, models: [], retries: 0, fallbackApplied: true }, 'Journal failure must retain canonical unknown-cost accounting');
  } else if (response.call || m.provider !== undefined) {
    assert.ok([0, 1].includes(m.attempts), 'Missing or invalid provider attempts');
    assert.equal(m.fallbackApplied, response.status === 'error', 'Provider fallback metadata mismatch');
    if (!response.call) {
      assert.equal(response.error?.code, 'internal_error', 'Dispatched provider failure lacks transcript');
      assert.equal(m.attempts, 0, 'Dispatched provider failure lacks transcript');
    }
    if (m.usage !== undefined || !fixture) {
      assert.ok(m.usage === null || object(m.usage), 'Invalid provider usage');
      if (m.usage) for (const [key, value] of Object.entries(m.usage)) {
        const nested = { server_tool_use: ['web_search_requests', 'web_fetch_requests'], cache_creation: ['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens'] }[key];
        if (nested) assert.ok(object(value) && Object.entries(value).every(([k, v]) => nested.includes(k) && numeric(v)), 'Invalid nested provider usage');
        else assert.ok(['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].includes(key) && numeric(value), 'Invalid provider usage field');
      }
    }
  }
}

// Retain the frozen v2 admission audit, then use the journal's own floating
// point tolerance rather than widening a monetary cap by a fixed epsilon.
function verifyReservationPrecision(calls, limits) {
  const settled = [...calls].sort((a, b) => a.completionOrder - b.completionOrder);
  const costs = [0];
  for (const call of settled) costs.push(costs.at(-1) + (call.response.metadata.costUsd ?? limits.maxBudgetUsdPerCall));
  for (const call of calls) {
    const required = costs[call.completedBeforeAdmission] + (call.admissionOrder - call.completedBeforeAdmission) * limits.maxBudgetUsdPerCall;
    const tolerance = Number.EPSILON * Math.max(required, limits.maxReportedCostUsd) * 4;
    assert.ok(Number.isFinite(required) && required <= limits.maxReportedCostUsd + tolerance, 'Request admitted after precise journal cost cap');
  }
}

// Derive dispatches from the protocol, never from the recorded call ordering.
// Round one has eight separate agent decisions, including separate repetitions.
function verifyDispatchWaves(calls, p) {
  const jobs = p.cases.flatMap(c => p.histories.flatMap(history =>
    Array.from({ length: p.agentReplicates }, (_, i) =>
      ({ caseSeed: c.seed, caseIndex: c.index, history, replicate: i + 1, arm: 'agent' }))));
  const waves = [];
  for (let round = 1; round <= p.postRounds; round++) {
    const offset = (round - 1) % jobs.length;
    const ordered = [...jobs.slice(offset), ...jobs.slice(0, offset)].map(key => ({ ...key, round }));
    for (let i = 0; i < ordered.length; i += p.maxConcurrency) waves.push(ordered.slice(i, i + p.maxConcurrency));
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

function verifyObservation(obs, completed, currentPlanId, memory, p) {
  assert.deepEqual(Object.keys(obs).sort(), observationFields, 'Observation contains fields outside the allowlist');
  assert.deepEqual(obs.plans, PLANS, 'Observation plan menu differs from frozen catalog');
  assert.equal(obs.nextRound, completed.length + 1, 'Observation clock differs from completed physical fights');
  assert.equal(obs.preparationRounds, p.warmupRounds + p.survey.order.length, 'Observation preparation clock differs from protocol');
  assert.deepEqual(obs.history, completed.map(publicRound), 'Observation must use only allowlisted completed own-history evidence');
  assert.deepEqual(obs, observation(completed, currentPlanId, memory, p), 'Observation must use own history, actual plan and previous note');
}

// Check the selector boundary independently of trajectory reconstruction. Only
// agent rows consume calls; a held control may reference its own first call but
// never consumes it a second time, and the algorithm never consumes one.
function verifySelectorHistory(branch, training, calls, used, p, spec, history) {
  const completed = [...training.rows];
  let currentPlanId = training.rows.at(-1).planId, memory = '';
  for (const [i, row] of branch.rows.entries()) {
    verifyObservation(row.observation, completed, currentPlanId, memory, p);
    assert.equal(row.observationSha256, sha(row.observation), 'Row observation hash mismatch');
    let decision;
    if (branch.arm === 'agent') {
      const call = calls.get(row.callId);
      assert.ok(call, 'Missing branch decision call');
      assert.deepEqual(call.key, { caseSeed: spec.seed, caseIndex: spec.index, history, replicate: branch.replicate, arm: 'agent', round: i + 1 }, 'Branch uses a call from another trajectory or round');
      assert.ok(!used.has(call.id), 'Agent decision call reused across rows or repetitions');
      used.add(call.id);
      assert.deepEqual(call.observation, row.observation, 'Call observation differs from own branch history');
      decision = decisionFrom(call.response, currentPlanId, memory);
    } else {
      assert.equal(row.callId, null, 'Algorithm cannot consume an agent call');
      decision = algorithmDecision(row.observation, p.selector);
    }
    assert.deepEqual(row.decision, decision, 'Recorded selector decision differs from algorithm/provider replay');
    assert.equal(row.postRound, i + 1, 'Invalid evaluation round');
    assert.equal(row.fight.round, completed.length + 1, 'Physical round clock mismatch');
    assert.equal(row.fight.planId, decision.planId, 'Fight did not execute the selected complete plan');
    assert.equal(row.changed, decision.planId !== currentPlanId, 'Applied plan change mismatch');
    currentPlanId = row.fight.planId; memory = decision.memory; completed.push(row.fight);
  }
}

export async function verify(r, { sources = true, allowProtocolOverride = false } = {}) {
  assert.equal(r.schema, 2, 'Unknown results schema');
  assert.equal(r.protocolSha256, sha(r.protocol), 'Protocol hash mismatch');
  if (!allowProtocolOverride) assert.deepEqual(r.protocol, JSON.parse(await readFile(resolve(ROOT, PROTOCOL), 'utf8')), 'Results differ from frozen protocol');
  if (sources) await checkSources(r.sources);
  assert.ok(!r.incomplete, 'Cannot verify incomplete study');
  assert.ok(typeof r.startedAt === 'string' && Number.isFinite(Date.parse(r.startedAt)) &&
    typeof r.completedAt === 'string' && Number.isFinite(Date.parse(r.completedAt)) &&
    Date.parse(r.completedAt) >= Date.parse(r.startedAt), 'Missing or invalid study completion timestamp');
  assert.ok(!Object.hasOwn(r, 'calibration') && !Object.hasOwn(r, 'calibrationSha256'), 'v4 reuses prior calibration; no new calibration belongs in this study');
  const p = r.protocol;
  if (!allowProtocolOverride) assert.deepEqual(r.liveRegistration,
    { schema: 1, studyId: p.id, protocolSha256: sha(p), mode: 'single-live-directory' },
    'Missing or inconsistent live-study registration');
  for (const field of ['warmupRounds', 'postRounds', 'agentReplicates', 'maxConcurrency']) assert.ok(positiveInteger(p[field]), `Invalid protocol ${field}`);
  assert.ok(p.cases.length > 0 && new Set(p.cases.map(caseKey)).size === p.cases.length, 'Duplicate or empty cases');
  assert.ok(p.histories.length > 0 && p.histories.every(h => ['stable', 'recurring'].includes(h)) && new Set(p.histories).size === p.histories.length, 'Invalid histories');
  for (const field of ['maxCalls', 'maxConsecutiveFailures']) assert.ok(positiveInteger(p.agent[field]), `Invalid protocol ${field}`);
  assert.ok(numeric(p.agent.maxReportedCostUsd), 'Invalid protocol cost cap');
  assert.ok(numeric(p.agent.maxBudgetUsdPerCall) && p.agent.maxBudgetUsdPerCall > 0, 'Invalid protocol per-call budget');
  const expectedCalls = p.cases.length * p.histories.length * p.agentReplicates * p.postRounds;
  const expectedEvaluation = p.cases.length * p.histories.length * (4 + 2 * p.agentReplicates) * p.postRounds;
  const expectedAlgorithm = p.cases.flatMap(c => p.histories.flatMap(history =>
    Array.from({ length: p.postRounds }, (_, i) => ({ caseSeed: c.seed, caseIndex: c.index, history, round: i + 1 }))));
  assert.ok(Array.isArray(r.algorithmRuntime), 'Missing algorithm timing records');
  assert.deepEqual(r.algorithmRuntime.map(({ durationMs, ...key }) => key), expectedAlgorithm, 'Algorithm timing identities/coverage differ from protocol');
  for (const timing of r.algorithmRuntime) assert.ok(numeric(timing.durationMs), 'Invalid algorithm duration');
  // Running the schedule builder checks the actual frozen survey contract;
  // recorded coverage/length labels are not evidence of the intended survey.
  const surveys = p.cases.map(c => surveySchedule(c, p));
  for (const survey of surveys) {
    const counts = PLANS.map(plan => survey.filter(s => s.planId === plan.id).length);
    assert.ok(counts[0] > 0 && counts.every(n => n === counts[0]), 'Survey must cover every frozen plan equally');
    assert.equal(counts.reduce((a, b) => a + b, 0), survey.length, 'Survey contains an unknown plan');
  }
  const expectedPreparation = surveys.reduce((n, s) => n + p.warmupRounds + s.length, 0);
  if (!allowProtocolOverride) {
    assert.equal(p.budget.uniqueModelRequests, expectedCalls, 'Protocol request arithmetic mismatch');
    assert.equal(p.budget.preparationFights, expectedPreparation, 'Protocol preparation arithmetic mismatch');
    assert.equal(p.budget.warmupFights, p.cases.length * p.warmupRounds, 'Protocol warmup arithmetic mismatch');
    assert.equal(p.budget.surveyFights, surveys.reduce((n, s) => n + s.length, 0), 'Protocol survey arithmetic mismatch');
    assert.equal(p.budget.evaluationFights, expectedEvaluation, 'Protocol evaluation arithmetic mismatch');
    assert.equal(p.budget.totalPhysicalFights, expectedPreparation + expectedEvaluation, 'Protocol total fight arithmetic mismatch');
    assert.equal(p.budget.newCalibrationFights, 0, 'Protocol must not rerun calibration');
    assert.equal(p.budget.extraSimulationProbes, 0, 'Protocol must not add simulation probes');
    assert.equal(p.budget.newAlgorithmTuningFights, 0, 'Protocol must not add algorithm tuning fights');
  }

  // The prior fixed selection is a diagnostic with extra v2 experience. Read
  // and hash its published summary; never rerun those calibration fights.
  const fixedReference = JSON.parse(await readFile(resolve(ROOT, p.fixedReference.summary), 'utf8'));
  assert.equal(fixedReference.id, 'agentic-npc-ablation-v2', 'Fixed reference must be the prior v2 study');
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
  verifyReservationPrecision(r.calls, p.agent);
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
    assert.equal(k.arm, 'agent', 'Every request must belong to its own agent trajectory');
    assert.equal(call.observationSha256, sha(call.observation), 'Call observation hash mismatch');
    verifyProviderEvidence(call, p, allowProtocolOverride);
  }
  for (const call of r.calls) {
    const k = call.key;
    if (k.round === 1) continue;
    const predecessor = byDependency.get(dependencyKey({ ...k, round: k.round - 1 }));
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
    return call;
  };

  assert.equal(r.cases.length, p.cases.length, 'Case count mismatch');
  let preparationFights = 0, evaluationFights = 0;
  for (const [ci, spec] of p.cases.entries()) {
    const c = r.cases[ci];
    assert.equal(c.seed, spec.seed); assert.equal(c.index, spec.index);
    const training = prepare(spec, p);
    assert.deepEqual(c.training, training, 'Preparation warmup/survey physics and Rust checkpoint replay mismatch');
    assert.deepEqual(training.survey.schedule, surveys[ci], 'Preparation survey schedule mismatch');
    assert.equal(training.rows.length, p.warmupRounds + surveys[ci].length, 'Preparation horizon mismatch');
    preparationFights += training.rows.length;
    assert.deepEqual(Object.keys(c.histories), p.histories, 'History identities mismatch');
    for (const [history, branches] of Object.entries(c.histories)) {
      const identities = [['retained', 0], ['fixed', 0], ['algorithm', 0], ['algorithm-initial', 0],
        ...Array.from({ length: p.agentReplicates }, (_, i) => [['agent', i + 1], ['agent-initial', i + 1]]).flat()];
      assert.deepEqual(branches.map(b => [b.arm, b.replicate]), identities, 'Branch identities mismatch');
      for (const b of branches) {
        assert.equal(b.rows.length, p.postRounds, 'Branch horizon mismatch');
        assert.deepEqual(b.initial, training.checkpoint, 'Branches must share the complete preparation checkpoint');
        assert.deepEqual(b.schedule, schedule(spec, p, history), 'Branch schedule differs from frozen v2 schedule');
      }
      for (const [arm, replicate] of [['algorithm', 0], ...Array.from({ length: p.agentReplicates }, (_, i) => ['agent', i + 1])]) {
        const active = branches.find(b => b.arm === arm && b.replicate === replicate);
        const held = branches.find(b => b.arm === `${arm}-initial` && b.replicate === replicate);
        assert.equal(held.originCallId, active.rows[0].callId, 'Held initial control must reference only its own first call');
        assert.equal(held.planId, active.rows[0].fight.planId, 'Held complete plan differs from first fight');
        assert.deepEqual(active.rows[0].fight, held.rows[0], 'Paired first fights and Rust states differ');
        assert.ok(held.rows.every(f => f.planId === held.planId), 'Held control changed its complete plan');
      }
      for (const b of branches) {
        let replay;
        if (b.arm === 'algorithm' || b.arm === 'agent') {
          verifySelectorHistory(b, training, byId, used, p, spec, history);
          replay = b.arm === 'algorithm' ? algorithmBranch(spec, p, training, history)
            : await agentBranch(spec, p, training, history, b.replicate, async (key, obs) => lookup(key, obs));
        } else {
          let planId, originCallId = null;
          if (b.arm === 'retained') planId = 'baseline';
          else if (b.arm === 'fixed') planId = fixedPlans.get(caseKey(spec));
          else if (b.arm === 'algorithm-initial') planId = algorithmDecision(initialObservation(training, p), p.selector).planId;
          else {
            const obs = initialObservation(training, p);
            const first = lookup({ caseSeed: spec.seed, caseIndex: spec.index, history, replicate: b.replicate, arm: 'agent', round: 1 }, obs);
            planId = decisionFrom(first.response, obs.currentPlanId, obs.memory).planId; originCallId = first.id;
          }
          replay = fixedBranch(spec, p, training, history, planId, { arm: b.arm, replicate: b.replicate, originCallId });
        }
        assert.deepEqual(b, replay, `Trajectory replay mismatch: ${c.seed}/${history}/${b.arm}/${b.replicate}`);
        evaluationFights += b.rows.length;
      }
    }
  }
  assert.equal(used.size, r.calls.length, 'Orphan call in results');
  assert.equal(preparationFights, expectedPreparation, 'Preparation fight count mismatch');
  assert.equal(evaluationFights, expectedEvaluation, 'Evaluation fight count mismatch');
  const summary = summarize(r);
  assert.equal(summary.preparationFights, preparationFights);
  assert.equal(summary.evaluationFights, evaluationFights);
  assert.equal(summary.scoredFights, preparationFights + evaluationFights);
  assert.equal(summary.recordedCalls, used.size);
  assert.equal(summary.algorithmSelectionCalls, expectedAlgorithm.length);
  return {
    schema: 1, verified: true, resultsSha256: sha(r), calibrationFightsReplayed: 0,
    preparationFightsReplayed: preparationFights, evaluationFightsReplayed: evaluationFights,
    totalPhysicalFightsReplayed: preparationFights + evaluationFights,
    reusedCalibrationFights: fixedReference.calibrationFights, fixedReferenceSha256: r.fixedReferenceSha256,
    uniqueAgentDecisionsReplayed: used.size, algorithmDecisionsReplayed: expectedAlgorithm.length, sourceHashesChecked: sources,
    frozenProtocolChecked: !allowProtocolOverride, modelCallsMade: 0,
    scope: 'Exact replay of preparation, deterministic algorithm choices, recorded agent decisions, observations and complete physical/Rust trajectories. Prior calibration is referenced, not rerun. Not independent replication or regenerated model outputs.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]; assert.ok(file, 'Supply results.json[.gz]');
  const raw = await readFile(resolve(ROOT, file));
  console.log(JSON.stringify(await verify(JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString())), null, 2));
}
