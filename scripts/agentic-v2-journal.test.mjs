import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha, validateDecision } from './agentic-v1/design.mjs';
import { createJournal } from './agentic-v2/journal.mjs';

const limits = { maxCalls: 20, maxReportedCostUsd: 2, maxBudgetUsdPerCall: .1, maxConsecutiveFailures: 3 };
const key = (round = 1, arm = 'agent') => ({ caseSeed: 41, history: 'stable', replicate: 1, arm, round });
const observation = () => ({
  schema: 1, nextRound: 2, currentPlanId: 'baseline',
  plans: [{ id: 'baseline' }, { id: 'lead' }], history: [], memory: 'Observed game evidence only.',
});
const ok = (costUsd = .01) => ({
  status: 'ok', decision: { planId: 'lead', reason: 'Try predictive aim.', prediction: 'NPC damage may improve.', memory: 'Choose from supplied plans.' },
  metadata: { costUsd, durationMs: 1, models: ['test-fixture'], attempts: 1, retries: 0, fallbackApplied: false },
  call: { prompt: 'Safe test observation', promptSha256: sha('Safe test observation') },
});
const error = (costUsd = 0) => ({ ...ok(costUsd), status: 'error', error: { code: 'test-failure' }, metadata: { ...ok(costUsd).metadata, fallbackApplied: true } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), 'agentic-v2-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const stored = (directory, id) => readJson(join(directory, 'calls', `${id}.json`));
async function fixture(t, overrides = {}) {
  const dir = await directory(t);
  const config = { directory: dir, provider: { async decide() { return ok(); } }, limits, ...overrides };
  return { dir, config, journal: await createJournal(config) };
}
function crashAfterAdmissions(dir, budget, rounds = [1]) {
  const script = `
    import { createJournal } from ${JSON.stringify(new URL('./agentic-v2/journal.mjs', import.meta.url).href)};
    const inputs = JSON.parse(process.argv[3]); let calls = 0;
    const journal = await createJournal({ directory: process.argv[1], limits: JSON.parse(process.argv[2]),
      provider: { decide() { if (++calls === inputs.length) process.exit(0); return new Promise(() => {}); } } });
    await Promise.all(inputs.map(([key, observation]) => journal.decide(key, observation)));
    process.exit(7);
  `;
  const inputs = rounds.map(round => [key(round), observation()]);
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, dir, JSON.stringify(budget), JSON.stringify(inputs)], { timeout: 10000, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.error, undefined);
}

test('records exact inputs, safe provider provenance and a filename-safe JSON key hash', async t => {
  let received;
  const response = ok(), input = observation(), inputKey = key(1, '../../agent/private');
  const { dir, journal, config } = await fixture(t, { provider: { async decide(value) { received = value; return response; } } });
  const call = await journal.decide(inputKey, input);
  assert.deepEqual(call, { id: sha(inputKey), key: inputKey, observation: input, observationSha256: sha(input), dispatched: true, admissionOrder: 1, completedBeforeAdmission: 0, completionOrder: 1, response });
  assert.deepEqual(received, input);
  assert.deepEqual((await stored(dir, call.id)).response, response);
  assert.deepEqual(await readdir(join(dir, 'calls')), [`${call.id}.json`]);
  assert.equal(journal.summary().reportedCostUsd, .01);
  await assert.rejects(createJournal(config), /must be empty/);
  const resumed = await createJournal({ ...config, resume: true, provider: { decide() { assert.fail('Completed call must not be repeated'); } } });
  assert.deepEqual(await resumed.decide(inputKey, input), call);
  assert.deepEqual(resumed.summary(), journal.summary());
});

test('different arms are distinct calls and identical concurrent requests share one dispatch', async t => {
  const started = deferred(), finish = deferred(); let calls = 0;
  const { journal } = await fixture(t, { provider: { async decide() { calls++; started.resolve(); return finish.promise; } } });
  const a = journal.decide(key(), observation());
  const b = journal.decide(key(), observation());
  await started.promise;
  assert.equal(calls, 1);
  finish.resolve(ok());
  const [first, duplicate] = await Promise.all([a, b]);
  assert.deepEqual(first, duplicate); assert.notEqual(first, duplicate);
  assert.notEqual((await journal.decide(key(1, 'agent-memory'), observation())).id, first.id);
  assert.notEqual((await journal.decide({ ...key(), caseIndex: 2 }, observation())).id, first.id);
  assert.equal(calls, 3);
});

test('snapshots resist caller, provider, result and limits mutation', async t => {
  const input = observation(), inputKey = key(), original = structuredClone(input), originalKey = structuredClone(inputKey);
  const response = ok(), started = deferred(), finish = deferred(), budget = { ...limits, maxCalls: 1 };
  const { journal } = await fixture(t, { limits: budget, provider: { async decide(value) {
    assert.deepEqual(value, original); value.memory = 'provider mutation'; started.resolve(); await finish.promise; return response;
  } } });
  const work = journal.decide(inputKey, input);
  input.memory = 'caller mutation'; inputKey.arm = 'caller mutation'; budget.maxCalls = 20;
  await started.promise; finish.resolve();
  const call = await work;
  assert.deepEqual(call.observation, original); assert.deepEqual(call.key, originalKey);
  response.decision.memory = 'late provider mutation'; call.response.decision.memory = 'result mutation'; call.observation.memory = 'result mutation';
  assert.deepEqual((await journal.decide(originalKey, original)).response, ok());
  await assert.rejects(journal.decide(key(2), original), /request budget exhausted/);
});

for (const kind of ['calls', 'cost']) test(`reserves the last ${kind} allowance synchronously before any journal await`, async t => {
  const started = deferred(), finish = deferred(); let calls = 0;
  const limited = { ...limits, maxCalls: kind === 'calls' ? 1 : 20, maxReportedCostUsd: kind === 'cost' ? .1 : 2 };
  const { journal, config } = await fixture(t, { limits: limited, provider: { async decide() { calls++; started.resolve(); return finish.promise; } } });
  const first = journal.decide(key(), observation());
  assert.equal(journal.summary().dispatchedCalls, 1);
  assert.equal(journal.summary().reservedCostUsd, .1);
  const rejected = assert.rejects(journal.decide(key(2), observation()), /budget exhausted/);
  await started.promise; finish.resolve(ok(.1));
  await Promise.all([first, rejected]);
  assert.equal(calls, 1);
  const resumed = await createJournal({ ...config, resume: true });
  await assert.rejects(resumed.decide(key(2), observation()), /budget exhausted/);
  assert.equal(calls, 1);
});

test('known cost releases only the unused reservation, zero is known, unknown cost retains full allowance', async t => {
  const responses = [ok(0), ok(null), ok(.1)]; let calls = 0;
  const { journal, config } = await fixture(t, { limits: { ...limits, maxReportedCostUsd: .2 }, provider: { async decide() { return responses[calls++]; } } });
  await journal.decide(key(), observation());
  assert.equal(journal.summary().reportedCostUsd, 0);
  await journal.decide(key(2), observation());
  assert.equal(journal.summary().reportedCostUsd, null);
  assert.equal(journal.summary().unknownCostCalls, 1);
  assert.equal(journal.summary().accountedCostUsd, .1);
  await journal.decide(key(3), observation());
  assert.equal(journal.summary().knownReportedCostUsd, .1);
  assert.equal(journal.summary().accountedCostUsd, .2);
  const resumed = await createJournal({ ...config, resume: true });
  assert.deepEqual(resumed.summary(), journal.summary());
  await assert.rejects(resumed.decide(key(4), observation()), /cost-accounting budget exhausted/);
  assert.equal(calls, 3);
});

test('actual reported overruns are not capped, and missing cost is never converted to zero', async t => {
  const { journal } = await fixture(t, { limits: { ...limits, maxReportedCostUsd: .2 }, provider: { async decide() { return ok(.4); } } });
  await journal.decide(key(), observation());
  assert.equal(journal.summary().accountedCostUsd, .4);
  await assert.rejects(journal.decide(key(2), observation()), /cost-accounting budget exhausted/);
  const { journal: unknown } = await fixture(t, { provider: { async decide() { const result = ok(); delete result.metadata.costUsd; return result; } } });
  assert.equal((await unknown.decide(key(), observation())).response.metadata.costUsd, null);
  assert.equal(unknown.summary().reportedCostUsd, null);
  assert.equal(unknown.summary().accountedCostUsd, .1);
});

test('decimal budget equality admits the final allowance without a rounding rejection', async t => {
  const { journal } = await fixture(t, { limits: { ...limits, maxReportedCostUsd: .3 }, provider: { async decide() { return ok(.1); } } });
  await Promise.all([1, 2, 3].map(round => journal.decide(key(round), observation())));
  await assert.rejects(journal.decide(key(4), observation()), /budget exhausted/);
  assert.equal(journal.summary().dispatchedCalls, 3);
});

test('three consecutive failures latch a durable stop despite a later in-flight success and resume', async t => {
  const started = deferred(), finish = deferred(); let calls = 0;
  const { dir, journal, config } = await fixture(t, { provider: { async decide() {
    calls++; if (calls === 1) { started.resolve(); return finish.promise; } return error();
  } } });
  const lateSuccess = journal.decide(key(1), observation());
  await started.promise;
  for (const round of [2, 3, 4]) await journal.decide(key(round), observation());
  assert.equal(journal.summary().consecutiveFailures, 3);
  assert.equal((await readJson(join(dir, 'state.json'))).stoppedReason, 'provider-failure-threshold');
  await assert.rejects(journal.decide(key(5), observation()), /consecutive provider failures/);
  finish.resolve(ok()); await lateSuccess;
  assert.equal(journal.summary().consecutiveFailures, 0);
  assert.equal(journal.summary().stoppedReason, 'provider-failure-threshold');
  assert.equal((await stored(dir, sha(key(1)))).completionOrder, 4);
  const resumed = await createJournal({ ...config, resume: true });
  await assert.rejects(resumed.decide(key(5), observation()), /consecutive provider failures/);
  assert.equal((await resumed.decide(key(1), observation())).response.status, 'ok', 'Stop must not prevent exact replay');
  assert.equal(calls, 4);
});

test('resume reconstructs completion order and stop history if state trails call files', async t => {
  let calls = 0;
  const { dir, journal, config } = await fixture(t, { provider: { async decide() { calls++; return error(); } } });
  const initial = await readJson(join(dir, 'state.json'));
  for (const round of [3, 1, 2]) await journal.decide(key(round), observation());
  // A crash between a call's rename/fsync and state.json's rename can leave
  // older accounting. Committed completion sequence, not filename order, wins.
  await writeFile(join(dir, 'state.json'), JSON.stringify(initial));
  const resumed = await createJournal({ ...config, resume: true });
  assert.equal(resumed.summary().consecutiveFailures, 3);
  assert.equal(resumed.summary().stoppedReason, 'provider-failure-threshold');
  await assert.rejects(resumed.decide(key(4), observation()), /consecutive provider failures/);
  assert.equal(calls, 3);
});

test('a pre-threshold failure streak survives resume while a timely success resets the streak', async t => {
  const responses = [error(), error(), ok(), error(), error(), error()]; let calls = 0;
  const { journal, config } = await fixture(t, { provider: { async decide() { return responses[calls++]; } } });
  await journal.decide(key(1), observation()); await journal.decide(key(2), observation());
  const resumed = await createJournal({ ...config, resume: true });
  assert.equal(resumed.summary().consecutiveFailures, 2);
  await resumed.decide(key(3), observation());
  assert.equal(resumed.summary().consecutiveFailures, 0);
  assert.equal(resumed.summary().stoppedReason, null);
  for (const round of [4, 5, 6]) await resumed.decide(key(round), observation());
  await assert.rejects(resumed.decide(key(7), observation()), /consecutive provider failures/);
  assert.equal(calls, 6);
});

test('a process exit after pending commit becomes unknown-cost error on resume, never a resend', async t => {
  const dir = await directory(t), limited = { ...limits, maxCalls: 1, maxReportedCostUsd: .1 };
  crashAfterAdmissions(dir, limited);
  assert.equal((await stored(dir, sha(key()))).response, null);
  assert.equal((await readJson(join(dir, 'state.json'))).reservedCostUsd, .1);
  let calls = 0;
  const config = { directory: dir, limits: limited, resume: true, provider: { async decide() { calls++; return ok(); } } };
  const resumed = await createJournal(config), result = await resumed.decide(key(), observation());
  assert.equal(result.response.status, 'error');
  assert.equal(result.response.error.code, 'interrupted-request-outcome-unknown');
  assert.equal(result.response.metadata.costUsd, null);
  assert.equal(result.response.decision.planId, 'baseline'); validateDecision(result.response.decision);
  assert.equal(resumed.summary().unknownCostCalls, 1);
  assert.equal(resumed.summary().accountedCostUsd, .1);
  assert.equal(resumed.summary().reservedCostUsd, 0);
  assert.equal(resumed.summary().reportedCostUsd, null);
  await assert.rejects(resumed.decide(key(2), observation()), /request budget exhausted/);
  assert.deepEqual(await (await createJournal(config)).decide(key(), observation()), result);
  assert.equal(calls, 0);
});

test('recovering three pending calls latches the stop before admission, including a second resume', async t => {
  const dir = await directory(t); crashAfterAdmissions(dir, limits, [1, 2, 3]);
  const config = { directory: dir, limits, resume: true, provider: { decide() { assert.fail('Pending calls must never be resent'); } } };
  const resumed = await createJournal(config);
  assert.equal(resumed.summary().consecutiveFailures, 3);
  assert.equal(resumed.summary().unknownCostCalls, 3);
  assert.equal(resumed.summary().completedCalls, 3);
  assert.equal(resumed.summary().stoppedReason, 'provider-failure-threshold');
  await assert.rejects(resumed.decide(key(4), observation()), /consecutive provider failures/);
  const again = await createJournal(config);
  assert.deepEqual(again.summary(), resumed.summary());
  for (const round of [1, 2, 3]) assert.equal((await again.decide(key(round), observation())).response.error.code, 'interrupted-request-outcome-unknown');
  await assert.rejects(again.decide(key(4), observation()), /consecutive provider failures/);
});

test('mixed completion order reconstructs a historical stop even when the last completion succeeded', async t => {
  const gates = Array.from({ length: 6 }, deferred), started = deferred(); let calls = 0;
  const inputs = gates.map((_, i) => ({ ...observation(), nextRound: i + 1 }));
  const { dir, journal, config } = await fixture(t, { provider: { async decide(value) {
    if (++calls === 6) started.resolve(); return gates[value.nextRound - 1].promise;
  } } });
  const work = inputs.map((input, i) => journal.decide(key(i + 1), input));
  await started.promise;
  const initial = await readJson(join(dir, 'state.json'));
  // Dispatch order would see error,error,ok,error,error,ok: no stop. The
  // actual completion order contains three failures followed by a success.
  for (const [round, response] of [[2, error()], [3, ok()], [1, error()], [5, error()], [4, error()], [6, ok()]]) {
    gates[round - 1].resolve(response); await work[round - 1];
  }
  assert.equal(journal.summary().consecutiveFailures, 0);
  assert.equal(journal.summary().stoppedReason, 'provider-failure-threshold');
  await writeFile(join(dir, 'state.json'), JSON.stringify(initial));
  const resumed = await createJournal({ ...config, resume: true });
  assert.deepEqual(resumed.summary(), journal.summary());
  await assert.rejects(resumed.decide(key(7), observation()), /consecutive provider failures/);
  assert.equal(calls, 6);
});

for (const boundary of ['completion', 'state']) test(`failure of the ${boundary} write after dispatch remains nonretryable on resume`, async t => {
  let calls = 0;
  const { dir, journal, config } = await fixture(t, { provider: { async decide() {
    if (++calls === 3) await mkdir(boundary === 'completion' ? join(dir, 'calls', `${sha(key(3))}.json.tmp`) : join(dir, 'state.json.tmp'));
    return error(.02);
  } } });
  for (const round of [1, 2]) await journal.decide(key(round), observation());
  await assert.rejects(journal.decide(key(3), observation()));
  await assert.rejects(journal.decide(key(4), observation()));
  assert.equal(calls, 3);
  const committed = await stored(dir, sha(key(3)));
  assert.equal(committed.response === null, boundary === 'completion');
  await rm(boundary === 'completion' ? join(dir, 'calls', `${sha(key(3))}.json.tmp`) : join(dir, 'state.json.tmp'), { recursive: true });
  const resumed = await createJournal({ ...config, resume: true });
  assert.equal(resumed.summary().stoppedReason, 'provider-failure-threshold');
  assert.equal(resumed.summary().consecutiveFailures, 3);
  assert.equal(resumed.summary().unknownCostCalls, boundary === 'completion' ? 1 : 0);
  const recovered = await resumed.decide(key(3), observation());
  assert.equal(recovered.response.error.code, boundary === 'completion' ? 'interrupted-request-outcome-unknown' : 'test-failure');
  await assert.rejects(resumed.decide(key(4), observation()), /consecutive provider failures/);
  assert.equal(calls, 3);
});

test('exact observation matching is enforced during a request, after completion and across resume', async t => {
  const finish = deferred(), started = deferred(); let calls = 0;
  const { journal, config } = await fixture(t, { provider: { async decide() { calls++; started.resolve(); return finish.promise; } } });
  const input = observation(), changed = { ...input, memory: 'different evidence' };
  const work = journal.decide(key(), input);
  const mismatch = assert.rejects(journal.decide(key(), changed), /observation changed/);
  await started.promise; finish.resolve(ok()); await Promise.all([work, mismatch]);
  await assert.rejects(journal.decide(key(), changed), /observation changed/);
  const resumed = await createJournal({ ...config, resume: true });
  await assert.rejects(resumed.decide(key(), changed), /observation changed/);
  // Serialized input order is part of the exact prompt, even if deep equality
  // alone would accept an object with reordered properties.
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  await assert.rejects(resumed.decide(key(), reordered), /observation changed/);
  assert.equal(calls, 1);
});

test('provider exceptions, malformed results and invalid decisions are recorded once with legal fallbacks', async t => {
  const variants = [
    { get() { throw new Error('private exception path /account/secret'); }, code: 'provider-exception' },
    { get: () => null, code: 'invalid-response' },
    { get: () => undefined, code: 'invalid-response' },
    { get: () => ({ ...ok(), decision: { ...ok().decision, planId: 'not-a-plan' } }), code: 'invalid-decision', cost: .01 },
    { get: () => ({ ...ok(), decision: { ...ok().decision, planId: 'far' } }), code: 'invalid-decision', cost: .01 },
    { get: () => ({ ...ok(), decision: { ...ok().decision, memory: 'x'.repeat(1501) } }), code: 'invalid-decision', cost: .01 },
    { get: () => ({ ...ok(), decision: { ...ok().decision, extra: true } }), code: 'invalid-decision', cost: .01 },
    { get: () => ({ status: 'error', error: { code: 'timeout' }, metadata: { costUsd: null } }), code: 'timeout' },
    { get: () => ok(-1), code: 'invalid-response' },
  ];
  for (const variant of variants) {
    let calls = 0;
    const { journal, config } = await fixture(t, { provider: { async decide() { calls++; return variant.get(); } } });
    const result = await journal.decide(key(), observation());
    assert.equal(result.response.status, 'error'); assert.equal(result.response.error.code, variant.code);
    validateDecision(result.response.decision);
    assert.equal(result.response.metadata.costUsd, variant.cost ?? null);
    assert.equal(JSON.stringify(result).includes('private exception'), false);
    assert.deepEqual(await journal.decide(key(), observation()), result);
    assert.deepEqual(await (await createJournal({ ...config, resume: true })).decide(key(), observation()), result);
    assert.equal(calls, 1);
  }
});

test('valid v1 error fallback decisions and metadata are preserved exactly', async t => {
  const response = error(null);
  response.decision = { planId: 'baseline', reason: 'Provider failed; retaining a supplied legal NPC plan.', prediction: '', memory: observation().memory };
  const { journal } = await fixture(t, { provider: { async decide() { return response; } } });
  assert.deepEqual((await journal.decide(key(), observation())).response, response);
  const { journal: firstLegal } = await fixture(t, { provider: { async decide() { throw new Error(); } } });
  const input = { ...observation(), currentPlanId: 'absent', plans: [{ id: 'lead' }] };
  const fallback = (await firstLegal.decide(key(), input)).response.decision;
  assert.equal(fallback.planId, 'lead'); assert.equal(fallback.memory, input.memory); validateDecision(fallback);
});

test('bad input cannot consume a reservation or reach the provider', async t => {
  let calls = 0;
  const { journal } = await fixture(t, { provider: { async decide() { calls++; return ok(); } } });
  for (const bad of [null, {}, [], { ...key(), arm: undefined }, { ...key(), round: NaN }, { ...key(), extra: undefined }]) {
    await assert.rejects(journal.decide(bad, observation()));
  }
  const cyclic = observation(); cyclic.self = cyclic;
  for (const bad of [null, {}, [], { plans: [] }, { ...observation(), plans: [{ id: 'baseline' }, { id: 'baseline' }] },
    { ...observation(), plans: [{ id: 'invented' }] }, { ...observation(), memory: {} }, { ...observation(), memory: 'x'.repeat(1501) },
    { ...observation(), secret: undefined }, { ...observation(), notes: 'x'.repeat(128 * 1024) }, cyclic]) {
    await assert.rejects(journal.decide(key(), bad));
  }
  assert.equal(journal.summary().dispatchedCalls, 0); assert.equal(calls, 0);
});

test('resume rejects changed limits, corrupted records and missing reserved calls', async t => {
  const { dir, journal, config } = await fixture(t);
  const result = await journal.decide(key(), observation());
  await assert.rejects(createJournal({ ...config, resume: true, limits: { ...limits, maxCalls: 100 } }), /limits changed/);
  const path = join(dir, 'calls', `${result.id}.json`), record = await readJson(path);
  await writeFile(path, JSON.stringify({ ...record, observation: { ...record.observation, memory: 'tampered' } }));
  await assert.rejects(createJournal({ ...config, resume: true }), /observation hash changed/);
  await writeFile(path, JSON.stringify({ ...record, key: key(2) }));
  await assert.rejects(createJournal({ ...config, resume: true }), /key hash changed/);
  await writeFile(path, JSON.stringify({ ...record, completionOrder: 2 }));
  await assert.rejects(createJournal({ ...config, resume: true }), /completion order/);
  await rm(path);
  await assert.rejects(createJournal({ ...config, resume: true }), /lost a reserved call/);
});

test('journal I/O failures prevent dispatch and poison queued admissions; logging failures cannot retry', async t => {
  let calls = 0;
  const { dir, journal } = await fixture(t, { provider: { async decide() { calls++; return ok(); } } });
  await mkdir(join(dir, 'state.json.tmp'));
  const failed = await Promise.allSettled([journal.decide(key(), observation()), journal.decide(key(2), observation())]);
  assert.ok(failed.every(result => result.status === 'rejected'));
  await assert.rejects(journal.decide(key(), observation()));
  assert.equal(calls, 0);
  for (const log of [() => { throw new Error('logger failed'); }, async () => { throw new Error('logger failed'); }]) {
    const { journal: logged } = await fixture(t, { log });
    assert.equal((await logged.decide(key(), observation())).response.status, 'ok');
    assert.equal(logged.summary().dispatchedCalls, 1);
  }
});

test('new directory must be empty and invalid limits never initialize a journal', async t => {
  const dir = await directory(t), config = { directory: dir, provider: { decide: ok }, limits };
  await assert.rejects(createJournal({ ...config, resume: true }), /ENOENT/);
  for (const invalid of [
    { maxCalls: -1 }, { maxCalls: 1.5 }, { maxCalls: Infinity }, { maxReportedCostUsd: -1 },
    { maxReportedCostUsd: NaN }, { maxBudgetUsdPerCall: 0 }, { maxBudgetUsdPerCall: Infinity }, { maxConsecutiveFailures: 0 },
  ]) await assert.rejects(createJournal({ ...config, limits: { ...limits, ...invalid } }));
  assert.deepEqual(await readdir(dir), []);
  await writeFile(join(dir, 'unrelated.txt'), 'keep');
  await assert.rejects(createJournal(config), /must be empty/);
  assert.equal(await readFile(join(dir, 'unrelated.txt'), 'utf8'), 'keep');
});
