# Automatic score-decay ablation — v1

Decision: **retain-original**. 16704 measured encounters. Only automatic score decay changes, from 0.025 to 0; sampled actions still update. No production change.

| Suite/case | Phase | No-decay − original | No-decay online − boundary frozen | Original online − boundary frozen |
|---|---|---:|---:|---:|
| legacy/reverse | switch | 3.38 [1.75, 5.25] | 19.00 [15.13, 23.13] | 17.00 [12.62, 21.50] |
| legacy/feint | switch | 1.25 [0.63, 1.88] | -4.63 [-5.88, -3.38] | -4.88 [-6.13, -3.63] |
| legacy/cover | switch | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| synthetic/bait-switch/staggered-lanes | switch | 0.17 [-3.50, 3.50] | 9.00 [4.00, 14.50] | 8.58 [3.66, 13.83] |
| synthetic/bait-switch/staggered-lanes | return | 2.75 [0.25, 5.76] | 2.00 [-2.75, 6.75] | 0.25 [-3.75, 4.50] |
| synthetic/bait-switch/offset-islands | switch | 0.50 [0.00, 1.50] | 3.00 [-3.50, 8.25] | 2.50 [-3.75, 7.25] |
| synthetic/bait-switch/offset-islands | return | 0.75 [0.00, 2.25] | 6.50 [1.25, 12.00] | 6.25 [0.75, 12.50] |
| synthetic/reactive/staggered-lanes | switch | -1.50 [-4.50, 0.00] | 1.75 [-2.75, 5.75] | 2.25 [-4.25, 7.00] |
| synthetic/reactive/staggered-lanes | return | 1.50 [0.00, 3.50] | 3.50 [1.00, 6.25] | 4.50 [0.75, 9.25] |
| synthetic/reactive/offset-islands | switch | 0.00 [-2.00, 1.50] | 3.25 [0.75, 6.25] | 2.75 [0.00, 6.00] |
| synthetic/reactive/offset-islands | return | 0.00 [-1.00, 1.25] | 2.25 [-1.25, 6.50] | 2.00 [-1.50, 6.25] |
| synthetic/burst-patrol/split-gates | switch | 0.00 [0.00, 0.00] | 4.08 [0.17, 8.58] | 3.83 [0.08, 8.08] |
| synthetic/burst-patrol/split-gates | return | 0.58 [0.00, 1.75] | 2.75 [0.58, 5.08] | 2.42 [-0.58, 5.50] |
| synthetic/burst-patrol/shelves | switch | 0.25 [-0.50, 1.00] | 2.75 [0.00, 5.50] | 3.33 [-0.25, 8.00] |
| synthetic/burst-patrol/shelves | return | 0.00 [0.00, 0.00] | 7.42 [1.75, 14.00] | 6.17 [0.75, 12.42] |
| synthetic/threat-retreat/split-gates | switch | 0.25 [0.00, 0.75] | 1.25 [-2.25, 6.00] | 1.75 [-2.25, 6.50] |
| synthetic/threat-retreat/split-gates | return | 0.75 [0.00, 2.25] | 4.75 [1.50, 9.00] | 3.75 [0.25, 7.25] |
| synthetic/threat-retreat/shelves | switch | 0.00 [0.00, 0.00] | 9.83 [1.08, 19.34] | 9.08 [1.00, 17.50] |
| synthetic/threat-retreat/shelves | return | -1.25 [-3.75, 0.00] | 2.00 [-1.50, 5.50] | 5.00 [0.75, 10.00] |
| synthetic/fresh | switch | 0.13 [-0.13, 0.38] | 4.48 [2.67, 6.48] | 4.50 [2.35, 6.79] |
| synthetic/fresh | return | 0.02 [-0.79, 0.71] | 4.23 [1.81, 6.81] | 4.33 [1.98, 6.83] |
| synthetic/known | switch | -0.21 [-1.42, 0.94] | 4.25 [1.56, 6.94] | 4.02 [0.81, 6.94] |
| synthetic/known | return | 1.25 [0.25, 2.44] | 3.56 [0.69, 6.56] | 3.25 [0.56, 6.25] |

Values are HP damage, late eight rounds for legacy and late four for synthetic. Brackets: 95% paired seed-bootstrap intervals. Primary: fresh switch aggregate; all other intervals exploratory.

## Locked gates

- fresh_gain: FAIL
- fresh_post_switch_learning: PASS
- legacy_feint_gain: FAIL
- legacy_feint_learning_nonnegative: FAIL
- no_large_case_regression: PASS

## Simulation budget

| Suite/variant | Encounters | Steps |
|---|---:|---:|
| legacy/original | 2016 | 1943011 |
| legacy/no-decay | 2016 | 1932557 |
| synthetic/original | 6336 | 7137253 |
| synthetic/no-decay | 6336 | 7135609 |

Equal encounter histories per variant; record actual simulation steps and process CPU. No fixed-compute efficiency claim.

## Limits

- Neither decay nor lack of decay repairs missing joint-role credit or adds route memory.
- Fresh behaviors/maps form a small prospective screen and become known regression fixtures after this run.
- Direction changes are scripted, bots do not model or learn the enemy, and no human enjoyment is measured.
- Reward, representation and runtime remain unchanged. No fixed-policy superiority claim is tested here.
- Original and candidate are separately trained: the primary effect covers the complete configured learning history, not just post-switch decay.
- Geometry validity and unit tests may run before the source freeze using non-evaluation seeds; no reserved combat may guide implementation.

## Reproduce

`npm run evaluate:retention -- --out target/retention-replication`

`npm run verify:retention` replays all combats and separately reconstructs all core feedback from physical evidence.
