import assert from 'node:assert/strict';
import { mkdir, open, readFile, readdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sha, validateDecision } from '../agentic-v1/design.mjs';

const KEY_FIELDS = ['arm', 'caseSeed', 'history', 'replicate', 'round'];
const STOP = 'provider-failure-threshold';
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const plain = value => object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function snapshot(value, label, maxBytes = Infinity) {
  let text, copy;
  try { text = JSON.stringify(value); copy = JSON.parse(text); }
  catch { throw new TypeError(`${label} must be JSON data.`); }
  if (!isDeepStrictEqual(value, copy) || Buffer.byteLength(text) > maxBytes) {
    throw new TypeError(`${label} must be lossless, bounded JSON data.`);
  }
  return copy;
}

function checkedKey(value) {
  assert.ok(plain(value), 'Journal key must be a plain object');
  assert.ok(KEY_FIELDS.every(field => Object.hasOwn(value, field)), 'Journal key fields are missing');
  return snapshot(value, 'Journal key', 4096);
}

function checkedObservation(value) {
  const copy = snapshot(value, 'Observation', 128 * 1024);
  assert.ok(object(copy) && Array.isArray(copy.plans) && copy.plans.length, 'Observation needs legal plans');
  const ids = copy.plans.map(plan => plan?.id);
  assert.equal(new Set(ids).size, ids.length, 'Observation plan ids must be unique');
  for (const planId of ids) validateDecision({ planId, reason: '', prediction: '', memory: '' });
  assert.ok(copy.memory === undefined || (typeof copy.memory === 'string' && [...copy.memory].length <= 1500), 'Invalid observation memory');
  return copy;
}

function fallback(observation) {
  const ids = observation.plans.map(plan => plan.id);
  return validateDecision({
    planId: ids.includes(observation.currentPlanId) ? observation.currentPlanId : ids[0],
    reason: 'Provider failed; retaining a supplied legal NPC plan.',
    prediction: '', memory: observation.memory ?? '',
  });
}

function failure(code, observation) {
  return {
    status: 'error', decision: fallback(observation), error: { code }, call: null,
    metadata: { durationMs: 0, costUsd: null, models: [], retries: 0, fallbackApplied: true },
  };
}

// The supplied provider owns privacy (the frozen v1 adapter already sanitizes
// its envelope). Preserve valid responses exactly, including call provenance.
function checkedResponse(value, observation) {
  let response;
  try { response = snapshot(value, 'Provider response'); }
  catch { return failure('invalid-response', observation); }
  if (!object(response) || !['ok', 'error'].includes(response.status)) return failure('invalid-response', observation);
  if (!object(response.metadata)) response.metadata = {};
  let code = null;
  if (response.metadata.costUsd !== null && response.metadata.costUsd !== undefined && !numeric(response.metadata.costUsd)) code = 'invalid-response';
  if (!numeric(response.metadata.costUsd)) response.metadata.costUsd = null;
  try {
    validateDecision(response.decision);
    assert.ok(observation.plans.some(plan => plan.id === response.decision.planId));
  } catch {
    if (response.status === 'ok' || response.decision != null) code = 'invalid-decision';
    response.decision = fallback(observation);
    response.metadata.fallbackApplied = true;
  }
  if (code) {
    response.status = 'error';
    response.error = { code };
  } else if (response.status === 'error' && (!object(response.error) || typeof response.error.code !== 'string')) {
    response.error = { code: 'provider-error' };
  }
  return response;
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

// Rename alone is atomic, but not durable across a machine crash. Sync both
// the new file and its directory before a call is dispatched or returned.
async function durableJson(path, value) {
  const handle = await open(`${path}.tmp`, 'w', 0o600);
  try { await handle.writeFile(`${JSON.stringify(value)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await rename(`${path}.tmp`, path);
  await syncDirectory(dirname(path));
}

/**
 * One writer owns directory; resume only after the previous writer has exited.
 * decide() returns a detached {id,key,observation,observationSha256,dispatched,
 * response}. Exact duplicates share an in-flight request or reuse its result.
 * Admission/configuration/storage errors reject; provider failures are recorded
 * error responses with legal fallbacks. No request is retried.
 *
 * Limits bound admissions, not provider invoices: unknown cost consumes the
 * per-call allowance, while a reported overrun is retained at its actual value.
 * summary() is synchronous and includes reservations immediately. Each call
 * record is committed before state.json; completionOrder lets resume recover
 * the stop latch even if a crash happened between those two durable writes.
 */
export async function createJournal({ directory, provider, limits, resume = false, log = () => {} }) {
  assert.ok(typeof directory === 'string' && directory.length, 'Journal directory is required');
  assert.ok(provider && typeof provider.decide === 'function', 'Provider must implement decide');
  assert.equal(typeof log, 'function');
  assert.equal(typeof resume, 'boolean');
  assert.ok(object(limits), 'Journal limits are required');
  const budget = {
    maxCalls: limits.maxCalls,
    maxReportedCostUsd: limits.maxReportedCostUsd,
    maxBudgetUsdPerCall: limits.maxBudgetUsdPerCall,
    maxConsecutiveFailures: limits.maxConsecutiveFailures ?? 3,
  };
  assert.ok(Number.isSafeInteger(budget.maxCalls) && budget.maxCalls >= 0, 'Invalid maxCalls');
  assert.ok(numeric(budget.maxReportedCostUsd), 'Invalid maxReportedCostUsd');
  assert.ok(numeric(budget.maxBudgetUsdPerCall) && budget.maxBudgetUsdPerCall > 0, 'Invalid maxBudgetUsdPerCall');
  assert.ok(Number.isSafeInteger(budget.maxConsecutiveFailures) && budget.maxConsecutiveFailures > 0, 'Invalid maxConsecutiveFailures');
  directory = resolve(directory);
  const callsDir = join(directory, 'calls'), statePath = join(directory, 'state.json');
  const records = new Map(), inFlight = new Map();
  let completed = 0, successful = 0, knownCosts = 0, reportedCost = 0, accountedCost = 0;
  let consecutiveFailures = 0, stoppedReason = null, storageError = null, writeTail = Promise.resolve();

  function summary() {
    const pendingCalls = records.size - completed;
    return {
      dispatchedCalls: records.size, completedCalls: completed, pendingCalls,
      successfulCalls: successful, failedCalls: completed - successful,
      unknownCostCalls: records.size - knownCosts,
      reportedCostUsd: records.size === knownCosts ? reportedCost : null,
      knownReportedCostUsd: reportedCost, accountedCostUsd: accountedCost,
      reservedCostUsd: pendingCalls * budget.maxBudgetUsdPerCall,
      consecutiveFailures, stoppedReason,
    };
  }
  const state = () => ({ schema: 1, limits: budget, ...summary() });
  const publicRecord = record => structuredClone(Object.fromEntries(
    ['id', 'key', 'observation', 'observationSha256', 'dispatched', 'response'].map(field => [field, record[field]]),
  ));
  function persist(record) {
    const savedRecord = structuredClone(record), savedState = state();
    const work = writeTail.then(async () => {
      if (storageError) throw storageError;
      await durableJson(join(callsDir, `${savedRecord.id}.json`), savedRecord);
      await durableJson(statePath, savedState);
    });
    // Poison the queue after any I/O failure; queued admissions must not call
    // the provider after a preceding journal write failed.
    writeTail = work.catch(error => { storageError ??= error; });
    return work;
  }
  function account(response) {
    completed++;
    if (response.status === 'ok') { successful++; consecutiveFailures = 0; }
    else consecutiveFailures++;
    if (consecutiveFailures >= budget.maxConsecutiveFailures) stoppedReason = STOP;
    const cost = response.metadata.costUsd;
    if (numeric(cost)) { knownCosts++; reportedCost += cost; }
    accountedCost += cost ?? budget.maxBudgetUsdPerCall;
  }

  if (!resume) {
    await mkdir(directory, { recursive: true });
    assert.equal((await readdir(directory)).length, 0, 'New journal directory must be empty; use resume');
    await mkdir(callsDir);
    await syncDirectory(dirname(directory));
    await durableJson(statePath, state());
  } else {
    const saved = JSON.parse(await readFile(statePath, 'utf8'));
    assert.equal(saved.schema, 1, 'Unknown journal schema');
    assert.deepEqual(saved.limits, budget, 'Journal limits changed on resume');
    assert.ok(saved.stoppedReason === null || saved.stoppedReason === STOP, 'Invalid journal stop latch');
    stoppedReason = saved.stoppedReason;
    for (const name of await readdir(directory)) assert.ok(['calls', 'state.json', 'state.json.tmp'].includes(name), 'Unexpected journal file');
    for (const name of await readdir(callsDir)) {
      // Unrenamed temporary files cannot have authorized a provider call.
      if (/^[a-f0-9]{64}\.json\.tmp$/.test(name)) continue;
      assert.match(name, /^[a-f0-9]{64}\.json$/, 'Unexpected call filename');
      const record = JSON.parse(await readFile(join(callsDir, name), 'utf8'));
      checkedKey(record.key); checkedObservation(record.observation);
      assert.equal(record.id, sha(record.key), 'Journal key hash changed');
      assert.equal(name, `${record.id}.json`, 'Journal filename differs from key hash');
      assert.equal(record.observationSha256, sha(record.observation), 'Journal observation hash changed');
      assert.equal(record.dispatched, true, 'Invalid journal reservation');
      if (record.response !== null) {
        assert.deepEqual(record.response, checkedResponse(record.response, record.observation), 'Invalid stored provider response');
        assert.ok(Number.isSafeInteger(record.completionOrder) && record.completionOrder > 0, 'Invalid completion order');
      } else assert.equal(record.completionOrder, null, 'Pending call has a completion order');
      records.set(record.id, record);
    }
    const settled = [...records.values()].filter(record => record.response !== null).sort((a, b) => a.completionOrder - b.completionOrder);
    for (const record of settled) {
      assert.equal(record.completionOrder, completed + 1, 'Journal completion order has a gap or duplicate');
      account(record.response);
    }
    assert.ok(Number.isSafeInteger(saved.dispatchedCalls) && saved.dispatchedCalls <= records.size, 'Journal lost a reserved call');
    assert.ok(Number.isSafeInteger(saved.completedCalls) && saved.completedCalls <= completed, 'Journal lost a completed call');
    for (const record of records.values()) if (record.response === null) {
      record.response = failure('interrupted-request-outcome-unknown', record.observation);
      account(record.response); record.completionOrder = completed;
      await persist(record);
    }
    await durableJson(statePath, state());
  }

  async function decide(key, observation) {
    key = checkedKey(key); observation = checkedObservation(observation);
    const id = sha(key), observationSha256 = sha(observation);
    if (storageError) throw storageError;
    const existing = records.get(id);
    if (existing) {
      assert.equal(JSON.stringify(existing.key), JSON.stringify(key), 'Journal key changed');
      assert.equal(JSON.stringify(existing.observation), JSON.stringify(observation), 'Journal observation changed');
      if (inFlight.has(id)) await inFlight.get(id);
      return publicRecord(existing);
    }
    assert.equal(stoppedReason, null, 'Stopped after consecutive provider failures; inspect preserved calls');
    assert.ok(records.size < budget.maxCalls, 'Agent request budget exhausted');
    const nextCost = accountedCost + (records.size - completed + 1) * budget.maxBudgetUsdPerCall;
    const tolerance = Number.EPSILON * Math.max(nextCost, budget.maxReportedCostUsd) * 4;
    assert.ok(Number.isFinite(nextCost) && nextCost <= budget.maxReportedCostUsd + tolerance, 'Agent cost-accounting budget exhausted');
    // No await before insertion/reservation: concurrent branches cannot both
    // consume the last allowance, including while the journal write is pending.
    const record = { id, key, observation, observationSha256, dispatched: true, response: null, completionOrder: null };
    records.set(id, record);
    const admission = persist(record);
    const work = (async () => {
      await admission;
      let response;
      try { response = checkedResponse(await provider.decide(structuredClone(observation)), observation); }
      catch { response = failure('provider-exception', observation); }
      // All in-memory settlement changes and queue insertion are synchronous.
      // A later success may reset the streak, but never the latched stop reason.
      record.response = response; account(response); record.completionOrder = completed;
      await persist(record);
      try { Promise.resolve(log(JSON.stringify({ id, ...key, status: response.status, ...summary() }))).catch(() => {}); }
      catch { /* Logging cannot turn a recorded call into a retry. */ }
    })();
    inFlight.set(id, work);
    try { await work; return publicRecord(record); }
    finally { inFlight.delete(id); }
  }
  return { decide, summary };
}
