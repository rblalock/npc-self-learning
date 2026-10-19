import assert from 'node:assert/strict';
import { randomAt, seedFor } from '../synthetic/random.mjs';
export const GROUPS = ['solo-vanguard', 'solo-flanker', 'solo-ranger'];
export const HISTORIES = ['abrupt', 'gradual', 'recurring', 'stable'];
export const ARMS = ['retained', 'frozen', 'detector-reset', 'detector-selective', 'signaled-reset'];
export function mixture(history, round, rounds = 64) {
  assert.ok(HISTORIES.includes(history));
  if (history === 'stable') return .1;
  if (history === 'gradual') return .1 + .8 * Math.min(round / (rounds / 2), 1);
  return history === 'recurring' && round > rounds / 2 ? .1 : .9;
}
export function sequence(f, history, count, { training = false } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const probabilityB = training ? .1 : mixture(history, i + 1, count);
    const side = +(randomAt(seedFor(f.seed, f.group, 'change-schedule'), training ? 'training' : history, i) < probabilityB);
    return { round: i + 1, probabilityB, side, scenario: { ...structuredClone(f.scenarios[side]),
      id: `change/${f.group}/${f.seed}/${training ? 'training' : history}/${i + 1}` } };
  });
}
export function expectedTable(table, probabilityB) {
  return table.blocks[0].map((b, i) => ({ action: b.rows[0].choices[0].action,
    damage: (1 - probabilityB) * b.rows[0].damage + probabilityB * table.blocks[1][i].rows[0].damage }));
}
export function optimum(table, probabilityB) {
  const entries = expectedTable(table, probabilityB), best = Math.max(...entries.map(e => e.damage));
  return entries.filter(e => e.damage === best).map(e => e.action).sort().join('|');
}
// Oracle timing is an explicitly privileged control, isolated from the detector.
export function signalRounds(table, schedule) {
  let previous = optimum(table, .1).split('|')[0]; const rounds = [];
  for (const s of schedule) {
    const current = optimum(table, s.probabilityB).split('|');
    if (!current.includes(previous)) { rounds.push(s.round); previous = current[0]; }
  }
  return rounds;
}
