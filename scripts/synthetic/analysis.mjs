import assert from "node:assert/strict";
import { mean, pairedBootstrap } from "../evaluation-support.mjs";

export function summarizePopulation(p, trials) {
  assert.deepEqual(
    trials.map((t) => t.seed),
    p.seeds,
  );
  const cases = p.test_families.flatMap((f) =>
      p.test_maps.map((m) => `${f}/${m}`),
    ),
    conditions = [
      "narrow-online",
      "narrow-frozen",
      "diverse-online",
      "diverse-frozen",
      "fixed",
    ];
  const groups = {};
  for (const group of [...cases, "aggregate"]) {
    const ids = group === "aggregate" ? cases : [group];
    groups[group] = {};
    for (const phase of ["repeat", "switch", "return"]) {
      const select = (trial, condition) =>
        ids.flatMap((id) =>
          trial.branches[id][condition].filter(
            (r) =>
              r.phase === phase &&
              r.phaseRound > p.phase_rounds - p.late_rounds,
          ),
        );
      const values = (condition) =>
        trials.map((t) => ({
          seed: t.seed,
          value: mean(select(t, condition).map((r) => r.damage)),
        }));
      const compare = (a, b) =>
        pairedBootstrap(values(a), values(b), p.uncertainty);
      const metrics = Object.fromEntries(
        conditions.map((condition) => {
          const rows = trials.flatMap((t) => select(t, condition));
          return [
            condition,
            {
              damage: mean(rows.map((r) => r.damage)),
              playerClearRate: mean(rows.map((r) => +(r.result === "cleared"))),
              playerDeathRate: mean(rows.map((r) => +(r.result === "down"))),
              duration: mean(rows.map((r) => r.duration)),
            },
          ];
        }),
      );
      groups[group][phase] = {
        metrics,
        diverseMinusNarrow: compare("diverse-online", "narrow-online"),
        diverseLearning: compare("diverse-online", "diverse-frozen"),
        narrowLearning: compare("narrow-online", "narrow-frozen"),
        diverseMinusFixed: compare("diverse-online", "fixed"),
      };
    }
  }
  const primary = groups.aggregate.switch;
  const gates = {
    diverse_training_gain:
      primary.diverseMinusNarrow.meanDifference >= p.gates.minimum_gain &&
      primary.diverseMinusNarrow.interval[0] > 0,
    continued_learning_gain:
      primary.diverseLearning.meanDifference >= p.gates.minimum_gain &&
      primary.diverseLearning.interval[0] > 0,
    no_large_case_regression: cases.every(
      (id) =>
        groups[id].switch.diverseMinusNarrow.meanDifference >=
        -p.gates.maximum_case_loss,
    ),
  };
  const counts = {
      training: 0,
      evaluation: 0,
      calibration: p.calibration_encounters,
    },
    steps = { training: { narrow: 0, diverse: 0 }, evaluation: 0 };
  for (const t of trials) {
    for (const arm of ["narrow", "diverse"]) {
      assert.equal(t.training[arm].length, p.training_rounds);
      counts.training += t.training[arm].length;
      steps.training[arm] += t.training[arm].reduce((s, r) => s + r.steps, 0);
    }
    assert.deepEqual(Object.keys(t.branches), cases);
    for (const id of cases) {
      assert.deepEqual(Object.keys(t.branches[id]), conditions);
      for (const condition of conditions) {
        const rows = t.branches[id][condition];
        assert.equal(rows.length, 3 * p.phase_rounds);
        counts.evaluation += rows.length;
        steps.evaluation += rows.reduce((s, r) => s + r.steps, 0);
      }
    }
  }
  return {
    groups,
    gates,
    counts: {
      ...counts,
      total: counts.training + counts.evaluation + counts.calibration,
    },
    steps,
    disposition: Object.values(gates).every(Boolean)
      ? "screen-passed-follow-up-required"
      : "do-not-promote",
    budgetInterpretation:
      "Matched training encounters; simulation steps and CPU cost are reported, not assumed equal. This is not a fixed-compute curriculum comparison.",
  };
}
export const formatComparison = (c) =>
  `${c.meanDifference.toFixed(2)} [${c.interval.map((x) => x.toFixed(2)).join(", ")}]`;
export function populationReport(p, summary, selected) {
  return [
    "# Synthetic player population — v1",
    "",
    `Decision: **${summary.disposition}**. ${summary.counts.total} actual encounters, including ${summary.counts.calibration} fixed-policy calibration encounters. No production learner or reward change.`,
    "",
    "Two training arms receive 48 encounters: existing clockwise demonstration on the original map, or four configurable player families on two generated map families. Each is then copied into online and frozen branches, tested on two reserved player families crossed with two reserved map families. Histories repeat a direction for 12 encounters, switch for 12, then return for 12. The fixed profile is selected using training families only.",
    "",
    `Selected fixed tactics: **${selected.id}**.`,
    "",
    "| Test case | Phase | Diverse − narrow [95% CI] | Diverse online − frozen [95% CI] | Diverse − fixed [95% CI] |",
    "| --- | --- | --- | --- | --- |",
    ...Object.entries(summary.groups).flatMap(([id, phases]) =>
      Object.entries(phases).map(
        ([phase, s]) =>
          `| ${id} | ${phase} | ${formatComparison(s.diverseMinusNarrow)} | ${formatComparison(s.diverseLearning)} | ${formatComparison(s.diverseMinusFixed)} |`,
      ),
    ),
    "",
    "Values are enemy damage to the player, averaged over the last four encounters of each phase. Intervals resample independent replicate seeds after averaging the four reserved case families. They do not treat individual rounds or the four authored families as independent population draws. Secondary comparisons are exploratory and unadjusted.",
    "",
    "## Predefined gates",
    "",
    ...Object.entries(summary.gates).map(
      ([name, pass]) => `- ${name}: ${pass ? "PASS" : "FAIL"}`,
    ),
    "",
    "## Budget and limits",
    "",
    summary.budgetInterpretation,
    `Training simulation steps: narrow ${summary.steps.training.narrow}; diverse ${summary.steps.training.diverse}.`,
    "",
    ...p.limits.map((s) => `- ${s}`),
    "",
    "## Reproduce",
    "",
    "```sh",
    "npm run evaluate:synthetic -- --out target/synthetic-replication",
    "npm run verify:synthetic -- target/synthetic-replication.results.json",
    "```",
    "",
  ];
}
