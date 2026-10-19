# Switch controls and retention — lab follow-up

The original learner remains in the game. This follow-up separates learning after a strategy switch from earlier learning, then tests a single change: removing automatic score decay. That candidate fails three of five locked advancement gates.

## What we learned

The first synthetic lab froze its comparison before the entire test history. Its +3.71 HP late-switch effect therefore includes updates during the preceding repeat phase. The [exact-boundary experiment](experiments/switch-boundary-v1.md) instead freezes immediately before the switch. Its effect after varied training is **+2.04 HP [0.33, 3.83]**, below the predefined 3 HP practical threshold. This is a new control on known cases, not a fresh validation population.

The [retention experiment](experiments/retention-v1.md) compares automatic decay 0.025 with 0. On four fresh behavior/map combinations, no decay adds **+0.13 HP [-0.13, 0.38]** versus original, far below the 3 HP criterion. It improves the familiar reversal fixture by +3.38 HP [1.75, 5.25], but the original-map feint weakness persists: its continued-versus-frozen effect is **-4.63 HP [-5.88, -3.38]**. Cover remains insensitive to the choice of learner.

There is useful positive evidence for the existing mechanism: on the fresh suite, original learning after the switch adds **+4.50 HP [2.35, 6.79]** versus freezing at that exact boundary. Removing decay gives +4.48 HP [2.67, 6.48]. Thus this run supports adaptation in the new synthetic situations, while providing no meaningful aggregate advantage for the candidate. The original-learning comparison is a secondary endpoint; intervals are unadjusted.

Turning off decay does not make memory permanent. Sampled actions still receive bounded reward updates at learning rate 0.22. This test isolates automatic fading, not every possible memory mechanism, and does not repair the missing team-credit signal identified in the earlier diagnostic.

## What ran

| Protocol | Newly scored | Reused online evidence | Scope |
| --- | ---: | ---: | --- |
| switch-boundary-v1 | 1,152 | 1,152 | Prior 12 seeds × four cases × two training arms × 12 new frozen fights |
| retention-v1 | 16,704 | 0 | Two configs; 12 new seeds on known legacy cases and 12 new seeds on known/fresh synthetic cases |

The boundary run reconstructs 2,304 prior combats before accepting the new control; those are not additional evidence. Verification and recorded-demo reconstruction are also excluded from new-encounter counts. The retention run has 4,032 legacy and 12,672 synthetic encounters, with actual steps and CPU recorded rather than assumed equal. Each configuration receives equal encounter histories.

The reserved synthetic families are **burst-patrol** (perimeter movement punctuated by deliberate stops) and **threat-retreat** (approach or retreat using visible attack windups and nearby bullets). Each uses delayed restricted observations, bounded movement, repeatable aim error and imperfect timing. They never receive hidden enemy positions, tactic IDs or learned preferences. Two new geometry families, **split-gates** and **shelves**, are crossed with both behaviors. These are authored synthetic agents, not calibrated human models. Now examined, they become regression fixtures.

Synthetic histories train for 48 diverse encounters, repeat for 12, switch for 12, and return for 12. At each switch/return boundary the online policy is copied exactly, including RNG; one branch keeps learning and the other is frozen. Legacy histories train clockwise for 24, then fork into each of reverse/feint/cover for 24. Original and no-decay configurations train separately; snapshots cannot cross configurations.

The primary comparison is no-decay versus original in the last four switch encounters of the fresh suite. Each seed is averaged across four cases, then twelve seed-level differences are bootstrapped. Legacy endpoints use the last eight encounters. Rounds and authored case identities are not treated as independent population samples. Other comparisons are exploratory and unadjusted. Criteria and generation rules were specified locally before candidate measurement; this is not a public preregistration.

## Reproduce

Requires Node.js 24. No API key, model service or new Rust build is needed for the headless lab. The preserved baseline archive contains the actual Rust/Wasm learner and game simulation. Both new protocols preserve that code. The current production core is unchanged.

```sh
npm run test:retention
npm run evaluate:boundary -- --out target/my-boundary
npm run verify:boundary -- target/my-boundary.results.json
npm run evaluate:retention -- --out target/my-retention
npm run verify:retention -- target/my-retention.results.json
npm run replay:retention -- --out target/my-retention-replay
```

Evaluation refuses to overwrite existing evidence. The verifier also creates a new verification record, so use a fresh result prefix when repeating a run. Replay defaults to the preserved retention result and its preselected example. It is a display artifact, separate from the hashed measurement source.

The [recorded comparison](experiments/retention-v1-view.html) includes all four conditions for seed 6001, burst-patrol/split-gates, switch round 12. This encounter was selected before outcomes. Original/no-decay online both inflict 72 HP; their frozen copies inflict 48 and 36 HP respectively. These differences should not replace the aggregate estimates. Frames come from verified combat, sampled at 10 Hz from the 60 Hz simulation.

The downloadable headless package is `target/releases/tactical-air-retention-lab-v1.tar.gz`, with a manifest in `docs/releases/retention-lab-v1.package.json`. It contains source, protocols, raw results, verification records, the prior population evidence needed for checkpoint reconstruction, checksums and the standalone replay. Extract it, run `shasum -a 256 -c SHA256SUMS`, then use the commands above. No package installation is needed.

## Next research decision

Test whether selecting complete tactic combinations can learn team effects that separate role preferences miss. Keep the original baseline and add an independent-role control with the same shared reward as the joint learner. Specify legal masks, observation eligibility, exploration and encounter/compute accounting before collecting new results. A larger action space costs evidence; it is a hypothesis to measure, not an assumed improvement.

Human recognition, fairness and enjoyment remain unmeasured. The no-decay variant tested here is not used in the playable game.
