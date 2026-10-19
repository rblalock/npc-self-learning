# Exact strategy-switch control — v1

Post-switch learning criterion: **not met**. No learner change.

1152 newly scored frozen encounters; 1152 reused online encounters; 2304 reconstruction replays, excluded from new evidence.

| Case | Training | Online damage | Boundary-frozen damage | Difference [95% CI] |
|---|---|---:|---:|---:|
| bait-switch/staggered-lanes | narrow | 35.67 | 30.00 | 5.67 [-0.50, 12.50] |
| bait-switch/staggered-lanes | diverse | 37.33 | 32.42 | 4.92 [1.50, 9.50] |
| bait-switch/offset-islands | narrow | 25.75 | 24.00 | 1.75 [-0.50, 4.50] |
| bait-switch/offset-islands | diverse | 25.50 | 24.50 | 1.00 [-1.50, 3.75] |
| reactive/staggered-lanes | narrow | 22.75 | 23.25 | -0.50 [-3.50, 2.75] |
| reactive/staggered-lanes | diverse | 23.75 | 24.25 | -0.50 [-2.50, 1.50] |
| reactive/offset-islands | narrow | 19.25 | 16.25 | 3.00 [0.50, 6.00] |
| reactive/offset-islands | diverse | 18.25 | 15.50 | 2.75 [0.25, 5.75] |
| aggregate | narrow | 25.85 | 23.38 | 2.48 [0.44, 4.88] |
| aggregate | diverse | 26.21 | 24.17 | 2.04 [0.33, 3.83] |

The checkpoint is after repeat round 12, immediately before the switch. Values average switch rounds 9–12. First combat is identical in each pair.

- Known cases and known online outcomes; prospective frozen control, not fresh held-out validation.
- Intervals resample seeds, not rounds or authored family identities.
- Difference estimates the contribution of allowing updates after this boundary, including effects on later sampled tactics and physical encounters.
- Enemy damage is a capability measure, not fun or fairness.
- Primary diverse arm; narrow/per-case comparisons exploratory and unadjusted.

Reproduce: `npm run evaluate:boundary -- --out target/boundary-replication`. Verify: `npm run verify:boundary`.
