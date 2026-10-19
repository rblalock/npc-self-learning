# Reward attribution v1: what changed and what we learned

This interpretation was written after the [experiment](reward-attribution-v1.md). It is separate from the unchanged [pre-run protocol](reward-attribution-v1.protocol.json). The candidate remains in the experiment harness and is not enabled in the game.

## Decision

**Do not promote the 50/50 individual/team-average reward.** It passed two of five advancement gates. Across 32 matched policy seeds, candidate late damage was lower than the original reward after both reversal and feints:

| Switch | Candidate minus original, HP | Paired 95% interval |
| --- | ---: | --- |
| Reverse | −4.55 | [−5.91, −3.28] |
| Feint | −0.66 | [−1.08, −0.28] |
| Cover | 0.00 | [0.00, 0.00] |

Continued learning still helped the candidate after reversal (+13.45 HP versus its own frozen policy), but harmed it after feints (−4.22 HP). The feint problem remains. The candidate stayed worse than the selected fixed strategy after reversal. Every late-window player encounter still cleared; no win-rate or enjoyment gain was established.

There were 5,376 candidate encounters and 264 reference-replay encounters. Original comparisons were reused only after source verification and an exact complete trial replay; they are not fresh data. All candidate choices and feedback were replayed independently through the same Rust/Wasm core, reproducing the saved memories and probabilities.

## The reward tradeoff

The original diagnostic was real: a left flank can improve the vanguard's damage without improving the flanker's own damage. This candidate exposes that contribution, but replacing half of personal credit also reduces the reward difference between effective and ineffective personal tactics.

Using the deterministic feint outcomes in the original raw data, with the other roles held fixed:

| Tactic comparison | Original reward difference | 50/50 reward difference |
| --- | ---: | ---: |
| Left versus right flank, with rush + lead | 0.0000 | +0.0625 |
| Lead versus aim, with rush + left flank | +0.3750 | +0.2500 |
| Rush versus hold, with left flank + lead | +0.3750 | +0.2500 |

These are arithmetic differences under the two formulas, not a second trial or an estimate of causal credit. They show that the blend provides a weak new coordination signal while shrinking two useful individual signals. The Rust selection rule uses score differences divided by the unchanged temperature, so reward scale affects how strongly preferences influence choices.

The final mean tactic probabilities are consistent with this tradeoff:

| Feint tactic | Original reward | Candidate reward |
| --- | ---: | ---: |
| Left flank | 51.18% | 52.93% |
| Lead movement | 66.70% | 62.50% |
| Rush | 63.88% | 58.30% |

Left-flank preference rose slightly relative to the original, while lead and rush became less likely. This does not fully isolate the cause of the regression: the two rules also trained from scratch and followed different histories. It does show why “share rewards with the team” is not sufficient as an implementation recipe.

## Next hypothesis

Test whether a teammate-contribution bonus can add useful coordination credit **without reducing the existing individual-damage signal**. Define one additive candidate, its normalization/clipping, and its advancement criteria before execution. Keep the current reward, frozen controls, matched seeds, reversal guard and original negative cases. Do not sweep blend weights until one looks favorable.

This would still be development on familiar fixtures. Before promoting a successful candidate as generally effective, evaluate it on separately defined scenarios and fresh seeds. Test player comprehension, agency, fairness and enjoyment separately. The main reusable-library lesson is that the host's reward design and the learner's choice sensitivity must be examined together; receiving feedback and moving probabilities are not sufficient evidence of improvement.
