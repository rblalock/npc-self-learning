# Knowing when to forget

**Keep the original learner.** The new feedback-only change detector notices reward changes, but its automatic resets reduce performance. Neither full reset nor selective forgetting passes the locked improvement and stability checks for any of the three individual enemy roles. Detecting a change and deciding whether erasing memory will help are separate problems.

The study adds **69,120 scored physical encounters**: 6,144 admission fights and 62,976 training/comparison fights. Every fight reproduces exactly; all 69,120 choices, reward updates and memory boundaries pass independent reconstruction. Development reused previously verified outcome tables for 14,432 cached policy transitions; those are **zero new physical encounters**. The production game and Rust learner remain unchanged.

Open the [recorded fieldbook](experiments/change-detection-v1-view.html), [locked protocol](experiments/change-detection-v1.protocol.json), [full summary](experiments/change-detection-v1.summary.json) or [verification record](experiments/change-detection-v1.verification.json).

## The question

The preceding opportunity study showed that old preferences slow recovery after a real change in the effective tactic. An externally timed reset helped, but the live learner did not know when to reset. This follow-up tests whether a small host-side detector can make that decision from the rewards it actually observes.

We isolate vanguard, flanker and ranger rather than changing team mechanics at the same time. Each chooses between its original two authored tactics through the archived Rust/Wasm core. Movement, visibility, collision, health, targeting and damage use the archived combat simulator.

All **48 role/seed combinations** qualified, from **328 of 1,536 candidates (21.4%)**. Per-role admission was 62/512 vanguard, 121/512 flanker and 145/512 ranger. Admission uses complete physical action tables, before learner execution: A and B must require different best actions, with at least 12 HP and 0.15 observable reward separation in both directions. We select the first qualifying index, retain every rejected candidate, and never select using learner performance.

These are fresh parameter/world seeds for familiar authored controllers and geometry families. This is a deliberately action-sensitive challenge population, not an estimate of ordinary game encounters or unseen behavior families.

## Noise, drift and recurrence

Every arm shares an identical 32-fight training history, memory, counters and random state. Training draws A with 90% probability and B with 10%. Then five arms branch into four 64-fight histories:

| History | Distribution of behavior |
| --- | --- |
| Abrupt | B becomes 90% likely immediately |
| Gradual | B rises from 10% to 90% over 32 fights, then stays there |
| Recurring | B is 90% likely for 32 fights, then A returns to 90% |
| Stable | A remains 90% likely throughout |

The occasional B fight during stable play is a surprise, but **not a change in the underlying distribution**. All arms see the same sampled schedule for a given seed/history. Each physical A or B fight is deterministic conditional on the chosen tactic. This adds encounter-level stochastic variation; it does not simulate continuous behavioral drift within a fight.

The five arms are unchanged online learning, frozen training memory, automatic full reset, automatic selective forgetting, and a privileged reset reference. The reference knows the true mixture and both action outcomes; it resets just before the expected-damage optimum changes. It is neither an autonomous detector nor a guaranteed performance ceiling.

## The detector and its intervention

For each configured role/context/action, the adapter stores at most eight observed rewards. It compares the mean of four older rewards with four newer rewards. Two consecutive same-direction differences of at least 0.2 trigger an alarm. After an alarm, it retains the newer four observations and clears the confirmation counter. The two tests overlap; they are not independent statistical confirmations.

Warmup fills the buffers but does not trigger interventions. Later observations are accepted only after a completed, committed encounter. Unobserved feedback cannot fill a buffer. The adapter receives no scenario, strategy label, switch time, hidden state or offline table.

Full reset clears both tactic cells in the detected role/context. Selective forgetting clears only the action that triggered. Both set score and sample count to zero through the snapshot API, preserving config, encounter/decision counters and random state. The change affects subsequent choices. This is an experimental JavaScript host adapter around the reusable Rust core, not a new Rust feature or engine integration.

One declared detector rule was evaluated without a parameter sweep. Previously examined development cases already showed false alarms and harm. That negative result was retained; the unchanged locked rule then ran on fresh seeds to measure the failure. We did not tune on the new reserve.

## Primary results

Damage gain is candidate minus unchanged online learning, equally averaging all 64 fights in each of the three changing histories within each seed. Higher is better for the enemy. Stable damage gain uses the separate stationary history. Intervals are nominal **99.5833% paired seed bootstraps**, allocating 0.05 across six improvement and six stability comparisons; n=16 per role. Repeated fights are not independent samples.

| Enemy | Forgetting rule | Changing-history gain, HP | Stable-history gain, HP | False alarms / 100 stable fights |
| --- | --- | --- | --- | ---: |
| Vanguard | Full reset | −0.37 [−0.98, +0.11] | −3.22 [−6.28, −1.17] | 6.05 |
| Vanguard | Selective | −0.30 [−0.84, +0.18] | −4.37 [−8.25, −1.55] | 4.98 |
| Flanker | Full reset | −0.48 [−1.00, −0.09] | −0.94 [−1.96, −0.23] | 3.13 |
| Flanker | Selective | −0.43 [−0.97, +0.03] | −0.71 [−1.95, +0.02] | 3.13 |
| Ranger | Full reset | −0.92 [−1.96, −0.18] | −0.50 [−1.10, −0.07] | 3.13 |
| Ranger | Selective | −0.69 [−1.52, −0.10] | −0.35 [−0.77, −0.07] | 2.93 |

Every candidate fails the mean improvement, positive-bound, stable noninferiority and false-alarm gates. All satisfy only the minimum sample-size gate. Advancement required at least 1 HP gain, a positive adjusted lower bound, stable lower bound above −0.5 HP, and no more than one observed false alarm per 100 stable fights. The false-alarm cap is descriptive, not a population-rate confidence bound. Bootstrap coverage is approximate at this sample size.

## Alarms are easy; useful intervention is harder

Each detector raises a first alarm inside **190 of 192 designated change windows**. That is an operational proximity measure, not proof that every alarm identified the true change. Random variation can cause an alarm inside those windows too.

After abrupt change, average first-alarm delay is 7.5 fights for vanguard, 5.75 for flanker and 5.88 for ranger. Nevertheless, full-reset recovery is slower than unchanged learning: 27.6 versus 22.6 restricted checks for vanguard, 23.1 versus 18.0 for flanker, and 25.9 versus 20.7 for ranger. Two displaced full-reset vanguard cases and one flanker case never recover within 64; all displaced unchanged learners do. These are descriptive secondary results.

In stable play, full reset raises **126 false alarms across 3,072 fights**; selective forgetting raises **113**. Across all changing histories, full reset raises 516 alarms, despite only 192 defined change windows; selective forgetting raises 506. Additional alarms are not automatically classified as false because actual behavior is still noisy or drifting, but the full intervention sequence is charged to performance.

The evidence suggests two weaknesses worth isolating next. Short overlapping windows overreact to a few unusual rewards. Also, the rule erases preferences after both decreases and increases: 59 of 126 stable full-reset alarms follow increases in the window mean. Returning to normal after an outlier can therefore trigger more forgetting. These logs suggest mechanisms; this study does not separately identify the contribution of threshold, confirmation rule, reset strength and positive-change handling.

## The original learner still adapts

On abrupt histories, unchanged learning beats frozen memory by **3.50 HP for vanguard, 6.08 HP for flanker and 6.70 HP for ranger** per fight. Exploratory 95% intervals are [2.45, 4.78], [4.23, 8.24] and [4.16, 9.59]. The failure belongs to this automatic-forgetting proposal, not to adaptation as a whole.

Knowing the change time remains useful, but the improvement is modest over a full 64-fight history. Privileged reset gains +0.35, +0.54 and +0.33 HP on abrupt histories; on recurrence it gains +1.08, +1.30 and +0.56 HP. All six exploratory 95% intervals are positive. Stable privileged-reset histories match unchanged learning exactly because no reset is signaled.

Frozen memory can be competitive when a strategy returns: vanguard's recurring-history frozen-minus-online mean is +0.45 HP with an interval crossing zero. The conclusion is not that more updating is always better. History length and the cost of relearning matter.

## Regret and recovery

Realized regret compares damage with the best legal action in the actual A/B fight. Distribution expected regret instead integrates both the hidden A/B mixture and the policy's pre-choice probabilities, comparing with the best action before the latent state is known. These are distinct offline references; neither informs live choices.

Recovery is measured after the expected-damage optimum changes: three consecutive pre-choice distributions must have expected regret at most 35% of the current best–worst range. Initially acceptable policies are reported separately. A miss is right-censored at the next crossover or history end; restricted checks encode the horizon plus one, not a claim of recovery on that next fight. Gradual drift begins before its optimum crosses, so detector delay from drift onset and recovery from optimum crossover have different clocks.

The summary retains every case, round, action distribution, intervention, detection miss and recovery horizon. Detection fields for non-detector controls are structurally empty of alarms and should not be interpreted as failed detector evaluations.

## Inspect and reproduce

The fieldbook uses the preselected first reserve seed, 31001, in all three roles. Fixed replay rounds are 1, 8, 32 and 64. Extra stable-history rounds show the first alarm of each detector and the next decision; they are explicitly diagnostic selections. Aggregate tables and learning curves include all 16 qualifying seeds per role. Playback reconstructs actual combat, not an animation inferred from a chart.

The headless kit uses Node.js 24, no API key, no dependency installation and no Rust rebuild:

```sh
shasum -a 256 -c SHA256SUMS
npm test
npm run verify:change
npm run verify:development
```

For a fresh-prefix reproduction:

```sh
node scripts/evaluate-change-detection-v1.mjs --out target/change-replication
node scripts/verify-change-detection-v1.mjs target/change-replication
node scripts/replay-change-detection-v1.mjs --out target/change-replay
```

The replay exporter uses canonical verified results in `docs/experiments`; `--out` selects only its output prefix. The development verifier uses embedded previously measured action tables. Regenerating the original development selection requires the preceding opportunity-v2 audit, which is a separate prior-study artifact. Evidence writers refuse overwrites. See [verification](verification-change-detection-v1.md) and the [clean-extraction record](releases/change-detection-v1.validation.json).

## Next

Keep the original learner as the baseline. Before another fresh validation run, use these now-known cases to separate detecting change from authorizing a reset: calibrate false-alarm behavior, test one-sided deterioration evidence, and compare a reversible or softer intervention at matched encounter cost. Retain no-intervention and privileged-timing references. A candidate should first survive the stable development cases; another reserved cohort should not be spent merely to rediscover this failure.

Public-context transfer across new layouts and team sampling at matched reward and total cost remain separate, unresolved research questions.
