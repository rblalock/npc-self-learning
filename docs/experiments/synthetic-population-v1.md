# Synthetic player population — v1

Decision: **do-not-promote**. 9920 actual encounters, including 128 fixed-policy calibration encounters. No production learner or reward change.

Two training arms receive 48 encounters: existing clockwise demonstration on the original map, or four configurable player families on two generated map families. Each is then copied into online and frozen branches, tested on two reserved player families crossed with two reserved map families. Histories repeat a direction for 12 encounters, switch for 12, then return for 12. The fixed profile is selected using training families only.

Selected fixed tactics: **rush/flank_right/lead**.

| Test case | Phase | Diverse − narrow [95% CI] | Diverse online − frozen [95% CI] | Diverse − fixed [95% CI] |
| --- | --- | --- | --- | --- |
| bait-switch/staggered-lanes | repeat | -2.75 [-5.00, -0.50] | 2.00 [-0.50, 4.75] | -3.50 [-8.50, 1.75] |
| bait-switch/staggered-lanes | switch | 1.67 [-1.25, 6.25] | 8.33 [3.75, 13.25] | 10.33 [3.08, 17.50] |
| bait-switch/staggered-lanes | return | 0.00 [0.00, 0.00] | 1.75 [-1.00, 4.50] | -5.50 [-13.25, 2.00] |
| bait-switch/offset-islands | repeat | 1.50 [-0.50, 4.00] | 5.50 [1.50, 10.25] | 3.25 [-3.50, 10.51] |
| bait-switch/offset-islands | switch | -0.25 [-0.75, 0.00] | 3.75 [-0.25, 8.50] | 1.50 [-6.00, 8.25] |
| bait-switch/offset-islands | return | 0.50 [0.00, 1.50] | 4.50 [0.00, 8.50] | 3.00 [-1.75, 8.25] |
| reactive/staggered-lanes | repeat | 2.75 [0.00, 6.25] | 4.50 [-1.00, 11.50] | -0.50 [-12.50, 11.00] |
| reactive/staggered-lanes | switch | 1.00 [0.00, 3.00] | 2.00 [-0.25, 5.00] | -1.25 [-10.50, 7.00] |
| reactive/staggered-lanes | return | -0.75 [-2.00, 0.00] | 5.50 [-1.00, 14.75] | 0.25 [-10.75, 11.50] |
| reactive/offset-islands | repeat | -3.25 [-5.75, -1.00] | 1.50 [-1.00, 4.50] | -6.50 [-15.25, 2.50] |
| reactive/offset-islands | switch | -1.00 [-2.75, 0.00] | 0.75 [-2.25, 4.00] | -2.75 [-10.50, 4.25] |
| reactive/offset-islands | return | 0.00 [0.00, 0.00] | 5.00 [1.75, 8.25] | -4.25 [-10.75, 2.50] |
| aggregate | repeat | -0.44 [-2.13, 1.19] | 3.38 [1.69, 5.25] | -1.81 [-5.94, 2.94] |
| aggregate | switch | 0.35 [-0.42, 1.50] | 3.71 [2.15, 5.63] | 1.96 [-1.63, 5.56] |
| aggregate | return | -0.06 [-0.44, 0.31] | 4.19 [1.75, 6.75] | -1.63 [-6.13, 2.94] |

Values are enemy damage to the player, averaged over the last four encounters of each phase. Intervals resample independent replicate seeds after averaging the four reserved case families. They do not treat individual rounds or the four authored families as independent population draws. Secondary comparisons are exploratory and unadjusted.

## Predefined gates

- diverse_training_gain: FAIL
- continued_learning_gain: PASS
- no_large_case_regression: PASS

## Budget and limits

Matched training encounters; simulation steps and CPU cost are reported, not assumed equal. This is not a fixed-compute curriculum comparison.
Training simulation steps: narrow 658827; diverse 581635.

- This screen changes the whole training distribution, so it cannot separate map diversity from behavioral diversity.
- The learner still has one arena context and three independent role choices. Diverse experience may produce conflicting preferences; synthetic data cannot supply missing representation.
- Player histories model a repeat/switch/return schedule; bots do not themselves learn or inspect enemy memory.
- Bots are controllable synthetic opponents, not calibrated models of human play. Damage, clear/death rates and movement are not evidence of fun or perceived fairness.
- The two reserved controller families and two map families are a limited prospective screen. Parameter variation is not open-ended generalization.
- Scouts, courier learning, adaptive curricula, joint-action policies and engine adapters are outside this version.
- All secondary comparisons are exploratory and unadjusted. No candidate, threshold or generator is changed after looking at reserved outcomes.

## Reproduce

```sh
npm run evaluate:synthetic -- --out target/synthetic-replication
npm run verify:synthetic -- target/synthetic-replication.results.json
```
