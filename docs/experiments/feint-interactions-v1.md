# Feint interaction diagnostic — v1

96 actual encounters: all eight tactic combinations, three controller styles, four existing maps. Historical learned probabilities are reused for diagnosis, never counted as new encounters.

| Original-map feint tactics | Team damage | Vanguard reward | Flanker reward | Ranger reward |
| --- | ---: | ---: | ---: | ---: |
| rush/flank_left/aim | 36 | 0.350 | -0.025 | -0.400 |
| rush/flank_left/lead | 48 | 0.350 | -0.025 | -0.025 |
| rush/flank_right/aim | 24 | -0.025 | -0.025 | -0.400 |
| rush/flank_right/lead | 36 | -0.025 | -0.025 | -0.025 |
| hold/flank_left/aim | 24 | -0.025 | -0.025 | -0.400 |
| hold/flank_left/lead | 36 | -0.025 | -0.025 | -0.025 |
| hold/flank_right/aim | 24 | -0.025 | -0.025 | -0.400 |
| hold/flank_right/lead | 36 | -0.025 | -0.025 | -0.025 |

## Credit and interactions

Across the matrix, 6 matched tactic changes alter team damage while leaving the acting role’s observed reward unchanged; 0 changes move team damage and personal reward in opposite directions. Full pairs are retained in the summary.

## Which preference changes explain the original feint decline?

The fixed outcome table predicts a mean change of -5.065 HP when replacing the frozen policy’s probabilities with the online policy’s actual pre-choice probabilities in rounds 17–24. Averaging over all six orders of replacing roles assigns:

- vanguard: -0.172 HP
- flanker: -2.183 HP
- ranger: -2.709 HP

Exact outcome table for authored tactics on deterministic controllers. The probability decomposition is an offline diagnostic of changed action preferences, not a deployable oracle, new training reward, or complete causal account of learning.

This calculation identifies which probability shifts matter under the known outcome table. It does not establish whether forgetting, exploration, reward credit, or independent-role representation caused those shifts. A mechanism intervention needs a separate prospective experiment.

## Reproduce

```sh
npm run diagnose:feints -- --out target/feint-replication
npm run verify:feints -- target/feint-replication.results.json
```
