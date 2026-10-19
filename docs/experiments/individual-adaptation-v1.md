# individual-adaptation-v1

Does one enemy, without teammate contributions, adapt usefully after a movement change?

Decision: **not-supported-by-this-screen**. No production change.

Primary: **0.59 [0.27, 0.97] HP**, nominal 99.167% paired seed-bootstrap interval. Fresh-case online minus exact boundary-frozen damage in the last four switch fights, averaged across four cases and all three roles per seed.

Three isolated roles. Each receives 48 diverse training fights, then seven case histories: three known legacy controllers and four reserved cases. Repeat for 12, then branch for 12 into online, boundary-frozen, uniform and greedy-at-switch. Greedy selects highest learned score before the switch, never future outcomes.

## Gates

- meaningful_primary: FAIL
- adjusted_interval_positive: PASS
- no_large_fresh_case_regression: PASS

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| known | online-minus-frozen | 0.31 [-0.00, 0.62] (95%) |
| known | online-minus-uniform | 0.33 [0.17, 0.52] (95%) |
| known | online-minus-greedy | 0.50 [0.08, 0.90] (95%) |
| fresh | online-minus-frozen | 0.59 [0.27, 0.97] (99.167%) |
| fresh | online-minus-uniform | 0.69 [0.41, 0.98] (95%) |
| fresh | online-minus-greedy | 0.39 [-0.08, 0.89] (95%) |
| reverse | online-minus-frozen | 0.88 [0.56, 1.19] (95%) |
| reverse | online-minus-uniform | 0.25 [0.06, 0.44] (95%) |
| reverse | online-minus-greedy | 1.63 [1.13, 2.13] (95%) |
| feint | online-minus-frozen | -0.63 [-1.19, -0.19] (95%) |
| feint | online-minus-uniform | 0.69 [0.31, 1.13] (95%) |
| feint | online-minus-greedy | -1.56 [-2.13, -1.00] (95%) |
| cover | online-minus-frozen | 0.69 [0.31, 1.06] (95%) |
| cover | online-minus-uniform | 0.06 [0.00, 0.19] (95%) |
| cover | online-minus-greedy | 1.44 [0.88, 1.94] (95%) |
| zigzag-advance/long-spines | online-minus-frozen | 0.50 [0.00, 1.31] (95%) |
| zigzag-advance/long-spines | online-minus-uniform | 0.63 [0.13, 1.44] (95%) |
| zigzag-advance/long-spines | online-minus-greedy | -0.06 [-0.69, 0.69] (95%) |
| zigzag-advance/courtyard | online-minus-frozen | 0.44 [0.13, 0.88] (95%) |
| zigzag-advance/courtyard | online-minus-uniform | 0.44 [0.13, 0.75] (95%) |
| zigzag-advance/courtyard | online-minus-greedy | 1.44 [0.25, 2.81] (95%) |
| cover-peek/long-spines | online-minus-frozen | 1.19 [0.44, 2.13] (95%) |
| cover-peek/long-spines | online-minus-uniform | 1.06 [0.38, 1.88] (95%) |
| cover-peek/long-spines | online-minus-greedy | 0.75 [-0.88, 2.63] (95%) |
| cover-peek/courtyard | online-minus-frozen | 0.25 [0.00, 0.56] (95%) |
| cover-peek/courtyard | online-minus-uniform | 0.63 [0.31, 1.00] (95%) |
| cover-peek/courtyard | online-minus-greedy | -0.56 [-1.38, 0.19] (95%) |
| vanguard | online-minus-frozen | 0.28 [0.05, 0.56] (95%) |
| vanguard | online-minus-uniform | 0.38 [0.09, 0.70] (95%) |
| vanguard | online-minus-greedy | 0.23 [-0.52, 0.89] (95%) |
| flanker | online-minus-frozen | 1.03 [0.47, 1.64] (95%) |
| flanker | online-minus-uniform | 1.13 [0.47, 1.83] (95%) |
| flanker | online-minus-greedy | 1.08 [-0.38, 2.53] (95%) |
| ranger | online-minus-frozen | 0.47 [0.09, 0.94] (95%) |
| ranger | online-minus-uniform | 0.56 [0.19, 1.03] (95%) |
| ranger | online-minus-greedy | -0.14 [-1.08, 0.80] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

22464 scored encounters; 10581323 simulation steps; 22464 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| vanguard | 7488 | 2592595 | 7488 |
| flanker | 7488 | 4860000 | 7488 |
| ranger | 7488 | 3128728 | 7488 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.





- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
