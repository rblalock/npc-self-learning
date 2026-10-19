# Validated adaptation opportunities

On prospectively qualified tasks where the best legal response changes, how much does learning reduce regret and how quickly does it recover?

18432 admission-table encounters and 27648 learning/control encounters; 46080 new reserved executions. All candidates remain in the audit, including rejects.

| Group | Qualified seeds | Primary damage gain [99.167% interval] | Decision |
|---|---:|---:|---|
| solo-vanguard | 15/16 | 8.25 [4.75, 12.58] | supported-in-qualified-tasks |
| solo-flanker | 16/16 | 11.39 [6.21, 17.39] | supported-in-qualified-tasks |
| solo-ranger | 16/16 | 6.21 [4.15, 8.67] | supported-in-qualified-tasks |
| squad | 16/16 | 3.29 [-0.87, 8.95] | not-supported-by-this-screen |
| context-flanker | 16/16 | 3.23 [2.23, 4.36] | supported-in-qualified-tasks |
| context-ranger | 15/16 | 4.00 [2.90, 5.35] | supported-in-qualified-tasks |

Six comparisons: each solo role and the joint squad online-minus-exact-switch-frozen mean damage over all 32 B encounters; each terrain-context host minus pooled context on 32 frozen alternating test encounters. Damage difference equals reduction of mean realized oracle regret. Require >=12 qualified seeds, >=3 HP mean gain and adjusted lower interval bound >0. Context also requires >=3 HP over the shuffled-label capacity control with a positive secondary 95% lower bound. No production promotion.

Solo and squad: train A for 32, branch B for 32 into online, frozen, uniform, and cell-reset online; return A for 32 from the B-online checkpoint into online, frozen and cell-reset; sham A for 32 from the original A checkpoint into online/frozen. Squad uses a real joint eight-action policy with shared reward; an additional independent-role host receives the identical reward, with its own 32 A training and 32 B online/frozen branches. Context: pooled/terrain/shuffled hosts each train for 32 alternating A/B encounters and test frozen for 32 alternating B/A encounters. Only map geometry changes between context A and B.

## Recovery and regret

First ending encounter of three consecutive PRE-CHOICE distributions whose exact expected regret is <=35% of that state’s best-minus-worst action range. Report initially displaced cases separately; initially acceptable policies are not evidence of recovery. Unreached cases are right-censored after 32; restricted-check summaries encode them as 33 and never discard them. No mean over successes alone.

Offline best legal action damage minus actual damage; cumulative regret sums over encounters. Expected regret integrates the actual joint-choice probabilities against full conditional outcome tables (products for independent roles). Tables never enter choose/feedback. This oracle is an optimistic reference, not a deployable agent.

The summary JSON contains each branch’s cumulative regret, initial displacement, censored recovery records, probability-integrated regret, clear/death rates and four-encounter curves. These secondary measures are exploratory.

## Admission and scope

Enumerate every candidate and every legal action in both states before running any learner. Keep all outcomes. Select the first qualifying candidate per group/seed by index. Never backfill a seed with no qualifying candidate. No learner performance enters selection.

This is a deliberately action-sensitive challenge population, not a random sample of games or players. Report both candidate-level and seed-level qualification. The reserve contains new parameter/world seeds for familiar controller families, not unseen behavior families.

- Development enumerated 4,608 fights and informed the generator and reward eligibility criterion; development outcomes are not reserved evidence.
- Authored controllers use delayed restricted public observations. Slower firing schedules intentionally allow differences between tactics to emerge; player weapon capabilities and all enemy stats stay unchanged.
- Individual means isolated enemy, not player-identity recognition. One tactic is chosen per encounter, not within-fight replanning.
- The joint/independent sampling distributions differ despite matched scalar exploration and temperature. This comparison does not isolate factorization from exploration.
- Seed bootstrap coverage is approximate at n<=16. Cases and repeated rounds are not independent population draws. Secondary controls, return results, curves, recovery and expected regret are exploratory.
- A/B tasks repeat exactly conditional on actions; new learning experiences differ through stochastic choices and feedback, not an independently resampled physical world each round.
- Damage opportunity does not guarantee practical learnability within 32 encounters; reward saturation, noisy sampling and memory interference may still matter.
- Rejects and missing qualification are part of the result. No thresholds, sample sizes, labels or candidates change after freezing.
- Public terrain is the only contextual cue. No strategy labels, future actions, oracle choices or rewards are supplied to the learner.
- Previous measured sources, results and the production game remain unchanged.
