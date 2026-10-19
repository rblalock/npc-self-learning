# situational-memory-v1

Does public terrain context improve an isolated ranger compared with one pooled memory?

Decision: **not-supported-by-this-screen**. No production change.

Primary: **0.00 [0.00, 0.00] HP**, nominal 99.167% paired seed-bootstrap interval. Terrain-conditioned online minus pooled online damage in the last four reserved switch fights.

Pooled, terrain-conditioned and shuffled-context controls; same 48 diverse training fights. Both training and reserved maps contain sparse/dense geometry. Four reserved histories: 12 repeat then 12 switch online/frozen. Shuffled labels use independent deterministic noise, matching cell capacity without meaningful terrain conditioning.

## Gates

- meaningful_primary: FAIL
- adjusted_interval_positive: FAIL
- no_large_fresh_case_regression: PASS
- beats_shuffled_context: FAIL

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| fresh | pooled-learning | 0.98 [0.38, 1.69] (95%) |
| fresh | terrain-learning | 0.98 [0.33, 1.73] (95%) |
| fresh | shuffled-learning | 0.47 [0.14, 0.84] (95%) |
| fresh | terrain-minus-pooled | 0.00 [0.00, 0.00] (99.167%) |
| fresh | terrain-minus-shuffled | 0.28 [0.00, 0.56] (95%) |
| zigzag-advance/long-spines | pooled-learning | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | terrain-learning | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | shuffled-learning | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | terrain-minus-pooled | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | terrain-minus-shuffled | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/courtyard | pooled-learning | 1.31 [0.00, 3.00] (95%) |
| zigzag-advance/courtyard | terrain-learning | 1.50 [0.00, 3.38] (95%) |
| zigzag-advance/courtyard | shuffled-learning | 0.19 [0.00, 0.56] (95%) |
| zigzag-advance/courtyard | terrain-minus-pooled | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/courtyard | terrain-minus-shuffled | 0.75 [0.00, 1.88] (95%) |
| cover-peek/long-spines | pooled-learning | 0.56 [0.00, 1.13] (95%) |
| cover-peek/long-spines | terrain-learning | 0.38 [0.00, 0.94] (95%) |
| cover-peek/long-spines | shuffled-learning | 0.38 [0.00, 0.94] (95%) |
| cover-peek/long-spines | terrain-minus-pooled | 0.00 [0.00, 0.00] (95%) |
| cover-peek/long-spines | terrain-minus-shuffled | 0.00 [0.00, 0.00] (95%) |
| cover-peek/courtyard | pooled-learning | 2.06 [0.56, 3.94] (95%) |
| cover-peek/courtyard | terrain-learning | 2.06 [0.56, 3.94] (95%) |
| cover-peek/courtyard | shuffled-learning | 1.31 [0.19, 2.44] (95%) |
| cover-peek/courtyard | terrain-minus-pooled | 0.00 [0.00, 0.00] (95%) |
| cover-peek/courtyard | terrain-minus-shuffled | 0.38 [0.00, 1.13] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

9216 scored encounters; 3514879 simulation steps; 9216 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| pooled | 3072 | 1171680 | 3072 |
| terrain | 3072 | 1171700 | 3072 |
| shuffled | 3072 | 1171499 | 3072 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.





- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
