# Adaptation benchmark — v1

Protocol: [adaptation-v1.protocol.json](adaptation-v1.protocol.json). [Raw results](adaptation-v1.results.json) · [Summary](adaptation-v1.summary.json).

**Primary disposition: supported-in-this-fixture.** Continued learning minus the identical trained policy held frozen, after switching from clockwise to counterclockwise movement: **18.70 [16.31, 21.09] HP** (paired seed-bootstrap 95% interval; post-switch rounds 17–24).

The predeclared criterion requires a mean gain of at least 6 HP and a lower interval bound above zero. It measures enemy effectiveness in this fixture, not player enjoyment.

Executed 8568 actual encounters, including 24 fixed-profile selection encounters. 32 independent policy seeds; one map and deterministic player controllers. Training lasts 24 rounds; each independent switch branch lasts 24. Fixed traces are executed once per controller and reused, not counted as independent seed replicates.

Selected fixed profile: **rush/flank_right/lead**. It stays unchanged across all comparisons. The selection suite is orbit, reverse and cover; all eight candidates and their outcomes are retained. This is a strong enumerated static baseline, not the best possible authored AI.

## Fixed-profile selection

| Profile | Clockwise | Counterclockwise | Cover | Mean damage |
| --- | ---: | ---: | ---: | ---: |
| rush/flank_right/lead | 72.00 | 84.00 | 72.00 | 76.00 |
| rush/flank_left/lead | 84.00 | 60.00 | 72.00 | 72.00 |
| hold/flank_left/lead | 84.00 | 24.00 | 72.00 | 60.00 |
| hold/flank_right/lead | 60.00 | 48.00 | 72.00 | 60.00 |
| rush/flank_left/aim | 36.00 | 48.00 | 72.00 | 52.00 |
| rush/flank_right/aim | 12.00 | 72.00 | 72.00 | 52.00 |
| hold/flank_left/aim | 24.00 | 12.00 | 72.00 | 36.00 |
| hold/flank_right/aim | 0.00 | 36.00 | 72.00 | 36.00 |

## After the player changes movement

Higher damage means stronger enemies. Differences below use per-seed late-window means; individual rounds are not independent statistical replicates. Reverse is the primary comparison. Feint and cover are secondary, with unadjusted exploratory intervals.

| Switch | Online | Frozen trained | Selected fixed | Random | Online − frozen, 95% interval | Online − fixed, 95% interval |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| reverse | 71.86 | 53.16 | 84.00 | 49.97 | 18.70 [16.31, 21.09] | -12.14 [-14.53, -10.03] |
| feint | 37.27 | 42.00 | 36.00 | 34.08 | -4.73 [-5.58, -3.89] | 1.27 [0.19, 2.39] |
| cover | 72.00 | 72.00 | 72.00 | 72.00 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |

## Adaptation curve: reverse

| Post-switch rounds | Online | Frozen trained | Selected fixed | Random |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 56.06 | 53.25 | 84.00 | 48.56 |
| 5–8 | 62.06 | 50.53 | 84.00 | 47.63 |
| 9–12 | 69.09 | 55.22 | 84.00 | 50.16 |
| 13–16 | 67.97 | 53.53 | 84.00 | 50.06 |
| 17–20 | 72.28 | 52.97 | 84.00 | 50.44 |
| 21–24 | 71.44 | 53.34 | 84.00 | 49.50 |

Immediate damage change versus late training: -20.02 HP. Mean per-role probability total variation after 24 rounds: 28.42%. Probability movement is a behavioral measurement, not evidence of improved effectiveness by itself.

## Adaptation curve: feint

| Post-switch rounds | Online | Frozen trained | Selected fixed | Random |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 41.06 | 41.44 | 36.00 | 32.25 |
| 5–8 | 39.09 | 40.59 | 36.00 | 33.09 |
| 9–12 | 37.50 | 41.72 | 36.00 | 32.34 |
| 13–16 | 37.50 | 41.16 | 36.00 | 33.00 |
| 17–20 | 36.56 | 42.47 | 36.00 | 33.56 |
| 21–24 | 37.97 | 41.53 | 36.00 | 34.59 |

Immediate damage change versus late training: -35.02 HP. Mean per-role probability total variation after 24 rounds: 18.74%. Probability movement is a behavioral measurement, not evidence of improved effectiveness by itself.

## Adaptation curve: cover

| Post-switch rounds | Online | Frozen trained | Selected fixed | Random |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 72.00 | 72.00 | 72.00 | 72.00 |
| 5–8 | 72.00 | 72.00 | 72.00 | 72.00 |
| 9–12 | 72.00 | 72.00 | 72.00 | 72.00 |
| 13–16 | 72.00 | 72.00 | 72.00 | 72.00 |
| 17–20 | 72.00 | 72.00 | 72.00 | 72.00 |
| 21–24 | 72.00 | 72.00 | 72.00 | 72.00 |

Immediate damage change versus late training: -4.08 HP. Mean per-role probability total variation after 24 rounds: 20.63%. Probability movement is a behavioral measurement, not evidence of improved effectiveness by itself.

## Reproduce and interpret

```sh
npm ci
npm run build:wasm
npm run evaluate:adaptation -- --out docs/experiments/adaptation-v1-replication
```

The runner refuses to overwrite evidence. Compare raw traces and summaries while ignoring the generation timestamp. It records protocol, simulator, compiled simulator, Wasm, Rust core, harness, evaluation logic and dependency-lock hashes. Every frozen round is checked for exact score/sample/probability preservation; trained branches are checked for identical starting checkpoints and first combat outcomes.

The strongest causal comparison here is online versus trained-frozen, branched from the same checkpoint and random state. Uniform and fixed policies answer separate baseline questions. All branches use direct observation; the result does not measure scout delivery, human counterplay, new maps, or other games.

The 95% intervals cover only tactic-sampling variation for these controllers. The fixed world has no independently randomized spawns or map variation. The baseline was selected before this run, but the fixtures were already known; this is a locally specified engineering experiment, not a public preregistered study. A loss to the fixed policy or an unmet primary criterion remains part of the result.
