import assert from 'node:assert/strict';
import { sha, validateDecision } from '../agentic-v2/design.mjs';

// Preserve the already audited provider boundary without changing frozen v3.
const numeric = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const positiveInteger = x => Number.isSafeInteger(x) && x > 0;
const caseKey = c => JSON.stringify([c.seed, c.index]);
const dependencyKey = k => JSON.stringify([k.caseSeed, k.caseIndex, k.history, k.replicate, k.arm, k.round]);
// The unchanged v1 provider owns the request wording. Pin its system prompt as
// well as checking recorded hashes, so a self-consistently rewritten prompt is
// not mistaken for evidence from the frozen experiment.
const SYSTEM_PROMPT_SHA256 = 'f07bbe7f47f1ddef51f874612aac5aaf4c384b6a42d163329d31a40a51db5214';

export function verifyProvider(call, p, fixture) {
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
