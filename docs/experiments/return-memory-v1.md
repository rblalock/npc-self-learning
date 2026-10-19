# return-memory-v1

Does experience survive an intervening strategy well enough to help when the earlier strategy returns?

Decision: **not-supported-by-this-screen**. No production change.

Primary: **0.23 [-0.09, 0.61] HP**, nominal 99.167% paired seed-bootstrap interval. Retained online minus memory-reset online damage in the first four return fights.

Isolated ranger; four reserved cases. A (+direction) for 24, B (-direction) for 24, A for 24. At return compare retained-online, retained-frozen, reset-memory online, and saved-A-memory online. Reset/saved-A copy only cells into the B checkpoint, preserving RNG and counters. Saved-A is an externally signaled diagnostic reference, not an autonomous recall mechanism.

## Gates

- meaningful_primary: FAIL
- adjusted_interval_positive: FAIL
- no_large_fresh_case_regression: PASS

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| fresh | retained-minus-reset | 0.23 [-0.09, 0.61] (99.167%) |
| fresh | retained-minus-saved-a | -0.05 [-0.14, 0.00] (95%) |
| fresh | return-learning | 0.89 [0.49, 1.34] (95%) |
| fresh | late-retained-minus-reset | 0.02 [0.00, 0.07] (95%) |
| zigzag-advance/long-spines | retained-minus-reset | 0.75 [0.19, 1.50] (95%) |
| zigzag-advance/long-spines | retained-minus-saved-a | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | return-learning | 0.28 [0.00, 0.75] (95%) |
| zigzag-advance/long-spines | late-retained-minus-reset | 0.09 [0.00, 0.28] (95%) |
| zigzag-advance/courtyard | retained-minus-reset | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/courtyard | retained-minus-saved-a | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/courtyard | return-learning | 0.66 [0.19, 1.22] (95%) |
| zigzag-advance/courtyard | late-retained-minus-reset | 0.00 [0.00, 0.00] (95%) |
| cover-peek/long-spines | retained-minus-reset | 0.00 [0.00, 0.00] (95%) |
| cover-peek/long-spines | retained-minus-saved-a | 0.00 [0.00, 0.00] (95%) |
| cover-peek/long-spines | return-learning | 1.13 [0.19, 2.44] (95%) |
| cover-peek/long-spines | late-retained-minus-reset | 0.00 [0.00, 0.00] (95%) |
| cover-peek/courtyard | retained-minus-reset | 0.19 [-0.56, 1.13] (95%) |
| cover-peek/courtyard | retained-minus-saved-a | -0.19 [-0.56, 0.00] (95%) |
| cover-peek/courtyard | return-learning | 1.50 [0.56, 2.63] (95%) |
| cover-peek/courtyard | late-retained-minus-reset | 0.00 [0.00, 0.00] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

9216 scored encounters; 3247566 simulation steps; 9216 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| all-history-and-controls | 9216 | 3247566 | 9216 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.





- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
