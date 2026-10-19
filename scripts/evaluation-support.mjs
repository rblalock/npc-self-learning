import assert from 'node:assert/strict';

export const ROLE_ACTIONS = {
  vanguard: ['rush', 'hold'],
  flanker: ['flank_left', 'flank_right'],
  ranger: ['aim', 'lead'],
};

export function fixedProfiles() {
  return ROLE_ACTIONS.vanguard.flatMap(vanguard => ROLE_ACTIONS.flanker.flatMap(flanker =>
    ROLE_ACTIONS.ranger.map(ranger => ({ id: `${vanguard}/${flanker}/${ranger}`, actions: { vanguard, flanker, ranger } }))));
}

/** A fixed authored host policy still executes the real Rust legal-mask API. */
export function fixedPolicy(policy, actions) {
  for (const [role, allowed] of Object.entries(ROLE_ACTIONS)) assert.ok(allowed.includes(actions[role]), `Illegal fixed tactic for ${role}`);
  const selected = { ...actions };
  return {
    request(request) {
      if (request.op === 'choose') {
        assert.ok(request.allowed.includes(selected[request.role]), 'Fixed tactic is not legal in this encounter');
        return policy.request({ ...request, allowed: [selected[request.role]], baseline: true });
      }
      assert.notEqual(request.op, 'age', 'A fixed comparison must never age');
      return policy.request(request);
    },
    dispose() { policy.dispose(); },
  };
}

export function mean(values) {
  assert.ok(values.length > 0 && values.every(Number.isFinite), 'Mean requires finite, nonempty observations');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Pair by seed, aggregate rounds first, and resample independent seed-level differences. */
export function pairedBootstrap(left, right, { resamples = 5000, seed = 260018, interval = .95 } = {}) {
  const index = rows => {
    const map = new Map();
    for (const row of rows) {
      assert.ok(!map.has(row.seed) && Number.isFinite(row.value), 'Duplicate seed or invalid outcome');
      map.set(row.seed, row.value);
    }
    return map;
  };
  const a = index(left), b = index(right);
  assert.ok(a.size > 0 && a.size === b.size && [...a.keys()].every(key => b.has(key)), 'Paired seed sets differ');
  assert.ok(Number.isInteger(resamples) && resamples > 0 && interval > 0 && interval < 1);
  const pairs = [...a.keys()].sort((x, y) => x - y).map(key => ({ seed: key, left: a.get(key), right: b.get(key), difference: a.get(key) - b.get(key) }));
  let state = seed >>> 0;
  // Reproducible bootstrap RNG, independent of policy sampling.
  const random = () => { state = (state + 0x6D2B79F5) >>> 0; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const draws = Array.from({ length: resamples }, () => {
    let sum = 0;
    for (let i = 0; i < pairs.length; i++) sum += pairs[Math.floor(random() * pairs.length)].difference;
    return sum / pairs.length;
  }).sort((x, y) => x - y);
  const quantile = q => { const position = (draws.length - 1) * q, lo = Math.floor(position), part = position - lo; return draws[lo] * (1 - part) + draws[Math.ceil(position)] * part; };
  return { meanDifference: mean(pairs.map(p => p.difference)), interval: [quantile((1 - interval) / 2), quantile(1 - (1 - interval) / 2)], seedCount: pairs.length, pairs };
}

export function primaryDecision(comparison, rule) {
  return comparison.meanDifference >= rule.minimum_mean_damage_gain && comparison.interval[0] > rule.lower_interval_bound_must_exceed
    ? 'supported-in-this-fixture' : 'not-supported-by-this-run';
}

export function totalVariation(before, after) {
  assert.equal(before.length, after.length);
  const roles = new Set(before.map(cell => cell.role));
  return before.reduce((sum, cell) => {
    const next = after.find(other => other.role === cell.role && other.context === cell.context && other.action === cell.action);
    assert.ok(next, 'Policy cell identities differ');
    return sum + Math.abs(next.probability - cell.probability);
  }, 0) / (2 * roles.size);
}
