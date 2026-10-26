# Research status

This record separates implementation checks, scripted effectiveness measurements, and human experience. Passing a correctness test is not an enjoyment result.

## Completed experiments

The [adaptation-v1 report](experiments/adaptation-v1.md) is complete and passed integrity checks: 8,568 actual encounters, 32 independent tactic-sampling seeds, one deterministic map, and three scripted movement changes. The [protocol](experiments/adaptation-v1.protocol.json) was specified before this run; the fixtures were already familiar. It is a local engineering experiment, not a public preregistration.

After clockwise training, continued learning gained **18.70 HP of damage per round [16.31, 21.09]** over the identical frozen learner against counterclockwise movement, in post-switch rounds 17–24. This meets the declared primary screening criterion. It still trailed the selected fixed policy by **12.14 HP [10.03, 14.53]**. Against direction feints, continued learning reduced damage by **4.73 HP [3.89, 5.58]** versus frozen memory. Cover produced exactly 72 HP under every tested policy. Brackets are paired seed-bootstrap 95% intervals; secondary comparisons are exploratory and unadjusted.

These results establish useful adaptation in one fixture, a regression in another, and an insensitive damage measure in the cover fixture. Moving tactic probabilities alone is not evidence of improvement. This original run established no human enjoyment, new-map generalization, scout-delivery benefit, or broad superiority over fixed policies. The later three-scenario screen below extends its scope without establishing arbitrary-world generalization.

The first serial execution was interrupted for runtime reasons after six of 32 seeds completed; no full result or statistical conclusion was produced. The same protocol then completed from the beginning with four independent workers. A test compares serial and worker execution of the same trial exactly. The learning algorithm, observations, controllers, sample count and decision threshold were not changed in response to outcomes.

The subsequent [reward-attribution experiment](experiments/reward-attribution-v1.md) tested a single 50/50 individual/team-average damage reward under a separate protocol. It completed 5,376 candidate encounters plus a 264-encounter exact reference replay, reusing verified original comparisons. **Do not promote:** only two of five predeclared gates passed. Candidate-minus-original late damage was −4.55 HP [−5.91, −3.28] after reversal and −0.66 HP [−1.08, −0.28] against feints. The candidate's continued-minus-frozen learning effect on feints was −4.22 HP [−4.88, −3.56]. Cover was unchanged. All candidate choices/feedback/commits were independently replayed through Wasm. The browser retains the original reward.

## Additive credit and fresh scenarios

The [additive-credit-v1 experiment](experiments/additive-credit-v1.md) preserves full personal damage credit and adds a teammate-only bonus. It completed 5,376 candidate encounters and a 264-encounter exact reference replay. **Do not promote:** three of five gates passed. Relative to original online learning, late damage gained only +0.42 HP [0.14, 0.75] on feints, below the 3 HP practical threshold, and +0.89 HP [0.28, 1.73] on reversal. Its continued-versus-frozen effect remained negative on feints: −4.78 HP [−5.63, −3.94]. Reversal retained +19.22 HP [17.02, 21.56]. Cover was unchanged.

The separately specified [scenario-transfer-v1 screen](experiments/scenario-transfer-v1.md) executed 11,760 actual encounters across three authored cover/spawn layouts and 16 fresh policy seeds. Both rules were evaluated regardless of development outcome. Aggregate original learning benefit was +9.13 HP [7.81, 10.63] on reversal and +3.44 HP [2.94, 4.03] on feints. Additive-minus-original was +1.28 HP [0.72, 1.94] on reversal and +0.03 HP [−0.13, 0.19] on feints. The candidate failed its feint-improvement gate and remains out of the game.

These results show environment dependence: feints hurt continued learning on the original map but helped on the three new layouts, by differing amounts. The aggregate averages each seed across the same three worlds, then bootstraps the 16 seed means. It does not treat 48 world/seed pairs as 48 independent maps. The new fixed policy was selected only on clockwise calibration and is not an oracle for reverse/feint behavior. None of these tests estimates human enjoyment.

All candidate policy decisions were independently replayed through Wasm. The scenario verifier also re-executed all fixed calibration/comparison encounters and one full seed for each reward rule in each world, matching exactly (960 combat replays). Original evidence remains reproducible from the immutable v1 source archive. Across the four scored experiments there are 31,080 encounter executions, excluding reference replays and verification replays; reused original baselines are not counted again.

## Synthetic population and interaction diagnostic

The [synthetic-population-v1 screen](experiments/synthetic-population-v1.md) completed 9,920 new encounters with twelve replicate seeds. Each seed combines independent policy, map and bot parameter streams. Four training player families and two map families are separate from the two reserved player families crossed with two reserved map families. Both training arms receive 48 encounters; each reserved history contains twelve repeat, twelve switched-direction and twelve return encounters.

In the late switch window, varied training with continued learning exceeds its own frozen checkpoint by **+3.71 HP [2.15, 5.63]**. It exceeds narrow training with continued learning by only **+0.35 HP [-0.42, 1.50]**, failing the predefined 3 HP improvement gate. Its difference from the training-selected fixed policy is **+1.96 HP [-1.63, 5.56]**, which does not establish superiority. The decision is **do not promote**. The current game retains its original configuration.

Frozen policies branch before the whole test history, so these learning effects include updates during the first repeat phase. They do not isolate updates after the switch. The separately specified switch-boundary follow-up below adds that checkpoint. Player clear rate was 82.3% for both varied online and frozen conditions in the late switch window; damage gain alone did not establish a clear-rate benefit.

The [feint-interactions-v1 diagnostic](experiments/feint-interactions-v1.md) adds 96 actual encounters: all eight joint tactic combinations across three known controller styles and four existing worlds. Six matched action changes alter team damage without changing the acting role's observed reward. An offline outcome-table decomposition of original feint probabilities predicts -5.065 HP: ranger -2.709, flanker -2.183 and vanguard -0.172. This is an attribution of probability shifts under a fixed table, not proof of which learning mechanism caused the shifts or an oracle supplied to the live policy.

All **10,016** new measured combats matched full re-execution. The population verifier separately replayed all **29,760** policy decisions and reconstructed rewards from physical evidence. Across the six scored experiment/diagnostic records, there are **41,096** encounter executions, excluding reference and verification replays. The preselected [watchable comparison](experiments/synthetic-population-v1-view.html) is retained even though all five conditions inflict the same 24 HP in that particular encounter. These synthetic opponents are not human participants.

The now-examined reserved families become development/regression cases. Further tuning requires fresh reserved families for a new confirmatory claim. See [the lab guide](synthetic-lab.md) and [verification](verification-synthetic-v1.md).

## Exact switch control and score-decay ablation

The [switch-boundary-v1 follow-up](experiments/switch-boundary-v1.md) adds **1,152 new frozen encounters** and reuses **1,152** prior online outcomes. It reconstructs each checkpoint after repeat round 12 and freezes there, immediately before the strategy switch. The varied-training online-minus-boundary-frozen effect is **+2.04 HP [0.33, 3.83]**; narrow training gives +2.48 HP [0.44, 4.88]. The primary mean misses the 3 HP practical threshold. These known fixtures are a diagnostic, not untouched validation. The original +3.71 HP estimate remains valid for its earlier freeze point; the estimates have different interventions and should not be treated as independent studies.

The [retention-v1 experiment](experiments/retention-v1.md) changes only automatic score decay, from 0.025 to 0, with separately trained original/candidate learners. It executes **16,704** new encounters: 4,032 on familiar legacy cases with new policy seeds, and 12,672 on known and fresh synthetic cases. Two fresh movement rules (burst patrol and threat-triggered retreat) are crossed with two fresh map families. Switch and return comparisons each freeze at the exact phase boundary.

Decision: **retain original**, two of five locked gates pass. On the fresh late-switch aggregate, no-decay minus original is **+0.13 HP [-0.13, 0.38]**. On original-map feints, it gains +1.25 HP [0.63, 1.88], below the 3 HP gate, while continued learning remains **-4.63 HP [-5.88, -3.38]** versus its frozen checkpoint. Reversal gains +3.38 HP [1.75, 5.25] versus original in this secondary comparison, and cover remains unchanged. The full outcome pattern does not support installing the change.

The original configuration learns usefully on the new synthetic cases: **+4.50 HP [2.35, 6.79]** versus its exact switch checkpoint; no decay produces +4.48 HP [2.67, 6.48]. This supports post-switch adaptation in this defined generator, not the proposed retention fix. No-decay return gain versus original is +0.02 HP [-0.79, 0.71]. Learning from new rewards still overwrites sampled scores even when automatic decay is zero; the experiment does not test every kind of memory retention.

The two protocols add **17,856** scored executions. Across eight scored experiment/diagnostic records, the running total is **58,952**, excluding reused online outcomes and all reconstruction/verification replays. Full verification records accompany each result. The [replay](experiments/retention-v1-view.html) was selected before outcomes and shows all four conditions; it is not a representative aggregate. All newly examined families now become regression fixtures. See [the follow-up guide](retention-lab.md).

## Six-direction research program

The [completed program](research-program.md) adds 72,000 encounters across six prospectively frozen protocols, followed by a separately specified 3,584-encounter opportunity audit. Each study has sixteen seed replicates. The six primary comparisons use nominal 99.1667% paired-bootstrap intervals, with cases and roles aggregated within seed; secondary comparisons remain exploratory at 95%.

- Individual adaptation, without teammates: +0.59 HP [+0.27, +0.97] online versus exact switch-frozen memory. A small signal below the 3 HP practical gate.
- Joint team choices versus independent choices with the same shared reward: −2.44 HP [−6.42, +1.41], with an 11.63 HP loss on one reserved case. No advancement.
- Terrain-specific versus pooled solo-ranger memory: 0 HP [0, 0]. No measured gain.
- Retained versus reset memory on a returning strategy: +0.23 HP [−0.09, +0.61] in the first four encounters. No clear recall advantage.
- Scripted baited versus reset memory: +0.28 HP [+0.05, +0.61], within the −3 HP harm margin. The audit found no reversal requiring a different best ranger action, so this does not establish deception resistance.
- Hardness-selected versus uniform training at equal total encounter budget: −1.13 HP [−2.42, +0.22]. Selection probes count toward cost; no demonstrated efficiency gain.

The original independent learner still gains +6.05 HP [3.94, 8.39] over its own exact frozen checkpoint in the team study (secondary 95% interval). Failure of the joint candidate is not failure of all adaptation.

The post-hoc audit enumerates legal actions, preserves ties and cross-checks 46,080 existing fresh-case outcomes. Team choices change damage in every audited situation, and 56.3% of direction pairs require a different optimum. Several solo tasks have much weaker opportunity; the individual/context/return primary comparators have average offline headroom below their declared 3 HP gate. These are task-design limitations discovered after measurement, not grounds to relax gates retrospectively.

All **75,584** new fights matched full physical re-execution and independent policy/reward checks. The running total across **fifteen** scored experiment/diagnostic records is **134,536** executions, excluding reused evidence, reconstruction and verification replays. The [fieldbook](experiments/research-program-v1-view-2.html) includes 35 preselected recordings reconstructed through 356 matching encounters. All examined cases now become development fixtures. The validated-opportunity follow-up below now tests that requirement. See [the full guide](research-program.md) and [verification](verification-research-program-v1.md).

## Validated opportunities and recovery

The [opportunity-validation-v2 study](opportunity-lab-v2.md) qualifies tasks before evaluating learning. Every admitted A/B pair has non-overlapping optimal responses, at least 12 HP loss from retaining any former optimum in either direction, and an observable reward gap of at least 0.15. All 3,072 candidate pairs are retained; 598 qualify, yielding one first-qualified case in 94 of 96 group/seed combinations. No missing seed is replaced. This deliberately selected population is not a typical-player distribution.

The six primary effects are +8.25 HP [4.75, 12.58] for vanguard, +11.39 [6.21, 17.39] for flanker, +6.21 [4.15, 8.67] for ranger, +3.29 [−0.87, 8.95] for joint squad, +3.23 [2.23, 4.36] for flanker terrain memory and +4.00 [2.90, 5.35] for ranger terrain memory. Intervals are nominal 99.167% paired seed bootstraps; groups have 15–16 qualified seeds. The three solo and two context screens pass; joint squad remains inconclusive. Context beats both pooled and shuffled-label memory with matched capacity.

The newly added recovery metric requires three consecutive pre-choice distributions with expected regret at most 35% of the available action range. Of initially displaced learners, 14/15 vanguards, 16/16 flankers, 15/16 rangers and 2/13 joint squads reach it within 32 encounters. Unrecovered cases remain censored; initial competence is reported separately. Independent shared-reward squads recover in 10/13 cases and beat joint squads by 3.85 HP [1.41, 6.23] in an exploratory comparison.

Resetting cells at the externally signaled switch improves solo performance and speeds recovery. Returning to A also favors reset over retained solo memory. This exposes stale-preference interference; it does not implement automatic change detection. Unchanged-situation controls have near-zero mean learning gains, and terrain-specific frozen choices average about 71% optimal probability versus about 50% with pooled or shuffled memory.

The run adds 18,432 admission combats and 27,648 learning/control combats, plus 4,608 separately labeled development combats: **50,688 new executions, all fully replayed**. The running total is **185,224** across seventeen experiment/development/diagnostic records, excluding verification and demonstration reconstructions. The [viewer](experiments/opportunity-validation-v2-view-2.html) preserves the first-seed vanguard admission failure and shows 35 recordings from the other groups, reconstructed through 1,120 matching fights. The previous sources still match their hashes; no game learner was changed. Next evaluate change detection and selective forgetting on a newly frozen validation cohort.

## Evidence we can use

| Claim | Status and scope | Evidence |
| --- | --- | --- |
| Authored tactics can be selected using bounded learned preferences | Implemented and tested in Rust, Wasm and this arena | [Learning rules](learning.md), core/arena tests |
| Learning can improve enemy effectiveness over random selection | Supported in three of four tested scripted controllers; five seeds, one map | [Earlier held-fixed evaluation](held-out-evaluation.md) |
| Continued learning helps after a player strategy change | Supported for direction reversal; harmful for feints; no damage difference for cover | [Adaptation v1](experiments/adaptation-v1.md) |
| Learning beats a strong fixed strategy | Not supported on the primary reversal fixture: online 71.86 HP versus selected-fixed 84 HP; small exploratory advantage on feints | Same report |
| Blending individual and team rewards fixes the feint weakness | Not supported for the tested 50/50 blend; damage decreased on feints and reversal | [Reward attribution v1](experiments/reward-attribution-v1.md) |
| More varied synthetic pretraining improves later effectiveness | Not established: +0.35 HP [-0.42, 1.50] versus narrow pretraining in the reserved late-switch window | [Synthetic population v1](experiments/synthetic-population-v1.md) |
| Learning during unfamiliar synthetic histories improves on frozen memory | Supported in this aggregate screen: +3.71 HP [2.15, 5.63]; includes updates before the switch and varies by case | Same report |
| Removing automatic score decay repairs adaptation weaknesses | Not supported: +0.13 HP on fresh cases; harmful feint learning persists | [Retention v1](experiments/retention-v1.md) |
| Post-switch updates help on new synthetic behaviors | Supported in this defined screen: original +4.50 HP [2.35, 6.79] versus exact boundary frozen | Same report |
| Blocking reports prevents new learning | Implemented and tested; old memory can still fade | [Prototype mechanics](counterplay-prototype.md), scout tests |
| Human players notice and enjoy adaptation | Unmeasured; longer fixed-baseline study implemented and QA-verified | [Human playtest plan](playtest.md) |
| The library works outside the arena | Independent Rust/browser guard hosts and release packages exist; third-party games and engine adapters remain untested | [Integration boundaries](integration.md) |

## Automatic change detection under noisy histories

The [change-detection-v1 study](change-detection-lab-v1.md) adds **69,120 scored executions**: 6,144 admission fights and 62,976 learner/control fights. All reproduce exactly, with 69,120 independently reconstructed policy decisions and a separate detector/reset verifier. All 48 role/seed cases qualify; 328 of 1,536 candidate pairs meet admission. Development used 14,432 cached transitions on eleven previously examined cases and adds zero new physical evidence.

Both automatic full reset and selective forgetting fail the declared advancement checks in all three isolated roles. Mean gains over unchanged learning across equally weighted abrupt, gradual and recurring histories are −0.37/−0.30 HP for vanguard, −0.48/−0.43 for flanker and −0.92/−0.69 for ranger (full/selective). Stable losses are larger for vanguard: −3.22/−4.37 HP. Stable false alarms range from 2.93 to 6.05 per 100 fights, above the cap of one. Full intervals and gates are retained in the guide and summary; they use nominal 99.5833% paired seed bootstrap adjustment for twelve improvement/stability comparisons.

The detector raises alarms in 190/192 change windows, but this proximity measure does not establish useful detection: it also resets on stationary surprises and normal reward increases. The unchanged learner still beats frozen memory after abrupt change by 3.50, 6.08 and 6.70 HP for vanguard, flanker and ranger in exploratory comparisons. Privileged reset timing yields modest gains. **Do not promote automatic forgetting.** Calibrate intervention cost on these now-known development cases before spending another reserve.

Across **18 scored experiment/development/diagnostic records**, the running physical execution total is **254,344**. Cached policy development, duplicated reference outcomes, verification and visualization reconstructions are excluded. The research compares experimental memory rules; the playable game uses version 0.3.0. The [viewer](experiments/change-detection-v1-view.html), [full verification](experiments/change-detection-v1.verification.json) and [clean-extraction kit checks](releases/change-detection-v1.validation.json) preserve the outcome.

## What the game currently learns

It updates preferences among six authored tactics in one shared arena context. It does not invent maneuvers, model an individual player's route history, rewrite combat code, or increase stats. It optimizes authored rewards based largely on damage and survival of the acting enemy; those rewards are not a measure of fun.

## Interpretation and next investigation

The [post-hoc diagnostic](experiments/adaptation-v1-interpretation.md) identifies a reward-attribution problem worth testing: against feints, the flanker receives the same reward for either direction, although its direction changes damage dealt by the vanguard. Continued learning loses a useful left-flank preference. Ranger and vanguard preferences also change, so this does not isolate the complete cause of the regression.

The first reward comparison is now complete and unfavorable. Its [post-hoc interpretation](experiments/reward-attribution-v1-interpretation.md) identifies a concrete tradeoff: the blend adds a weak team contribution signal while reducing the existing reward difference between useful and ineffective individual tactics. The final left-flank preference rises slightly relative to the original, while rush and lead probabilities fall. This is consistent with the weaker damage result but is not a complete causal decomposition.

The additive follow-up is now complete. Preserving personal credit avoided the earlier blend's reversal regression but did not repair the original feint failure. The small observed gain does not meet the predeclared practical improvement threshold. Reward weighting alone has not solved the interaction in these tests. The retention follow-up also fails its improvement gates. The six-direction program has now tested joint choices with a matched-reward control; that candidate also failed. The opportunity audit motivated the validated-opportunity follow-up. That study establishes useful solo/context behavior but leaves team sampling and stale-memory interference unresolved. The noisy change-detection follow-up rejects short-window automatic full/selective resets; detecting reward differences does not by itself justify forgetting. None of these failures proves representation is the sole cause.

No human-player data has been collected for the [human study protocol](playtest.md). Two automated production-browser sessions exercise both orders and 52 encounters; their responses are labeled synthetic and excluded from human analysis. Human sample size remains zero. See [the protocol](playtest.md) and [release quick start](releases/quickstart.md).

## Rules for subsequent iterations

1. Preserve protocols, unfavorable outcomes, incomplete human sessions and exclusion reasons.
2. Select comparison policies and thresholds before reading the new test results. Disclose familiar fixtures and exploratory analysis.
3. Change one substantive mechanism at a time and assign a new protocol/implementation identity. Verify the same source and binary artifacts used for measurement.
4. Report uncertainty at the independent unit: policy seed for this simulator, participant for human sessions, and scenario/map where varied. Repeated frames and rounds do not create independent people or worlds.
5. Show representative demos with aggregate results nearby. Never select a spectacular run and describe it as typical without checking.
6. Keep measurable enemy effectiveness, fairness, comprehension and enjoyment as distinct outcomes.

The emphasis on uncertainty rather than isolated point estimates is consistent with [Agarwal et al., *Deep Reinforcement Learning at the Edge of the Statistical Precipice*](https://arxiv.org/abs/2108.13264). This prototype is a small bandit in one arena; it does not reproduce that paper's broad multi-task benchmark or claim that bootstrap intervals remove its sampling limitations.

See the [roadmap](roadmap.md) for validated learning opportunities, fresh confirmation and reusable releases.

## Conservative-intervention development

The [completed follow-up](conservative-intervention-v1.md) reuses all 48 examined change-detection cases for 259,584 cached transitions, with longer stable and recurring histories. It adds zero new scored physical encounters, leaving the physical workload total at 254,344 across eighteen scored records. This additional record is cached development.

Down-only reset, down-only score softening and separate-batch softening all have negative changing-history mean gains in every role. The separate-batch candidate passes the declared stability and stress gates, with 0.93, 0.56 and 0.71 interventions per hundred stable fights for vanguard, flanker and ranger. It fails the 1 HP benefit gate in all roles. Both overlapping-window candidates also fail the pre-run single-outlier stress check. **No candidate advances; no fresh validation is consumed.**

All cached transitions reproduce. Verification repeats 192 physical table fights and 8,160 trajectory fights; these are not new scored evidence. A separate Python check matches means, pairs, rates, budget and eligibility, without independently recomputing bootstrap intervals. The [viewer](experiments/conservative-development-v1-view.html) displays 126 reconstructed fights, with post-results selection disclosed and all-seed data beside them. The [article](publication/article.md) and [research report](publication/research-report.md) incorporate the outcome.

## Agent-assisted NPC development pilot

The [between-round pilot](agentic-npc-pilot-v1.md) adds 340 scored physical fights on two familiar ranger cases: twenty shared warm-up fights and 320 comparison fights. This brings the scored physical workload to **254,684 across nineteen scored records**; cached development, verification and connection smoke tests remain excluded.

After warm-up, a live model reviews its branch's completed observations and chooses one of seven bounded NPC plans. Ordinary Rust learning continues. Algorithm-only, statistical and random-plan branches share the same checkpoint and realized opponent history. Two agent repetitions per case/history measure model-run variation, not new independent cases.

The agent's mean damage advantage over ordinary learning is +5.625 HP per fight for stable histories and +5.4375 for recurring histories. Against the declared statistical planner it is +3.375 and +5.0625 HP. All comparisons are descriptive. The agent loses to the random planner's average in one case/history, and no branch produces a player defeat or NPC survival. All 128 model calls succeed; CLI-reported cost is $2.9748312 and mean latency is 4.88 seconds.

Every fight, observation, recorded decision and captured frame reproduces exactly without new model requests. The [viewer](experiments/agentic-npc-pilot-v1-view.html) and [frozen evidence kit](../publication/inputs/releases/tactical-air-agentic-pilot-v1.tar.gz) preserve the run. A post-run concurrency fix latches the three-failure stop across branches; it did not affect this failure-free run and is disclosed separately from the frozen sources.

**Continue development; do not claim a memory or adaptation advantage yet.** Some successful trajectories settle on a static plan. Compare repeated review with a development-selected fixed plan and a history/note ablation, then use longer histories before fresh validation. This experiment does not change the playable game's controller or the published earlier results.

## Repeated NPC review and planner-history comparison

The [completed v2 follow-up](agentic-npc-ablation-v2.md) adds **2,172 scored physical fights**: 1,384 calibration fights and 788 evaluation fights, including twenty shared warm-ups. This brings the completed scored workload to **256,856 across twenty scored records**. Two infrastructure attempts add 1,700 and 1,816 separately preserved executions, excluded from that total. Verification, cached development and connection smoke tests remain excluded.

Across equally weighted cases and histories, full review averages **16.8125 HP** per post-warm-up fight, calibrated fixed **25.625**, held initial **17.00**, and latest-fight review **15.6875**. The three primary full-minus-control differences are **−8.8125**, **−0.1875**, and **+1.125 HP**, respectively. Continued review beats the held initial choice in only one of eight paired trajectories, ties twice and loses five times. Full review improves over ordinary learning on stable histories (+4 HP), but loses on changing histories (−1.125 HP).

Full-history agents make 38 plan switches after initialization; latest-fight agents make 94. Access to accumulated history and notes therefore supports a narrow descriptive benefit over the latest-fight input in these runs, without demonstrating a notes-only benefit or superiority over a strong held plan. The calibrated fixed plan is `far` in both cases; it retains ordinary Rust tactic learning and receives additional calibration experience. It is not an equal-resource selector comparison.

All **376 planner requests succeed**, with **$6.4860687** CLI-reported cost, 4.900-second mean latency and 8.754-second p95. Every physical fight, observation, recorded decision and captured frame replays exactly. The clean-extraction kit also regenerates the viewer byte for byte. No evaluation branch defeats the player or leaves the NPC alive.

The completed run follows an initial sign-in failure and a second run stopped after sixteen successes and four timeouts. Both stopped journals remain latched and archived. Before the third attempt, only the accounting cap changed: $12.15 plus $0.648518 in prior known costs and unknown-cost allowances fits within $12.80. Across all v2 attempts, known reported cost is $6.7345867; adding four timeout allowances gives $7.1345867 in admission accounting. Actual charges for those timeouts remain unknown.

Two familiar ranger worlds and two model repetitions remain development evidence. No p-values, generalization claim or decoding-randomness benefit follows. Next compare a minimum-evidence switching rule and establish adaptation opportunity across the expanded plan menu before advancing a candidate to unfamiliar cases.
