import assert from 'node:assert/strict';

// Host-side research adapter. Input is ONLY observed, completed feedback for a
// configured role/context/action. No scenario, phase, clock, or oracle is accepted.
export const DEFAULTS = Object.freeze({ window: 4, threshold: .2, confirmations: 2 });
const key = ({ role, context, action }) => JSON.stringify([role, context, action]);
export class RewardChangeDetector {
  constructor(identities, options = DEFAULTS) {
    this.options = { ...options };
    assert.ok(Number.isInteger(options.window) && options.window >= 2 && options.window <= 32);
    assert.ok(options.threshold > 0 && options.threshold <= 2);
    assert.ok(Number.isInteger(options.confirmations) && options.confirmations > 0);
    this.entries = new Map(identities.map(id => [key(id), { ...id, values: [], direction: 0, streak: 0 }]));
    assert.equal(this.entries.size, identities.length);
  }
  observe({ role, context, action, reward, observed }, { armed = true } = {}) {
    const e = this.entries.get(key({ role, context, action }));
    assert.ok(e, 'Unknown detector identity');
    assert.equal(typeof observed, 'boolean');
    assert.ok(Number.isFinite(reward) && reward >= -1 && reward <= 1);
    if (!observed) return null;
    const { window: w, threshold, confirmations } = this.options;
    e.values.push(reward);
    if (e.values.length > 2 * w) e.values.shift();
    if (!armed || e.values.length < 2 * w) { e.streak = 0; e.direction = 0; return null; }
    const older = e.values.slice(0, w).reduce((a, b) => a + b, 0) / w;
    const recent = e.values.slice(w).reduce((a, b) => a + b, 0) / w;
    const delta = recent - older, direction = Math.abs(delta) >= threshold ? Math.sign(delta) : 0;
    e.streak = direction === 0 ? 0 : direction === e.direction ? e.streak + 1 : 1;
    e.direction = direction;
    if (e.streak < confirmations) return null;
    const event = { role, context, action, older, recent, delta, observations: [...e.values], confirmations: e.streak };
    // Retain the newer half as a starting reference; do not repeatedly alarm on
    // the same old observations. No additional combat probe is requested.
    e.values = e.values.slice(w); e.streak = 0; e.direction = 0;
    return event;
  }
  snapshot() { return { options: { ...this.options }, entries: structuredClone([...this.entries.values()]) }; }
}

export function forget(snapshot, mode, event = null) {
  assert.ok(['all', 'context', 'action'].includes(mode));
  if (mode !== 'all') assert.ok(event);
  const next = structuredClone(snapshot);
  next.cells = next.cells.map(c => {
    const selected = mode === 'all' || c.role === event.role && c.context === event.context && (mode === 'context' || c.action === event.action);
    return selected ? { ...c, score: 0, samples: 0 } : c;
  });
  return next; // Counters, config and RNG are preserved. Apply only after commit.
}
