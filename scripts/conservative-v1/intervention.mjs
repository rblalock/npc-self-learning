import assert from 'node:assert/strict';
import { RewardChangeDetector } from '../change-detection-v1/detector.mjs';

const key = o => JSON.stringify([o.role, o.context, o.action]);

export class BatchDeclineDetector {
  constructor(identities, { window, threshold, confirmations }) {
    this.options = { window, threshold, confirmations };
    assert.ok(Number.isInteger(window) && window >= 2);
    assert.ok(threshold > 0 && threshold <= 2);
    assert.ok(Number.isInteger(confirmations) && confirmations >= 1);
    this.entries = new Map(identities.map(id => [key(id), { ...id, reference: null, values: [], streak: 0 }]));
    assert.equal(this.entries.size, identities.length);
  }
  observe(o, { armed = true } = {}) {
    const e = this.entries.get(key(o));
    assert.ok(e); assert.equal(typeof o.observed, 'boolean');
    assert.ok(Number.isFinite(o.reward) && o.reward >= -1 && o.reward <= 1);
    if (!o.observed) return null;
    e.values.push(o.reward);
    if (!armed) e.streak = 0;
    if (e.values.length < this.options.window) return null;
    const values = e.values; e.values = [];
    const recent = values.reduce((a, b) => a + b, 0) / values.length;
    if (e.reference === null || !armed) { e.reference = recent; e.streak = 0; return null; }
    const older = e.reference, delta = recent - older;
    if (delta > -this.options.threshold) { e.reference = recent; e.streak = 0; return null; }
    if (++e.streak < this.options.confirmations) return null;
    const event = { role: o.role, context: o.context, action: o.action, older, recent, delta, observations: values, confirmations: e.streak };
    e.reference = recent; e.streak = 0;
    return event;
  }
}

export function detectorFor(arm, identities, options) {
  return arm === 'batch-soft' ? new BatchDeclineDetector(identities, options) : new RewardChangeDetector(identities, options);
}

export function intervene(snapshot, arm, event, signal = false) {
  const apply = signal || !!event && (arm === 'legacy-reset' || event.delta < 0);
  if (!apply) return { snapshot, applied: false };
  const soft = arm === 'down-soft' || arm === 'batch-soft';
  const next = structuredClone(snapshot);
  next.cells = next.cells.map(c => signal || c.role === event.role && c.context === event.context
    ? { ...c, score: soft ? c.score * .5 : 0, samples: soft ? c.samples : 0 } : c);
  return { snapshot: next, applied: true };
}
