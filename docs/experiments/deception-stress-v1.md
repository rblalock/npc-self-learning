# deception-stress-v1

Does a deliberately misleading movement history hurt more than beginning with no learned preferences?

Decision: **scripted-stress-margin-met**. No production change.

Primary: **0.28 [0.05, 0.61] HP**, nominal 99.167% paired seed-bootstrap interval. Baited online minus reset-memory online damage in the first four attack fights; non-inferiority margin is -3 HP.

Isolated ranger; four reserved cases. Twenty-four opposite-direction bait fights or 24 target-direction matched-history fights; target direction for 24 afterward. Compare baited-online, baited-frozen, matched-history online, and zero-cell online with the bait checkpoint RNG/counters. Attacker uses a fixed predeclared movement reversal and never reads the policy. This is a scripted baiting stress test, not an optimized adversarial attack or a distinct behavioral definition of deception.

## Gates

- mean_within_margin: PASS
- adjusted_interval_within_margin: PASS

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| fresh | baited-minus-naive | 0.28 [0.05, 0.61] (99.167%) |
| fresh | baited-minus-matched | -0.75 [-1.41, -0.23] (95%) |
| fresh | recovery-learning | 1.27 [0.61, 2.09] (95%) |
| fresh | late-baited-minus-naive | 0.09 [0.02, 0.19] (95%) |
| zigzag-advance/long-spines | baited-minus-naive | 0.94 [0.38, 1.69] (95%) |
| zigzag-advance/long-spines | baited-minus-matched | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | recovery-learning | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | late-baited-minus-naive | 0.09 [0.00, 0.28] (95%) |
| zigzag-advance/courtyard | baited-minus-naive | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/courtyard | baited-minus-matched | -0.38 [-0.94, 0.00] (95%) |
| zigzag-advance/courtyard | recovery-learning | 0.56 [0.00, 1.41] (95%) |
| zigzag-advance/courtyard | late-baited-minus-naive | 0.19 [0.00, 0.47] (95%) |
| cover-peek/long-spines | baited-minus-naive | 0.00 [0.00, 0.00] (95%) |
| cover-peek/long-spines | baited-minus-matched | -1.50 [-2.81, -0.38] (95%) |
| cover-peek/long-spines | recovery-learning | 2.72 [1.13, 4.59] (95%) |
| cover-peek/long-spines | late-baited-minus-naive | 0.09 [0.00, 0.28] (95%) |
| cover-peek/courtyard | baited-minus-naive | 0.19 [0.00, 0.56] (95%) |
| cover-peek/courtyard | baited-minus-matched | -1.13 [-2.63, 0.00] (95%) |
| cover-peek/courtyard | recovery-learning | 1.78 [0.28, 4.22] (95%) |
| cover-peek/courtyard | late-baited-minus-naive | 0.00 [0.00, 0.00] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

9216 scored encounters; 3936622 simulation steps; 9216 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| all-history-and-controls | 9216 | 3936622 | 9216 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.





- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
