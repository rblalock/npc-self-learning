import { mean, pairedBootstrap } from '../evaluation-support.mjs';
import { expectedTable } from '../change-detection-v1/design.mjs';
import { mixture } from '../change-detection-v1/design.mjs';
import { stressChecks } from './stress.mjs';

export function analyze(trials, tables, p) {
  const groups = {}, changing = Object.keys(p.histories).filter(h => h !== 'stable'), stress=stressChecks(p);
  const value = (t, arm, histories) => mean(histories.map(h => mean(t.histories[h].arms[arm].rows.map(r => r.damage))));
  for (const group of [...new Set(trials.map(t => t.group))]) {
    const cases = trials.filter(t => t.group === group), comparisons = {};
    const compare = (arm, histories) => pairedBootstrap(cases.map(t => ({ seed: t.seed, value: value(t, arm, histories) })),
      cases.map(t => ({ seed: t.seed, value: value(t, 'retained', histories) })), p.uncertainty);
    for (const arm of p.arms.filter(a => a !== 'retained')) {
      const gain = compare(arm, changing), stable = compare(arm, ['stable']);
      const events = cases.flatMap(t => t.histories.stable.arms[arm].rows), interventions = events.filter(r => r.applied).length;
      const interventionRate = 100 * interventions / events.length, worstStable = Math.min(...stable.pairs.map(x => x.difference)), g = p.development_gates;
      const gates = { enoughCases: cases.length >= g.minimum_cases_per_role, usefulChangeGain: gain.meanDifference >= g.minimum_changing_gain_hp,
        stableMean: stable.meanDifference >= g.minimum_stable_mean_hp, stableLowerBound: stable.interval[0] >= g.minimum_stable_lower_bound_hp,
        worstStableCase: worstStable >= g.minimum_worst_seed_stable_gain_hp, interventionRate: interventionRate <= g.maximum_stable_interventions_per_100,
        stressChecks: !p.candidates.includes(arm) || stress[arm].pass };
      comparisons[arm] = { gain, stable, worstStable, interventions, interventionRate,
        suppressedAlarms: events.filter(r => r.event && !r.applied).length, gates, passes: Object.values(gates).every(Boolean),
        histories: Object.fromEntries(Object.keys(p.histories).map(h => [h, { effect: compare(arm, [h]),
          interventions: cases.reduce((n, t) => n + t.histories[h].arms[arm].rows.filter(r => r.applied || r.signal).length, 0) }])) };
    }
    groups[group] = { cases: cases.length, comparisons };
  }
  const eligible = p.candidates.filter(a => Object.values(groups).every(g => g.comparisons[a].passes));
  eligible.sort((a, b) => Math.min(...Object.values(groups).map(g => g.comparisons[b].gain.meanDifference)) - Math.min(...Object.values(groups).map(g => g.comparisons[a].gain.meanDifference)) || p.candidates.indexOf(a) - p.candidates.indexOf(b));
  const curves = trials.map(t => {
    const table = tables.find(a => a.fixture.group === t.group && a.fixture.seed === t.seed);
    return { group: t.group, seed: t.seed, histories: Object.fromEntries(Object.entries(t.histories).map(([h, history]) => [h,
      Object.fromEntries(Object.entries(history.arms).map(([a, arm]) => [a, Array.from({ length: p.histories[h] / 16 }, (_, i) => {
        const rows = arm.rows.slice(i * 16, i * 16 + 16);
        return { endingRound: (i + 1) * 16, damage: mean(rows.map(r => r.damage)), expectedRegret: mean(rows.map(r => {
          const outcomes = expectedTable(table, mixture(h, r.round, p.histories[h]));
          return Math.max(...outcomes.map(e => e.damage)) - outcomes.reduce((v, e) => v + e.damage * r.choice.probabilities.find(q => q.action === e.action).probability, 0);
        })) };
      })]))])) };
  });
  return { groups, curves, stress, eligible, selected: eligible[0] ?? null, disposition: eligible.length ? 'candidate-earned-fresh-validation' : 'no-candidate-advances',
    budget: { cases: trials.length, cachedTrainingTransitions: trials.length * p.training_rounds,
      cachedComparisonTransitions: trials.length * p.arms.length * Object.values(p.histories).reduce((a,b) => a+b, 0),
      newScoredPhysicalEncounters: 0, extraProbes: 0 } };
}
