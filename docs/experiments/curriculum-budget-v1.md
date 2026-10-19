# curriculum-budget-v1

Can weakness-directed example selection improve reserved effectiveness within the same total encounter budget?

Decision: **not-supported-by-this-screen**. No production change.

Primary: **-1.13 [-2.42, 0.22] HP**, nominal 99.167% paired seed-bootstrap interval. Adaptive24 minus uniform48 damage averaged across all twelve frozen test fights and four reserved cases.

Three independent-role original-reward arms: uniform48 (48 training); uniform24 (24 training plus 24 ignored frozen probes); adaptive24 (24 training plus 24 selection probes). Eight cycles each probe three training-only cases from the same checkpoint, choose lowest damage with deterministic ID tie-break, then train three episodes. Frozen probes never change training state. Evaluate all three frozen on four reserved cases, six encounters each direction (12 per case).

## Gates

- meaningful_primary: FAIL
- adjusted_interval_positive: FAIL
- no_large_fresh_case_regression: PASS
- not_worse_at_matched_update_count: PASS

## Results

| Scope | Comparison | Mean damage difference [interval] |
|---|---|---:|
| fresh | adaptive-minus-uniform48 | -1.13 [-2.42, 0.22] (99.167%) |
| fresh | adaptive-minus-uniform24 | 0.33 [-0.42, 1.23] (95%) |
| zigzag-advance/long-spines | adaptive-minus-uniform48 | 1.06 [-2.06, 4.38] (95%) |
| zigzag-advance/long-spines | adaptive-minus-uniform24 | 0.44 [-0.94, 1.63] (95%) |
| zigzag-advance/courtyard | adaptive-minus-uniform48 | -0.81 [-3.06, 1.44] (95%) |
| zigzag-advance/courtyard | adaptive-minus-uniform24 | 0.31 [-0.69, 1.38] (95%) |
| cover-peek/long-spines | adaptive-minus-uniform48 | -3.19 [-7.19, 0.25] (95%) |
| cover-peek/long-spines | adaptive-minus-uniform24 | 1.25 [-0.38, 3.25] (95%) |
| cover-peek/courtyard | adaptive-minus-uniform48 | -1.56 [-4.19, 1.25] (95%) |
| cover-peek/courtyard | adaptive-minus-uniform24 | -0.69 [-2.06, 0.81] (95%) |

Full four-fight curves, individual seed pairs, clear/death rates and duration are in the summary JSON. These measures concern enemy effectiveness.

## Budget

4608 scored encounters; 4625518 simulation steps; 13824 real core choices.

| Arm | Encounters | Steps | Core choices |
|---|---:|---:|---:|
| uniform48 | 1536 | 1526214 | 4608 |
| uniform24 | 1536 | 1521962 | 4608 |
| adaptive24 | 1536 | 1577342 | 4608 |

Equal declared encounter histories within each comparison, with actual simulation steps, decision counts, elapsed time and CPU recorded. This is not an equal-CPU or equal-step claim. Replays and unit-test fights are not additional scored evidence.

## Scope

Paired percentile bootstrap of 16 seed means, averaging cases and roles within seed. Primary intervals use nominal Bonferroni 99.167% coverage for six predeclared primary comparisons; bootstrap coverage is approximate. All secondary intervals are 95%, exploratory and unadjusted. Neither authored cases nor rounds are independent map-population draws.





- Authored tactics and small fixed family sets; no arbitrary-game or opponent-population generalization.
- Tactic choices occur once per encounter. This tests between-encounter adaptation, not within-fight tactical replanning.
- Only specified host representations/rewards change; the core API is reused without modification.
- Negative and insensitive fixtures are retained. A failed screen is not evidence that an entire research direction cannot work.
- Lowest damage is a hardness heuristic, not a measurement of future learning value. Probe costs count even when selection is unhelpful. Compare adaptive24 with uniform24 secondarily to isolate selection under matched update counts.
