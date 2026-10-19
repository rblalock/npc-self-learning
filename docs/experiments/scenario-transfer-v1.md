# Fresh scenarios — v1

**Decision: do-not-promote.** 11760 actual encounters; 16 fresh policy seeds; three authored scenarios. Both reward rules were tested regardless of development outcome.

Original geometry, core and combat are loaded from the immutable v1 archive, then the protocol’s cover and spawn coordinates are applied. All other combat settings are held constant. Fixed tactics are selected using clockwise calibration only.

| Scenario | Switch | Original | Additive | Fixed | Additive − original [95% CI] | Original online − frozen [95% CI] | Additive online − frozen [95% CI] |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| south-entry | reverse | 57.56 | 58.78 | 36.00 | 1.22 [0.47, 2.06] | 19.50 [16.69, 22.41] | 21.00 [18.47, 23.53] |
| south-entry | feint | 27.09 | 27.19 | 24.00 | 0.09 [0.00, 0.28] | 7.03 [5.81, 8.34] | 7.13 [6.00, 8.34] |
| wide-crossings | reverse | 39.09 | 41.53 | 24.00 | 2.44 [0.94, 4.22] | 5.25 [3.00, 7.60] | 8.06 [5.34, 10.78] |
| wide-crossings | feint | 54.84 | 54.84 | 60.00 | 0.00 [-0.38, 0.38] | 0.94 [0.38, 1.59] | 1.13 [0.47, 1.78] |
| central-obstacles | reverse | 28.22 | 28.41 | 24.00 | 0.19 [0.00, 0.47] | 2.63 [1.78, 3.56] | 2.81 [2.06, 3.66] |
| central-obstacles | feint | 33.19 | 33.19 | 36.00 | 0.00 [-0.28, 0.28] | 2.34 [1.78, 2.91] | 2.34 [1.59, 3.19] |
| aggregate | reverse | 41.63 | 42.91 | 28.00 | 1.28 [0.72, 1.94] | 9.13 [7.81, 10.63] | 10.63 [9.22, 12.22] |
| aggregate | feint | 38.38 | 38.41 | 40.00 | 0.03 [-0.13, 0.19] | 3.44 [2.94, 4.03] | 3.53 [3.03, 4.06] |

Damage is enemy damage to the player in rounds 17–24 after the behavior switch. Aggregate intervals resample 16 seed means, each averaged over the three scenarios. Worlds and encounters are not treated as independent population samples. More damage does not establish fun or human learning.

## Gates

- feint_vs_original: FAIL
- feint_continued_learning: PASS
- reverse_vs_original: PASS
- reverse_continued_learning: PASS
- no_scenario_regression: PASS

A candidate must pass both development and scenario screens before promotion. This record retains negative outcomes. No maps, weights, seed sets, or gates were changed after results were measured.

## Reproduce

```sh
node scripts/evaluate-scenarios.mjs --out docs/experiments/scenario-transfer-v1-replication
node scripts/verify-scenarios.mjs docs/experiments/scenario-transfer-v1-replication.results.json
```

- Only policy sampling is seeded; three authored scenarios and known scripted controllers.
- Fixed baseline selected only on clockwise calibration in these three scenarios, not reverse or feint.
- Rewards describe effectiveness, not fun; human experience remains unmeasured.
- Team credit is not a causal contribution estimator and can credit a noncontributing teammate.
- Intervals describe policy-seed variation, not people or a population of maps; secondary analyses exploratory.
- A favorable result permits the next evaluation, not a broad public effectiveness claim.
- No scout/report condition or engine integration is tested.
