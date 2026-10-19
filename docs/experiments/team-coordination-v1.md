# team-coordination-v1

Does choosing complete tactic combinations outperform independent choices under the same team reward?

Decision: **not-supported-by-this-screen**. No production change.

Primary: **-2.44 [-6.42, 1.41] HP**, nominal 99.167% paired seed-bootstrap interval. Joint online minus shared-reward independent online damage in the last four reserved switch fights.

Three variants: original individual rewards; independent choices with shared reward; one joint choice among the eight original combinations with shared reward. Known suite: 24 clockwise training then three independent 24-fight switch branches. Reserved suite: 48 diverse training, 12 repeat per case, then 12 switch. Online/frozen for every variant/case.

## Gates

- meaningful_primary: FAIL
- adjusted_interval_positive: FAIL
- no_large_fresh_case_regression: FAIL
- not_worse_than_original: FAIL
- joint_continued_learning: PASS

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| known | original-learning | 3.84 [2.81, 4.91] (95%) |
| known | shared-learning | 6.75 [5.44, 8.25] (95%) |
| known | joint-learning | 4.06 [2.34, 5.91] (95%) |
| known | joint-minus-shared | -3.34 [-6.13, -0.50] (95%) |
| known | joint-minus-original | -4.34 [-6.81, -1.84] (95%) |
| known | shared-minus-original | -1.00 [-1.69, -0.31] (95%) |
| fresh | original-learning | 6.05 [3.94, 8.39] (95%) |
| fresh | shared-learning | 5.39 [2.81, 8.34] (95%) |
| fresh | joint-learning | 3.47 [1.59, 5.67] (95%) |
| fresh | joint-minus-shared | -2.44 [-6.42, 1.41] (99.167%) |
| fresh | joint-minus-original | -2.44 [-5.39, 0.66] (95%) |
| fresh | shared-minus-original | 0.00 [-1.27, 1.22] (95%) |
| reverse | original-learning | 16.13 [12.84, 19.22] (95%) |
| reverse | shared-learning | 22.22 [18.66, 26.16] (95%) |
| reverse | joint-learning | 13.41 [9.00, 18.00] (95%) |
| reverse | joint-minus-shared | -8.63 [-15.47, -1.41] (95%) |
| reverse | joint-minus-original | -10.59 [-16.78, -4.22] (95%) |
| reverse | shared-minus-original | -1.97 [-3.56, -0.38] (95%) |
| feint | original-learning | -4.59 [-5.63, -3.47] (95%) |
| feint | shared-learning | -1.97 [-3.00, -0.84] (95%) |
| feint | joint-learning | -1.22 [-2.72, 0.28] (95%) |
| feint | joint-minus-shared | -1.41 [-3.56, 0.84] (95%) |
| feint | joint-minus-original | -2.44 [-4.41, -0.47] (95%) |
| feint | shared-minus-original | -1.03 [-2.06, 0.00] (95%) |
| cover | original-learning | 0.00 [0.00, 0.00] (95%) |
| cover | shared-learning | 0.00 [0.00, 0.00] (95%) |
| cover | joint-learning | 0.00 [0.00, 0.00] (95%) |
| cover | joint-minus-shared | 0.00 [0.00, 0.00] (95%) |
| cover | joint-minus-original | 0.00 [0.00, 0.00] (95%) |
| cover | shared-minus-original | 0.00 [0.00, 0.00] (95%) |
| zigzag-advance/long-spines | original-learning | 2.81 [-1.69, 7.31] (95%) |
| zigzag-advance/long-spines | shared-learning | 1.31 [-0.94, 3.75] (95%) |
| zigzag-advance/long-spines | joint-learning | 4.50 [1.50, 8.25] (95%) |
| zigzag-advance/long-spines | joint-minus-shared | 4.31 [-1.31, 10.31] (95%) |
| zigzag-advance/long-spines | joint-minus-original | 3.56 [-3.19, 10.69] (95%) |
| zigzag-advance/long-spines | shared-minus-original | -0.75 [-3.56, 2.63] (95%) |
| zigzag-advance/courtyard | original-learning | 2.06 [-0.19, 4.69] (95%) |
| zigzag-advance/courtyard | shared-learning | 1.69 [-1.31, 5.06] (95%) |
| zigzag-advance/courtyard | joint-learning | 1.31 [0.19, 2.81] (95%) |
| zigzag-advance/courtyard | joint-minus-shared | -3.00 [-8.25, 2.25] (95%) |
| zigzag-advance/courtyard | joint-minus-original | -2.63 [-7.50, 2.44] (95%) |
| zigzag-advance/courtyard | shared-minus-original | 0.38 [-0.75, 1.88] (95%) |
| cover-peek/long-spines | original-learning | 9.00 [4.31, 14.44] (95%) |
| cover-peek/long-spines | shared-learning | 7.69 [4.13, 11.44] (95%) |
| cover-peek/long-spines | joint-learning | 6.38 [2.25, 11.25] (95%) |
| cover-peek/long-spines | joint-minus-shared | 0.56 [-3.38, 4.50] (95%) |
| cover-peek/long-spines | joint-minus-original | -1.31 [-5.25, 2.81] (95%) |
| cover-peek/long-spines | shared-minus-original | -1.88 [-4.69, 0.38] (95%) |
| cover-peek/courtyard | original-learning | 10.31 [3.94, 17.25] (95%) |
| cover-peek/courtyard | shared-learning | 10.88 [3.56, 19.69] (95%) |
| cover-peek/courtyard | joint-learning | 1.69 [-0.19, 4.13] (95%) |
| cover-peek/courtyard | joint-minus-shared | -11.63 [-16.88, -6.94] (95%) |
| cover-peek/courtyard | joint-minus-original | -9.38 [-13.69, -5.44] (95%) |
| cover-peek/courtyard | shared-minus-original | 2.25 [0.56, 4.69] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

17280 scored encounters; 16836360 simulation steps; 40320 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| original | 5760 | 5563763 | 17280 |
| shared | 5760 | 5626259 | 17280 |
| joint | 5760 | 5646338 | 5760 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.

Shared reward = 2*min(total actual enemy damage,100)/100 - 1. Shared feedback is eligible only if every active enemy had legitimate sightings. Both joint and shared-independent receive exactly that signal. Original retains ownDamage/32 - .22 - .18 if defeated, clamped to [-1,1], with per-role eligibility. Shared host assumes direct aggregation of all local reports.

All use exploration=.16, temperature=.3. The product of three role distributions differs from an eight-action softmax mixture: this is a joint-policy architecture comparison including induced exploration, not a pure factorization test with identical joint exploration. Joint consumes one decision per fight versus three. Report that sampling and parameterization cost.

- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
