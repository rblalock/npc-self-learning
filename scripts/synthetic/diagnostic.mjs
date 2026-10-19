import assert from "node:assert/strict";
import { mean, fixedProfiles, ROLE_ACTIONS } from "../evaluation-support.mjs";
import { createArena, runEncounter } from "./runner.mjs";
import { ORIGINAL } from "./scenarios.mjs";

export function diagnosticWorlds(scenarioProtocol) {
  return [
    ORIGINAL,
    ...scenarioProtocol.scenarios.map((s) => ({
      ...s,
      family: s.id,
      player: ORIGINAL.player,
      waypoints: [],
    })),
  ];
}
export function diagnosticMatrix(protocol, worlds) {
  return worlds.flatMap((world) =>
    protocol.styles.flatMap((style) =>
      fixedProfiles().map((profile) => {
        const arena = createArena(protocol.seed, {
          actions: profile.actions,
          learning: false,
        });
        try {
          return {
            world: world.id,
            style,
            profile,
            ...runEncounter(arena, {
              id: `${world.id}/${style}/${profile.id}`,
              phase: "diagnostic",
              world,
              legacyStyle: style,
            }),
          };
        } finally {
          arena.policy.dispose();
        }
      }),
    ),
  );
}
const roles = Object.keys(ROLE_ACTIONS);
function expectedDamage(matrix, cells) {
  return matrix.reduce(
    (sum, row) =>
      sum +
      row.damage *
        roles.reduce(
          (p, role) =>
            p *
            cells.find(
              (c) => c.role === role && c.action === row.profile.actions[role],
            ).probability,
          1,
        ),
    0,
  );
}
const permutations = roles.flatMap((a) =>
  roles
    .filter((b) => b !== a)
    .flatMap((b) =>
      roles.filter((c) => c !== a && c !== b).map((c) => [a, b, c]),
    ),
);
export function diagnose(protocol, matrix, reference) {
  const pairs = [];
  for (const world of [...new Set(matrix.map((r) => r.world))])
    for (const style of protocol.styles) {
      const rows = matrix.filter((r) => r.world === world && r.style === style);
      assert.equal(rows.length, 8);
      for (const role of roles) {
        const [first, second] = ROLE_ACTIONS[role];
        for (const a of rows.filter((r) => r.profile.actions[role] === first)) {
          const b = rows.find(
            (r) =>
              r.profile.actions[role] === second &&
              roles
                .filter((x) => x !== role)
                .every((x) => r.profile.actions[x] === a.profile.actions[x]),
          );
          const ownA = a.recap.find((r) => r.role === role),
            ownB = b.recap.find((r) => r.role === role);
          pairs.push({
            world,
            style,
            role,
            from: a.profile.id,
            to: b.profile.id,
            teamDamageChange: b.damage - a.damage,
            ownDamageChange: ownB.damage - ownA.damage,
            rewardChange: ownB.reward - ownA.reward,
            bothObserved: ownA.observed && ownB.observed,
          });
        }
      }
    }
  const feint = matrix.filter(
    (r) => r.world === "original" && r.style === "feint",
  );
  const decompositions = reference.trials.map((trial) => {
    const frozen = trial.training.online.at(-1).policy,
      rows = trial.branches.feint.online;
    const byRound = rows
      .slice(protocol.late_rounds[0] - 1, protocol.late_rounds[1])
      .map((_, i) => {
        const round = protocol.late_rounds[0] - 1 + i,
          changed = round ? rows[round - 1].policy : frozen,
          contribution = Object.fromEntries(roles.map((r) => [r, 0]));
        for (const order of permutations) {
          let cells = frozen;
          let previous = expectedDamage(feint, cells);
          for (const role of order) {
            cells = cells.map((c) =>
              c.role === role
                ? changed.find(
                    (n) => n.role === c.role && n.action === c.action,
                  )
                : c,
            );
            const next = expectedDamage(feint, cells);
            contribution[role] += (next - previous) / permutations.length;
            previous = next;
          }
        }
        const change =
          expectedDamage(feint, changed) - expectedDamage(feint, frozen);
        assert.ok(
          Math.abs(
            Object.values(contribution).reduce((a, b) => a + b, 0) - change,
          ) < 1e-9,
        );
        return {
          phaseRound: round + 1,
          expectedFrozen: expectedDamage(feint, frozen),
          expectedOnline: expectedDamage(feint, changed),
          change,
          contribution,
        };
      });
    return {
      seed: trial.seed,
      change: mean(byRound.map((r) => r.change)),
      contribution: Object.fromEntries(
        roles.map((role) => [
          role,
          mean(byRound.map((r) => r.contribution[role])),
        ]),
      ),
      byRound,
    };
  });
  return {
    actualEncounters: matrix.length,
    pairs,
    creditBlindPairs: pairs.filter(
      (r) =>
        r.bothObserved &&
        r.teamDamageChange !== 0 &&
        Math.abs(r.rewardChange) < 1e-12,
    ),
    opposedCreditPairs: pairs.filter(
      (r) => r.bothObserved && r.teamDamageChange * r.rewardChange < 0,
    ),
    originalFeintExpectedChange: mean(decompositions.map((r) => r.change)),
    roleContributions: Object.fromEntries(
      roles.map((role) => [
        role,
        mean(decompositions.map((r) => r.contribution[role])),
      ]),
    ),
    decompositions,
    interpretation:
      "Exact outcome table for authored tactics on deterministic controllers. The probability decomposition is an offline diagnostic of changed action preferences, not a deployable oracle, new training reward, or complete causal account of learning.",
  };
}
export function diagnosticReport(p, summary, matrix) {
  const original = matrix.filter(
    (r) => r.world === "original" && r.style === "feint",
  );
  return [
    "# Feint interaction diagnostic — v1",
    "",
    `${summary.actualEncounters} actual encounters: all eight tactic combinations, three controller styles, four existing maps. Historical learned probabilities are reused for diagnosis, never counted as new encounters.`,
    "",
    "| Original-map feint tactics | Team damage | Vanguard reward | Flanker reward | Ranger reward |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...original.map(
      (r) =>
        `| ${r.profile.id} | ${r.damage} | ${r.recap.map((c) => c.reward.toFixed(3)).join(" | ")} |`,
    ),
    "",
    "## Credit and interactions",
    "",
    `Across the matrix, ${summary.creditBlindPairs.length} matched tactic changes alter team damage while leaving the acting role’s observed reward unchanged; ${summary.opposedCreditPairs.length} changes move team damage and personal reward in opposite directions. Full pairs are retained in the summary.`,
    "",
    "## Which preference changes explain the original feint decline?",
    "",
    `The fixed outcome table predicts a mean change of ${summary.originalFeintExpectedChange.toFixed(3)} HP when replacing the frozen policy’s probabilities with the online policy’s actual pre-choice probabilities in rounds 17–24. Averaging over all six orders of replacing roles assigns:`,
    "",
    ...Object.entries(summary.roleContributions).map(
      ([role, value]) => `- ${role}: ${value.toFixed(3)} HP`,
    ),
    "",
    summary.interpretation,
    "",
    "This calculation identifies which probability shifts matter under the known outcome table. It does not establish whether forgetting, exploration, reward credit, or independent-role representation caused those shifts. A mechanism intervention needs a separate prospective experiment.",
    "",
    "## Reproduce",
    "",
    "```sh",
    "npm run diagnose:feints -- --out target/feint-replication",
    "npm run verify:feints -- target/feint-replication.results.json",
    "```",
    "",
  ];
}
