import assert from 'node:assert/strict';
import { verifyBlock } from '../research/verify.mjs';
import { createPolicy } from '../research/policy.mjs';
import { HISTORIES, ARMS, sequence, signalRounds } from './design.mjs';
import { observation } from './trial.mjs';

// Separate detector reconstruction: retain complete audit history, recompute
// adjacent-window tests from it, and truncate only when the specified rule fires.
function referenceDetector(cells, options) {
  const entries = cells.map(({ role, context, action }) => ({ role, context, action, values: [], direction: 0, streak: 0 }));
  return { snapshot: () => ({ options, entries: structuredClone(entries) }), feed(o, armed) {
    const e = entries.find(e => e.role === o.role && e.context === o.context && e.action === o.action);
    if (!o.observed) return null;
    const n = options.window, values = [...e.values, o.reward].slice(-2 * n);
    e.values = values;
    if (!armed || values.length < 2 * n) { e.direction = 0; e.streak = 0; return null; }
    let older = 0, recent = 0;
    for (let i = 0; i < n; i++) { older += values[i]; recent += values[n + i]; }
    older /= n; recent /= n;
    const delta = recent - older, sign = Math.abs(delta) < options.threshold ? 0 : delta > 0 ? 1 : -1;
    const streak = sign === 0 ? 0 : sign !== e.direction ? 1 : e.streak + 1;
    e.direction = sign; e.streak = streak;
    if (streak < options.confirmations) return null;
    const event = { role: o.role, context: o.context, action: o.action, older, recent, delta, observations: values, confirmations: streak };
    e.values = values.slice(n); e.direction = 0; e.streak = 0; return event;
  } };
}
function resetCells(snapshot, predicate) {
  return { ...snapshot, cells: snapshot.cells.map(c => predicate(c) ? { role:c.role,context:c.context,action:c.action,score:0,samples:0 } : c) };
}
export function verify(t, table, p) {
  assert.equal(t.seed, table.fixture.seed); assert.equal(t.group, table.fixture.group); assert.equal(t.index, table.fixture.index);
  const fresh = createPolicy(t.training.seed, t.training.spec);
  assert.deepEqual(t.training.initial, fresh.request({ op: 'snapshot' })); fresh.dispose();
  assert.deepEqual(t.training.options, { learning: true, baseline: false, forced: null });
  assert.deepEqual(t.trainingSchedule, sequence(table.fixture, 'stable', p.training_rounds, { training: true }));
  assert.deepEqual(t.training.scenarios, t.trainingSchedule.map(s => s.scenario));
  let decisions = verifyBlock(t.training).decisions, encounters = t.training.rows.length;
  for (const h of HISTORIES) {
    const history = t.histories[h];
    assert.deepEqual(history.schedule, sequence(table.fixture, h, p.test_rounds));
    assert.deepEqual(history.signals, signalRounds(table, history.schedule));
    for (const a of ARMS) {
      const record = history.arms[a], detector = referenceDetector(t.training.snapshot.cells, p.detector);
      for (const r of t.training.rows) detector.feed(observation(r), false);
      assert.deepEqual(record.detectorInitial, detector.snapshot());
      assert.equal(record.steps.length, p.test_rounds);
      let current = t.training.snapshot;
      for (const [i, step] of record.steps.entries()) {
        const s = history.schedule[i], signal = a === 'signaled-reset' && history.signals.includes(s.round);
        assert.equal(step.round, i + 1); assert.equal(step.signal, signal);
        const b = step.block;
        assert.equal(b.seed, t.training.seed); assert.deepEqual(b.spec, t.training.spec);
        assert.deepEqual(b.options, { learning: a !== 'frozen', baseline: false, forced: null });
        assert.deepEqual(b.scenarios, [s.scenario]);
        assert.deepEqual(b.initial, signal ? resetCells(current, () => true) : current);
        const v = verifyBlock(b); decisions += v.decisions; encounters += v.encounters;
        const event = a.startsWith('detector-') ? detector.feed(observation(b.rows[0]), true) : null;
        assert.deepEqual(step.event, event);
        const expected = event ? resetCells(b.snapshot, c => c.role === event.role && c.context === event.context && (a === 'detector-reset' || c.action === event.action)) : b.snapshot;
        assert.deepEqual(step.afterIntervention, expected);
        current = expected;
      }
      assert.deepEqual(record.detectorFinal, detector.snapshot());
    }
  }
  return { decisions, encounters };
}
