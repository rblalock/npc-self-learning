import assert from "node:assert/strict";
import { TACTICS } from "../evidence-baseline.mjs";
import { makeRetentionPolicy } from "./policy.mjs";
/** Independent core replay: reconstruct legal choices and feedback from physical evidence. */
export function verifyTrace(
  seed,
  rows,
  { snapshot, actions, learning, schedule, variant = "original" } = {},
) {
  if (schedule) assert.equal(rows.length, schedule.length);
  const policy = makeRetentionPolicy(seed, variant);
  if (snapshot) policy.request({ op: "restore", snapshot });
  const frozen = policy.request({ op: "inspect" }).cells;
  try {
    for (const [index, row] of rows.entries()) {
      if (schedule) {
        const s = schedule[index];
        assert.equal(row.scenario, s.id);
        assert.equal(row.phase, s.phase);
        assert.equal(row.phaseRound, s.phaseRound ?? null);
        assert.equal(row.control, s.player ? "synthetic" : "demo");
        assert.equal(row.style, s.legacyStyle ?? null);
      }
      assert.equal(row.learning, learning);
      assert.equal(row.communication, "direct");
      assert.equal(row.damage + row.health, 100);
      assert.ok(
        Number.isInteger(row.steps) && row.steps > 0 && row.steps <= 1561,
      );
      assert.ok(Math.abs(row.duration - row.steps / 60) < 1e-8);
      if (row.control === "synthetic") {
        assert.match(row.inputSha256, /^[0-9a-f]{64}$/);
        assert.ok(
          row.inputs.distance >= 0 && Number.isFinite(row.inputs.distance),
        );
      }
      assert.ok(row.duration > 0 && row.duration < 27);
      assert.equal(row.enemies.length, 3);
      assert.equal(row.choices.length, 3);
      assert.equal(
        Math.min(
          100,
          row.enemies.reduce((s, e) => s + e.damage, 0),
        ),
        row.damage,
      );
      const before = policy.request({ op: "inspect" }).cells;
      const choices = Object.entries(TACTICS).map(([role, allowed]) => ({
        role,
        ...policy.request({
          op: "choose",
          role,
          context: "arena",
          allowed: actions ? [actions[role]] : allowed,
          baseline: !!actions,
        }),
      }));
      assert.deepEqual(choices, row.choices);
      row.enemies.forEach((e, i) => {
        assert.equal(e.role, choices[i].role);
        const reward = Math.max(
            -1,
            Math.min(1, e.damage / 32 - 0.22 - (e.hp <= 0 ? 0.18 : 0)),
          ),
          observed = e.sightings > 0;
        const response = policy.request({
          op: "feedback",
          decision_id: choices[i].decision_id,
          reward,
          observed: observed && learning,
        });
        const recap = row.recap[i];
        assert.equal(recap.role, e.role);
        assert.equal(recap.tactic, choices[i].action);
        assert.equal(recap.reward, reward);
        assert.equal(recap.observed, observed);
        assert.equal(recap.accepted, response.accepted);
        assert.equal(recap.damage, e.damage);
        assert.equal(
          recap.before,
          before.find(
            (c) => c.role === e.role && c.action === choices[i].action,
          ).probability,
        );
        assert.deepEqual(row.rewards[i], {
          role: e.role,
          tactic: choices[i].action,
          reward,
          observed,
        });
      });
      const after = policy.request({ op: "commit" });
      assert.equal(row.encounter, after.encounter);
      assert.deepEqual(row.policy, after.cells);
      for (const recap of row.recap)
        assert.equal(
          recap.after,
          after.cells.find(
            (c) => c.role === recap.role && c.action === recap.tactic,
          ).probability,
        );
      if (!learning) assert.deepEqual(after.cells, frozen);
    }
    return policy.request({ op: "snapshot" });
  } finally {
    policy.dispose();
  }
}
