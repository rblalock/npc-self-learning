# Tactical Air: adaptation, context and the cost of forgetting

Research snapshot, 19 October 2026. This report accompanies [Experiment: NPCs that self-learn and adjust tactics](article.md). It covers the portable library, the evidence leading to the current design, and the completed conservative-intervention development study. The experimental release remains 0.3.0; research adapters described here are separate from the shipped game.

## Findings and decision

Continued learning improves individual combat effectiveness in synthetic situations deliberately qualified to require a different best response. Memory separated by a public terrain feature improves frozen evaluation on the tested layouts. Joint squad choice remains inconclusive. Two automatic-forgetting rules failed fresh validation, and three conservative follow-ups failed development. Continue using the standard score updates.

The physical workload ledger contains 254,344 scored executions across eighteen experiment, development and diagnostic records. It includes admission and training. The latest follow-up adds 259,584 cached policy transitions and zero new scored physical fights. These totals describe work performed, not independent sample sizes. There are no controlled human-enjoyment results.

## System under test

The Rust core maintains bounded scores for host-defined role/context/action cells. For allowed actions, choice probabilities combine a temperature-scaled softmax with uniform exploration:

```text
P(action) = (1 − exploration) × softmax(score / temperature)
          + exploration / number_of_allowed_actions
```

Feedback carries a decision identity, bounded reward and observed flag. It is consumed at most once and committed at an encounter boundary. For an encounter with usable evidence, scores decay; observed cells then move toward their mean reward. The combined change is bounded by the configured maximum update, and scores remain between −1 and +1. Sample counts record evidence volume; repeated same-mean observations within one encounter do not create repeated sequential updates. Encounters without usable evidence do not update or decay scores. [Exact learning contract](../learning.md).

The browser arena supplies three roles with two authored tactics each: close/hold, left/right flank, and aim/lead. It owns geometry, movement, visibility, targeting, health and damage. The core has no world access and does not invent actions or raise stats. The host also owns reward attribution. The ordinary arena reward uses the acting enemy's damage and survival; team hosts separately use shared team damage. Reported HP is combat damage, not the reward score.

The same Rust core runs through WebAssembly in the browser and through a C ABI for native hosts. Snapshots preserve memory and random state at clean boundaries. Determinism is supported for the recorded implementation and request sequence; bit-identical floating-point behavior across arbitrary architectures is not promised. Host-supplied observations remain trusted input. [API contract](../contract.md), [integration](../integration.md).

Ink's explicit separation of learned state and authored rules supplied the conceptual starting point. This is an independent implementation, without Ink source integration, runtime, compiler or formal guarantees. The primary references are [Ink adaptive learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/adaptive-learning.md) and [policy learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/policy-learning.md).

## Experimental discipline

Protocols declare populations, seeds, arms, outcomes and decision gates before their measured runs. This is local protocol freezing, not public preregistration. Source hashes accompany the records; old sources remain archived. Development and diagnostic cases stay labeled as such after examination. A fresh parameter seed from a familiar generator is narrower than an unfamiliar controller family or an external game.

Comparisons generally pair conditions within seed and share relevant starting memory, random state and encounter schedules. Encounters are aggregated within seed before uncertainty estimation. Repeated deterministic fights cannot be counted as independent people, maps or tasks. Paired percentile bootstrap intervals are approximate at the small seed counts used here. Adjusted primary comparisons and descriptive secondary comparisons remain distinct.

The control determines the intervention being estimated. A learner frozen before an entire history measures all subsequent updates. A learner frozen at a strategy switch measures only updates after that switch. A fixed policy selected on a calibration suite has prior knowledge of that suite. A privileged reset receives information unavailable to a live detector. These are different questions rather than interchangeable baselines.

## Evidence before the qualified tasks

| Study | New scored physical executions | Result relevant to the current design |
| --- | ---: | --- |
| Original adaptation | 8,568 | Late reversal gain of 18.70 HP versus frozen memory, but 12.14 HP below the selected fixed policy; original-map feints lose 4.73 HP versus frozen |
| Two reward edits | 10,752 | Both fail advancement; retain original reward |
| Fresh authored scenarios | 11,760 | Feint learning changes sign across layouts; additive reward still fails its practical improvement gate |
| Synthetic population and interaction diagnostic | 10,016 | Varied training adds 0.35 HP [−0.42, 1.50] over narrow training; fails |
| Exact-switch follow-up and decay ablation | 17,856 | Boundary-frozen effect is 2.04 HP [0.33, 3.83]; removing decay adds 0.13 HP [−0.13, 0.38] on fresh late-switch cases; fails |
| Six-direction screen and opportunity audit | 75,584 | No proposed improvement advances; audit finds situations without a required change in best response |
| Qualified opportunity development and validation | 50,688 | Three solo roles and two terrain hosts pass; joint squad result inconclusive |
| Noisy change-detection validation | 69,120 | Full reset and selective forgetting fail improvement and stability gates |
| Total | 254,344 | Excludes reference replays, verification replays and reused outcomes |

The original fixed policy was selected across all eight profiles on clockwise, counterclockwise and cover fixtures. Its calibration included the later reversal behavior. The fresh-scenario study used a different fixed-policy calibration. Neither supports a general claim that adaptation is superior or inferior to fixed tactics. Cover in the original fixture produced exactly 72 HP for every tested policy, making damage insensitive to tactic choice there.

The [full chronological record](../research-status.md) preserves protocols, uncertainties, failed gates and interrupted execution history. The [evidence ledger](evidence-ledger.md) maps article claims to exact sources.

## Qualified opportunities: individual, team and situational learning

The opportunity-v2 generator enumerated every legal action in A and B before evaluating learners. Admission required disjoint optimal-action sets, at least 12 HP of loss from keeping any former optimum in either direction, and at least 0.15 separation in observed reward. This avoids admitting a physical advantage that the available feedback cannot distinguish.

Of 3,072 reserved candidates, 598 qualified. The harness selected the first qualifying index within each group/seed, independent of learner performance, and retained all rejected candidates. Ninety-four of 96 group/seed combinations qualified. The two failures were not replaced. These are intentionally action-sensitive tasks; the 19.5% admission rate says nothing about ordinary human play.

| Comparison | Independent qualified seeds | Mean HP gain [nominal 99.167% interval] |
| --- | ---: | --- |
| Vanguard online minus switch-frozen | 15 | +8.25 [4.75, 12.58] |
| Flanker online minus switch-frozen | 16 | +11.39 [6.21, 17.39] |
| Ranger online minus switch-frozen | 16 | +6.21 [4.15, 8.67] |
| Joint squad online minus own switch-frozen | 16 | +3.29 [−0.87, 8.95] |
| Flanker public-context minus pooled, frozen test | 16 | +3.23 [2.23, 4.36] |
| Ranger public-context minus pooled, frozen test | 15 | +4.00 [2.90, 5.35] |

Solo and squad outcomes average all 32 B encounters. Terrain outcomes average 32 frozen evaluation encounters after alternating training. Primary intervals allocate 0.05 across six comparisons. Advancement requires at least twelve qualified seeds, at least 3 HP mean gain and a positive adjusted lower bound. Context also must beat shuffled labels with equal memory capacity. Both context hosts do so.

The context feature is public wall area. Sparse/dense geometry changes while player behavior and spawn parameters remain matched. This establishes useful separation on these layouts, not transfer to unfamiliar geometry. Joint choice has eight cells and one decision per fight. Independent roles have six cells, three decisions and a different distribution over combinations. Joint minus independent with matched shared reward is −3.85 HP [−6.23, −1.41], an exploratory 95% comparison. It does not isolate representation from sampling cost.

Expected regret integrates actual pre-choice probabilities against the complete offline action table. Recovery requires three consecutive pre-choice distributions whose expected regret is at most 35% of the state's best-to-worst damage range. Unrecovered cases remain censored; recording a restricted value of 33 at a 32-fight horizon does not mean recovery occurred on fight 33. The offline optimum never enters live feedback or choices. [Full method, recovery data and kit](../opportunity-lab-v2.md).

## Noisy change detection: fresh validation of a failed rule

This study retained 48 cases, sixteen per role, from 1,536 candidates; 328 qualified. Each arm starts from identical memory and random state after 32 training fights with A/B probabilities 90/10. Abrupt, gradual, recurring and stable histories each last 64 fights. The stable distribution still produces occasional B encounters. Conditional on A/B and the chosen tactic, physical outcomes are deterministic.

The detector compares four older with four newer observed rewards for each action. Two consecutive same-direction differences of at least 0.2 trigger an alarm; the tests overlap. Full reset clears both action cells in the role/context. Selective forgetting clears only the triggering action. Both clear scores and counts after commit while preserving configuration, counters and random state. The detector receives no hidden state or switch timing.

The unchanged learner, frozen memory and privileged timing reference complete the five-arm comparison. A preceding cached development pass had already shown harm. The fixed declared rule still ran on fresh seeds to characterize that failure; it was not tuned against those seeds.

All six role/rule mean gains across changing histories are negative. Every candidate fails improvement, stable noninferiority and the cap of one stable false alarm per hundred fights. Stable rates range from 2.93 to 6.05. Nominal 99.5833% intervals cover twelve primary improvement/stability comparisons; n=16 per role. For vanguard, full reset's stable difference is −3.22 HP [−6.28, −1.17]; selective forgetting's is −4.37 [−8.25, −1.55].

Both rules alarm inside 190 of 192 designated change windows. This proximity measure does not establish causal detection, especially with alarms under stable noise. Of 126 stable full-reset alarms, 59 follow increased reward. The reset sequence harms performance even when alarms are frequent. Ordinary learning still beats frozen memory on abrupt histories by 3.50, 6.08 and 6.70 HP for vanguard, flanker and ranger, with exploratory 95% intervals [2.45, 4.78], [4.23, 8.24], [4.16, 9.59]. [Full results](../change-detection-lab-v1.md).

## Conservative interventions: completed development

The latest study reuses all 48 examined cases. It adds longer histories, not a fresh population: 128 abrupt, 128 gradual, 256 recurring and 256 stable fights after 32 shared training fights. The three candidates progressively restrict intervention to negative changes, halve scores while retaining counts, and replace overlapping recent windows with separate four-observation batches. Two low batches share a held reference. They are non-overlapping observations, not independent statistical tests.

Every autonomous intervention happens after ordinary learning and affects later choices. No probes or extra forced actions are supplied. Controls are ordinary retained learning, frozen memory, the old reset and privileged timing. The frozen protocol requires the same candidate to pass every role's sample-size, utility, stability, worst-seed, rate and stress gates before any fresh validation.

The exact inclusive gates are: sixteen cases per role; changing-history mean gain at least 1 HP; stable mean at least −0.25 HP; descriptive 95% stable lower bound at least −0.5 HP; worst stable seed at least −3 HP; at most one stable intervention per hundred fights; and passing stress checks. Abrupt, gradual and recurring means receive equal weight within seed. Rate is executed stable interventions divided by all stable fights, times one hundred. Suppressed alarms are separate.

The separate-batch candidate passes the stress and harm gates in all roles, but its changing mean is negative in all three. Down-only reset and softening also fail a single-outlier stress trace before the run: overlapping windows can reuse one bad observation as two confirmations. Those failures disqualify both regardless of aggregate performance.

| Role | Separate-batch changing gain [95%] | Stable gain [95%] | Stable interventions / 100 |
| --- | --- | --- | ---: |
| Vanguard | −0.12 [−0.21, −0.05] | −0.11 [−0.22, −0.03] | 0.93 |
| Flanker | −0.07 [−0.14, −0.02] | −0.06 [−0.13, +0.01] | 0.56 |
| Ranger | −0.08 [−0.12, −0.05] | −0.03 [−0.08, +0.01] | 0.71 |

Intervals are descriptive paired percentile bootstraps with 10,000 resamples and n=16 per role, on known cases. There is no fresh-validation or multiplicity-adjusted claim. All nine candidate/role changing means are negative. No candidate advances, and no fresh reserve is consumed. The [development guide](../conservative-intervention-v1.md) includes all candidates, controls, stress traces, gates and reproduction commands.

## Verification, downloads and recorded examples

The opportunity study re-executed all 50,688 development/reserved combats. The fresh detector study re-executed all 69,120 scored combats and reconstructed policy, feedback and reset boundaries. Their kits retain source archives, protocols, raw outcomes, summaries, hashes and recorded viewers.

The new development verifier reconstructs all 259,584 cached transitions independently of the trial's reward/intervention host, using the same archived Rust core. It also repeats 192 selected action-table fights and 8,160 actual-combat trajectory fights. These verification fights add no new inferential observations. A separate Python program checks eighteen paired comparisons' means and pairs, stable intervention rates, total transitions and eligibility. It does not independently implement the bootstrap.

| Artifact | Contents |
| --- | --- |
| [Opportunity kit](../../target/releases/tactical-air-opportunity-lab-v2.tar.gz) | Admission audit, individual/team/context learning, recovery and source |
| [Change-detection kit](../../target/releases/tactical-air-change-detection-lab-v1.tar.gz) | Fresh noisy histories, both rejected detectors, complete verification |
| [Conservative-intervention kit](../../target/releases/tactical-air-conservative-lab-v1.tar.gz) | Known-case follow-up, all transitions, stress checks and 126 recordings |
| [Latest recorded viewer](../experiments/conservative-development-v1-view.html) | Actual reconstructed fights, choice odds, feedback, interventions and all-seed comparisons |
| [Library quick start](../releases/quickstart.md) | Experimental Rust, browser/Wasm and native macOS arm64 downloads |

The latest viewer uses seed 31001 in every role, all seven arms, abrupt rounds 1/32/128 and stable rounds 1/128/256. That display rule was selected after aggregate results, without searching for favorable outcomes. Earlier viewers separately label prospectively selected and diagnostic examples. A displayed fight is never a replacement for the all-seed result.

Extract the latest kit and run:

```sh
shasum -a 256 -c SHA256SUMS
npm test
npm run verify
python3 scripts/check-conservative-arithmetic-v1.py
```

Node.js 24 is required. Python 3 supplies the optional separate arithmetic check. No dependency installation, API key or Rust rebuild is needed. Regeneration writes to a new prefix; canonical records refuse overwrites. [Latest package manifest](../releases/conservative-development-v1.package.json), [verification record](../experiments/conservative-development-v1.verification.json).

## Limits and next research

These are small, authored simulations. The action-sensitive population is selected by a declared opportunity test; it does not represent the frequency of useful adaptation in games generally. Repeated A/B fights simplify state, observation and within-fight learning. Seed bootstraps describe this construction, with approximate coverage and small independent sample counts. Internal reconstruction verifies consistency, not external validity or independent replication.

Damage measures enemy effectiveness under fixed combat rules. It does not measure fairness, readability, enjoyment, player retention or human counterplay. Those outcomes have not been measured. The library is experimental; effectiveness in third-party games has not been validated. API validity cannot make an uninformative reward or an irrelevant action set useful.

The next public-context study should reserve unfamiliar geometry and less exact repetitions. The next team study should match total cost and shared reward while separating sampling allocation from representation. Another forgetting mechanism needs a new reason to expect useful gain, plus stable-history development gates, before consuming fresh cases. No production learner change follows from the completed intervention studies.
