import assert from 'node:assert/strict';
import { mean, pairedBootstrap } from './evaluation-support.mjs';

export function summarizeScenarios(p, trials, fixed) {
  const late = rows => rows.slice(p.windows.late_switch[0] - 1, p.windows.late_switch[1]);
  const groups = Object.fromEntries([...p.scenarios.map(s => s.id), 'aggregate'].map(group => {
    const worlds = group === 'aggregate' ? p.scenarios.map(s => s.id) : [group];
    return [group, Object.fromEntries(p.switches.map(style => {
      const rows = (mode, condition, seed) => worlds.flatMap(id => {
        const trial = trials.find(t => t.scenario === id && t.seed === seed && t.mode === mode);
        assert.ok(trial, `Missing trial ${id}/${seed}/${mode}`);
        return late(trial.branches[style][condition]);
      });
      const values = (mode, condition) => p.seeds.map(seed => ({ seed, value: mean(rows(mode, condition, seed).map(r => r.damage)) }));
      const individual = values('individual', 'online'), additive = values('additive-team', 'online');
      const individualFrozen = values('individual', 'trained-frozen'), additiveFrozen = values('additive-team', 'trained-frozen');
      const metric = (mode, condition) => {
        const all = p.seeds.flatMap(seed => rows(mode, condition, seed));
        return { damage: mean(all.map(r => r.damage)), playerClearRate: mean(all.map(r => +(r.result === 'cleared'))), playerDeathRate: mean(all.map(r => +(r.result === 'down'))), duration: mean(all.map(r => r.duration)) };
      };
      const fixedDamage = mean(worlds.flatMap(id => late(fixed.find(f => f.scenario === id).branches[style]).map(r => r.damage)));
      const compare = (a,b) => pairedBootstrap(a,b,p.uncertainty);
      return [style, {
        individual: metric('individual','online'), individualFrozen: metric('individual','trained-frozen'),
        additive: metric('additive-team','online'), additiveFrozen: metric('additive-team','trained-frozen'), fixedDamage,
        additiveMinusOriginal: compare(additive, individual), individualLearningBenefit: compare(individual,individualFrozen),
        additiveLearningBenefit: compare(additive,additiveFrozen),
        additiveMinusFixed: compare(additive, p.seeds.map(seed => ({seed,value:fixedDamage}))),
        individualMinusFixed: compare(individual, p.seeds.map(seed => ({seed,value:fixedDamage}))),
      }];
    }))];
  }));
  const measures = {
    feint_vs_original: groups.aggregate.feint.additiveMinusOriginal,
    feint_continued_learning: groups.aggregate.feint.additiveLearningBenefit,
    reverse_vs_original: groups.aggregate.reverse.additiveMinusOriginal,
    reverse_continued_learning: groups.aggregate.reverse.additiveLearningBenefit,
  };
  const gates = Object.fromEntries(Object.entries(measures).map(([key, m]) => {
    const rule = p.gates[key];
    return [key, m.meanDifference >= rule.minimum_mean_gain && (rule.strict_lower ? m.interval[0] > rule.minimum_lower_bound : m.interval[0] >= rule.minimum_lower_bound)];
  }));
  gates.no_scenario_regression = p.scenarios.every(s => p.switches.every(style => groups[s.id][style].additiveMinusOriginal.meanDifference >= -p.gates.maximum_scenario_mean_loss));
  return { groups, measures, gates, disposition: Object.values(gates).every(Boolean) ? 'scenario-screen-passed-development-gate-still-required' : 'do-not-promote' };
}
