import assert from 'node:assert/strict';
import { mean, pairedBootstrap, totalVariation } from './evaluation-support.mjs';

export function advancementDecision(measures, rules) {
  const gates = Object.fromEntries(['feint_vs_original', 'feint_continued_learning', 'reverse_vs_original', 'reverse_continued_learning'].map(name => {
    const m = measures[name], r = rules[name];
    return [name, m.meanDifference >= r.minimum_mean_gain && (r.strict_lower ? m.interval[0] > r.minimum_lower_bound : m.interval[0] >= r.minimum_lower_bound)];
  }));
  gates.cover_damage = measures.cover_damage.maximumAbsoluteDifference <= rules.cover_damage.maximum_absolute_difference;
  return { disposition: Object.values(gates).every(Boolean) ? 'advance-to-next-evaluation' : 'do-not-promote', gates };
}

export function summarizeRewards(protocol, trials, reference) {
  assert.deepEqual(trials.map(t => t.seed), protocol.seeds);
  const originals = new Map(reference.trials.map(t => [t.seed, t]));
  const slice = (rows, range) => rows.slice(range[0] - 1, range[1]);
  const stats = rows => ({ damage: mean(rows.map(r => r.damage)), playerClearRate: mean(rows.map(r => Number(r.result === 'cleared'))), playerDeathRate: mean(rows.map(r => Number(r.result === 'down'))), durationSeconds: mean(rows.map(r => r.duration)) });
  const rows = (t, style, condition) => condition === 'selected-fixed' ? reference.fixed.branches[style]
    : condition.startsWith('candidate-') ? t.branches[style][condition.slice(10)]
    : originals.get(t.seed).branches[style][condition.replace('original-', '')];
  const conditions = ['candidate-online', 'candidate-trained-frozen', 'original-online', 'original-trained-frozen', 'uniform', 'selected-fixed'];
  const windows = (style, window) => {
    const estimates = Object.fromEntries(conditions.map(c => [c, stats(trials.flatMap(t => slice(rows(t, style, c), window)))]));
    const compare = (a, b) => pairedBootstrap(trials.map(t => ({ seed: t.seed, value: stats(slice(rows(t, style, a), window)).damage })), trials.map(t => ({ seed: t.seed, value: stats(slice(rows(t, style, b), window)).damage })), protocol.uncertainty);
    return { rounds: window, conditions: estimates,
      candidateMinusOriginal: compare('candidate-online', 'original-online'),
      candidateLearningBenefit: compare('candidate-online', 'candidate-trained-frozen'),
      candidateMinusFixed: compare('candidate-online', 'selected-fixed'),
      candidateMinusUniform: compare('candidate-online', 'uniform'),
    };
  };
  const bySwitch = Object.fromEntries(protocol.switches.map(style => {
    const before = trials.map(t => t.training.online.at(-1).policy), after = trials.map(t => t.branches[style].online.at(-1).policy);
    return [style, {
      early: windows(style, protocol.windows.early_switch), late: windows(style, protocol.windows.late_switch),
      curve: Array.from({ length: protocol.post_switch_rounds / protocol.windows.curve_block_size }, (_, i) => windows(style, [i * protocol.windows.curve_block_size + 1, (i + 1) * protocol.windows.curve_block_size])),
      policyShift: { meanRoleTotalVariation: mean(before.map((b, i) => totalVariation(b, after[i]))),
        probabilities: before[0].map((c, i) => ({ role: c.role, action: c.action, before: mean(before.map(b => b[i].probability)), after: mean(after.map(a => a[i].probability)) })) },
    }];
  }));
  const measures = {
    feint_vs_original: bySwitch.feint.late.candidateMinusOriginal,
    feint_continued_learning: bySwitch.feint.late.candidateLearningBenefit,
    reverse_vs_original: bySwitch.reverse.late.candidateMinusOriginal,
    reverse_continued_learning: bySwitch.reverse.late.candidateLearningBenefit,
    cover_damage: { maximumAbsoluteDifference: Math.max(...trials.flatMap(t => slice(t.branches.cover.online, protocol.windows.late_switch).map((r, i) => Math.abs(r.damage - slice(originals.get(t.seed).branches.cover.online, protocol.windows.late_switch)[i].damage)))) },
  };
  return { protocolId: protocol.id, seedCount: trials.length, selectedFixedProfile: reference.fixed.id, ...advancementDecision(measures, protocol.gates), measures, bySwitch };
}
