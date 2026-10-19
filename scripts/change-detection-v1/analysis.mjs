import assert from 'node:assert/strict';
import { mean, pairedBootstrap } from '../evaluation-support.mjs';
import { recovery } from '../opportunity-v2/metrics.mjs';
import { GROUPS, HISTORIES, ARMS, expectedTable } from './design.mjs';
const sum = xs => xs.reduce((a, b) => a + b, 0);
const physical = r => Object.fromEntries(['damage','health','result','duration','steps','enemies','inputSha256','inputs'].map(k => [k,r[k]]));

export function armMetrics(record, schedule, table, signals, p) {
  const rows = record.steps.map((step, i) => {
    const r = step.block.rows[0], s = schedule[i], entries = table.blocks[s.side].map(b => b.rows[0]);
    const actual = entries.find(e => e.choices[0].action === r.choices[0].action);
    assert.deepEqual(physical(r), physical(actual));
    const distribution = expectedTable(table, s.probabilityB), probabilities = r.choices[0].probabilities;
    assert.ok(Math.abs(sum(probabilities.map(x => x.probability)) - 1) < 1e-10);
    const best = Math.max(...distribution.map(e => e.damage)), worst = Math.min(...distribution.map(e => e.damage));
    const expectedDamage = sum(distribution.map(e => e.damage * probabilities.find(x => x.action === e.action).probability));
    const expectedRegret = Math.max(0, best - expectedDamage);
    return { round: s.round, side: s.side, probabilityB: s.probabilityB, damage: r.damage,
      realizedRegret: Math.max(...entries.map(e => e.damage)) - r.damage,
      expectedDamage, expectedRegret, range: best - worst,
      normalizedRegret: best === worst ? 0 : expectedRegret / (best - worst),
      event: step.event, signal: step.signal };
  });
  const alarms = record.steps.filter(s => s.event).map(s => s.round);
  const recoveries = signals.map((start, i) => {
    const end = (signals[i + 1] ?? rows.length + 1) - 1;
    const phase = rows.slice(start - 1, end).map((r, i) => ({ ...r, round: i + 1 }));
    return { start, end, ...recovery(phase, p.recovery.threshold, p.recovery.consecutive) };
  });
  return { meanDamage: mean(rows.map(r => r.damage)), cumulativeRegret: sum(rows.map(r => r.realizedRegret)),
    cumulativeExpectedRegret: sum(rows.map(r => r.expectedRegret)), alarms, recoveries, rows };
}
export function caseMetrics(t, table, p) {
  return { seed: t.seed, group: t.group, index: t.index, histories: Object.fromEntries(HISTORIES.map(h => {
    const record = t.histories[h];
    const eventStarts = h === 'stable' ? [] : h === 'recurring' ? [1, p.test_rounds / 2 + 1] : [1];
    return [h, Object.fromEntries(ARMS.map(a => {
      const m = armMetrics(record.arms[a], record.schedule, table, record.signals, p);
      m.detection = eventStarts.map((start, i) => {
        const end = (eventStarts[i + 1] ?? p.test_rounds + 1) - 1;
        const alarm = m.alarms.find(r => r >= start && r <= end) ?? null;
        return { start, end, firstAlarm: alarm, delayEncounters: alarm === null ? null : alarm - start + 1,
          restrictedChecks: alarm === null ? end - start + 2 : alarm - start + 1 };
      });
      return [a, m];
    }))];
  })) };
}
export function analyze(p, audits, trials) {
  const cases = trials.map(t => caseMetrics(t, audits.find(a => a.fixture.group === t.group && a.fixture.seed === t.seed && a.fixture.index === t.index), p));
  const groups = {};
  for (const g of GROUPS) {
    const cs = cases.filter(c => c.group === g), comparisons = {}, histories = {};
    const compare = (arm, hs, uncertainty) => cs.length ? pairedBootstrap(
      cs.map(c => ({ seed: c.seed, value: mean(hs.map(h => c.histories[h][arm].meanDamage)) })),
      cs.map(c => ({ seed: c.seed, value: mean(hs.map(h => c.histories[h].retained.meanDamage)) })), uncertainty) : null;
    for (const arm of ['detector-reset', 'detector-selective']) {
      const primary = compare(arm, HISTORIES.filter(h => h !== 'stable'), p.primary_uncertainty);
      const stability = compare(arm, ['stable'], p.primary_uncertainty);
      const falseAlarms = sum(cs.map(c => c.histories.stable[arm].alarms.length));
      const falseAlarmsPer100 = cs.length ? falseAlarms / (cs.length * p.test_rounds) * 100 : null;
      const gates = { enoughSeeds: cs.length >= p.minimum_qualified_seeds,
        meaningfulGain: !!primary && primary.meanDifference >= p.minimum_gain,
        positiveInterval: !!primary && primary.interval[0] > 0,
        stableNoninferiority: !!stability && stability.interval[0] > -p.stable_harm_margin,
        falseAlarmRate: falseAlarmsPer100 !== null && falseAlarmsPer100 <= p.maximum_false_alarms_per_100 };
      comparisons[arm] = { primary, stability, falseAlarms, falseAlarmsPer100, gates, pass: Object.values(gates).every(Boolean) };
    }
    for (const h of HISTORIES) {
      histories[h] = Object.fromEntries(ARMS.map(a => {
        const ms = cs.map(c => c.histories[h][a]), detections = ms.flatMap(m => m.detection), displaced = ms.flatMap(m => m.recoveries).filter(r => r.initiallyDisplaced);
        return [a, { secondaryGain: compare(a, [h], p.secondary_uncertainty),
          meanDamage: ms.length ? mean(ms.map(m => m.meanDamage)) : null,
          meanCumulativeRegret: ms.length ? mean(ms.map(m => m.cumulativeRegret)) : null,
          meanCumulativeExpectedRegret: ms.length ? mean(ms.map(m => m.cumulativeExpectedRegret)) : null,
          alarms: sum(ms.map(m => m.alarms.length)),
          detection: { events: detections.length, detected: detections.filter(d => d.firstAlarm !== null).length,
            missed: detections.filter(d => d.firstAlarm === null).length,
            restrictedChecks: detections.length ? mean(detections.map(d => d.restrictedChecks)) : null },
          recovery: { initiallyDisplaced: displaced.length, recovered: displaced.filter(r => r.reached).length,
            restrictedChecks: displaced.length ? mean(displaced.map(r => r.restrictedChecks)) : null },
          curve: Array.from({ length: p.test_rounds / 4 }, (_, i) => ({ endingRound: (i + 1) * 4,
            expectedRegret: ms.length ? mean(ms.flatMap(m => m.rows.slice(i * 4, i * 4 + 4).map(r => r.expectedRegret))) : null })) }];
      }));
    }
    groups[g] = { qualified: cs.length, candidates: audits.filter(a => a.fixture.group === g).length,
      acceptedCandidates: audits.filter(a => a.fixture.group === g && a.admission.accepted).length, comparisons, histories };
  }
  const auditRows = audits.flatMap(a => a.blocks.flatMap(bs => bs.flatMap(b => b.rows)));
  const learningRows = trials.flatMap(t => [...t.training.rows, ...HISTORIES.flatMap(h => ARMS.flatMap(a => t.histories[h].arms[a].steps.flatMap(s => s.block.rows)))]);
  return { groups, cases, budget: { auditEncounters: auditRows.length, learningEncounters: learningRows.length,
    total: auditRows.length + learningRows.length, physicsSteps: sum([...auditRows, ...learningRows].map(r => r.steps)) } };
}
