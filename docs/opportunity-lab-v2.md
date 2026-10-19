# Adaptation when the best response really changes

The stronger test works. All three isolated enemy roles show meaningful post-change learning, and both terrain-memory experiments pass their declared improvement gates. The joint squad learner remains inconclusive and trails independent choices with the same reward in an exploratory comparison. These conclusions apply to a deliberately qualified challenge population, not typical players or arbitrary maps.

The program adds **46,080 reserved scored encounters**: 18,432 fixed-action admission fights and 27,648 learning/control fights. A separate development sweep used 4,608 fights. All **50,688** new executions reproduced exactly; reconstruction and verification runs are not counted as new evidence. The original game configuration remains unchanged.

Watch the [recorded trials](experiments/opportunity-validation-v2-view-2.html). They retain the preselected first seed, including its failed vanguard qualification. The viewer shows actual combat, tactic probabilities, the best legal responses in both situations, cumulative lost damage and learning curves.

## What changed in the experiment

The earlier screen found that a movement reversal often left the best tactic unchanged. This time the task must earn admission before we evaluate any learner:

1. Enumerate every legal tactic or tactic combination in situations A and B.
2. Require non-overlapping optimal-action sets. Keeping **any** previously optimal choice must lose at least 12 HP in the new situation, in both directions.
3. Require an observable reward gap of at least 0.15 between a damage-optimal choice and the former optimal choices. Saturated or missing feedback cannot qualify a task just because physical outcomes differ.
4. Keep all 32 candidates per seed, then select the first qualifying candidate by index. Selection uses physical action tables, never learner performance.

Of 3,072 reserved candidates, **598 qualified (19.5%)**. At least one qualified in **94 of 96 group/seed combinations**. One vanguard seed and one terrain-ranger seed had none; they were not replaced. Each group still exceeded the predeclared minimum of twelve qualified seeds.

The four development seeds are disjoint from the sixteen reserved seeds. The reserve uses new parameter/world seeds for familiar scripted movement families; it does not introduce unseen controller families. Slower synthetic firing schedules give tactics time to produce distinguishable outcomes. Weapon capabilities, enemy health, movement speeds, damage, collision and visibility remain the archived game's rules.

This qualification is intentional distribution design. It answers whether the learner can exploit validated opportunities. It does not estimate how often such opportunities occur in ordinary play, and the 19.5% rate only describes this authored candidate generator.

## Primary results

Positive differences mean more enemy damage per encounter, equivalently less realized regret against the same offline action-table optimum. Solo and squad comparisons cover **all 32 post-change encounters**, not a favorable late window. Context comparisons cover 32 frozen test encounters alternating between two terrains after 32 alternating training encounters.

| Group | Qualified seeds | Primary gain [99.167% interval] | Decision |
| --- | ---: | ---: | --- |
| Vanguard alone | 15 | +8.25 [4.75, 12.58] HP | Pass |
| Flanker alone | 16 | +11.39 [6.21, 17.39] HP | Pass |
| Ranger alone | 16 | +6.21 [4.15, 8.67] HP | Pass |
| Joint squad | 16 | +3.29 [−0.87, 8.95] HP | Inconclusive; interval crosses zero |
| Flanker terrain memory | 16 | +3.23 [2.23, 4.36] HP | Pass |
| Ranger terrain memory | 15 | +4.00 [2.90, 5.35] HP | Pass |

The first four compare continued learning with the identical memory frozen at the A→B boundary, including random state. The last two compare terrain-specific memory with pooled memory. Advancement requires at least twelve qualifying seeds, a mean gain of at least 3 HP and a positive adjusted interval lower bound. Context also has to beat shuffled labels with the same memory capacity; both did, by +3.42 HP and +3.73 HP respectively (secondary comparisons).

Intervals are nominal 99.1667% paired percentile bootstraps, allocating 0.05 across six primary comparisons. They are approximate at 15–16 independent seed cases. Repeated encounters do not increase the independent sample size. The complete [protocol](experiments/opportunity-validation-v2.protocol.json), [results report](experiments/opportunity-validation-v2.md) and [summary](experiments/opportunity-validation-v2.summary.json) retain all gates and secondary results.

## How quickly did they recover?

For each encounter we integrate the learner's actual pre-choice probabilities against the complete action table. Expected regret is the expected HP shortfall from the best legal choice. Recovery means **three consecutive encounters with expected regret no greater than 35% of that state's best-to-worst action range**. The metric evaluates the distribution before the sampled action, so one lucky shot cannot count as recovery.

| Post-change learner | Initially displaced | Recovered by encounter 32 | Mean restricted checks to criterion |
| --- | ---: | ---: | ---: |
| Vanguard | 15 | 14 | 17.4 |
| Flanker | 16 | 16 | 14.7 |
| Ranger | 16 | 15 | 16.9 |
| Joint squad | 13 | 2 | 29.6 |
| Independent squad, same shared reward | 13 | 10 | 16.7 |

“Initially displaced” excludes policies already within the criterion before any B feedback. Unrecovered cases remain right-censored at 32; the restricted-check summary records them as 33. This is not the mean time among successful cases and is not a claim that censored cases recovered on encounter 33. These recovery measures are exploratory, with per-seed records retained rather than population confidence claims.

No initially displaced frozen control recovered. The unchanged-situation negative controls showed mean online-minus-frozen gains of +0.15 HP for vanguard, +0.02 for flanker, 0.00 for ranger and −0.41 for the joint squad. The large solo gains therefore accompany the verified response change rather than simply more time spent training in a stable situation.

## Memory helps, and stale memory has a cost

Across the 32 B encounters, retained online memory trails an externally reset online learner by **0.90 HP for vanguard, 1.76 for flanker and 1.52 for ranger** per encounter. Reset solo learners reach the recovery criterion in about 9.6–9.9 restricted checks, compared with 14.7–17.4 when retaining A preferences.

Returning from B to A is also harder for retained solo memory than reset cells: −3.73 HP for vanguard, −2.20 for flanker and −0.63 for ranger over the 32 return encounters. These are exploratory 95% comparisons; every interval is below zero in the summary. Continued learning still helps versus remaining frozen on B preferences. We have demonstrated adaptation, but not reliable preservation and recognition of a returning strategy.

Reset changes **only memory cells**, preserving encounter counters and the random stream at the boundary. It is an externally timed reference intervention. The library was not given a detector that knows when to reset. Automatically clearing memory after every bad encounter could destroy useful knowledge; that behavior has not been evaluated here.

Context addresses a different, observable case. The terrain tests keep player behavior and spawn parameters the same while switching between sparse and dense geometry. The host supplies a public wall-area context, never an A/B strategy label. Pooled and shuffled-label choices average about 50% optimal probability; terrain-specific memory averages about **71%**. The experiment supports separating memories when an observable feature genuinely predicts which response works.

## The team problem remains open

The primary squad host chooses one of eight authored tactic combinations using the real Rust core and shared team damage feedback. Its switch gain over frozen memory is positive on average, but the adjusted interval is inconclusive.

Independent role choices receiving the **same shared reward** gain +8.31 HP [4.46, 12.76] versus their own frozen checkpoint. Joint-minus-independent is **−3.85 HP [−6.23, −1.41]** over the switch period. These are secondary 95% comparisons. Joint choice is not automatically better coordination: it has eight cells, one decision per fight and a different induced exploration distribution, whereas independent roles have six cells and three decisions. Equal histories and scalar exploration do not make those sampling distributions identical.

The action tables show substantial team opportunity; the learner is not exploiting it efficiently within this budget. Distinguishing sample allocation, reward attribution and representation remains a research task. This result does not justify installing joint choice in the game.

## What the measurements mean

- **Realized cumulative regret:** sum of the best legal action's damage minus the action actually chosen, in HP over 32 encounters.
- **Expected regret:** the same shortfall integrated over actual choice probabilities. Independent-role probabilities are multiplied to obtain each joint-action probability.
- **Oracle:** an offline, per-world action table. It is an optimistic reference and never enters live choice or feedback.
- **Context benefit:** frozen evaluation after training; it measures situation-specific choice, not live recovery speed.
- **Return and reset results:** separately labeled secondary interventions, not an autonomous strategy-recognition system.

The task repeats exactly conditional on its chosen action. Policy randomness and the resulting feedback generate different learning histories; the physical world is not independently resampled every round. This controlled setting allows exact regret computation and full replay, with correspondingly limited realism.

## Reproduce it

The headless kit uses Node.js 24 and the checksum-verified archived Rust/Wasm runtime. It needs no API key, dependency installation or Rust rebuild. From the extracted kit:

```sh
shasum -a 256 -c SHA256SUMS
npm test
npm run verify:opportunity-v2
```

To reproduce measured results at a fresh prefix:

```sh
node scripts/evaluate-opportunity-v2.mjs --out target/opportunity-replication
node scripts/verify-opportunity-v2.mjs target/opportunity-replication
node scripts/replay-opportunity-v2.mjs --out target/opportunity-replay
```

The evaluator freezes sources before admission, writes every candidate table, and writes selection before running any learner. The verifier independently reconstructs choices and rewards, verifies exact branch/reset provenance, re-executes every fight, reconstructs every admission decision and recomputes summaries. The replay exporter uses the canonical verified result and audit in `docs/experiments`; its output prefix does not select an alternate result set.

Writers refuse to overwrite evidence. The preserved development JSON embeds the generator source used before reward-eligibility refinement; its separate verifier checks all 4,608 development action tables and fights. The formal v2 implementation and protocol were frozen before reserved outcomes and remain unchanged. Earlier experiment source hashes still match.

## Next experiment

Test **change detection and selective forgetting** on these now-known development cases, then reserve fresh validation instances. Compare the unchanged learner, a simple detector, externally signaled reset and frozen memory. Include abrupt changes, gradual drift and long stable periods. Charge false resets as lost performance; report detection delay and missed changes as well as regret.

For situations with public cues, test whether the useful context rule transfers to new layouts and less exact repetitions. For teams, investigate sample allocation under matched reward and total cost before adding more joint actions. Do not retune against this reserved cohort and call it untouched confirmation. The next protocol must specify its own held-out population, thresholds and costs before measurement.
