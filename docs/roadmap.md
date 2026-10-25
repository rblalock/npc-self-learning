# Research progress and open questions

The experiments measure adaptation, team learning and memory tied to observable situations. Whether these mechanisms improve human play remains a separate question.

## Completed in 0.3.0

- Preserved the original experiments in a checksum-verified source/binary archive.
- Completed the additive teammate-credit experiment: 5,376 candidate encounters plus a 264-encounter reference replay. Rejected by the predeclared gates; the original reward remains in the game.
- Completed fresh-scenario validation: 11,760 encounters, three authored cover/spawn layouts, 16 fresh policy seeds, original/additive rewards, exact online/frozen branches, and a fixed policy selected only on clockwise calibration. Additive credit again failed its improvement gate.
- Independently replayed candidate choices/feedback/commits and complete combat checks. Negative results remain first-class evidence.

## Completed: first synthetic lab

- Six configurable player families with restricted observations, delayed reactions, aim error and repeatable noise; four generated map families with collision-compatible validity checks.
- A prospective 9,920-encounter population screen: equal encounter budgets, separate training/test behavior and map families, online/frozen branches, training-selected fixed tactics and repeat/switch/return histories.
- A 96-encounter factorial diagnostic across all eight tactic combinations, three known controllers and four worlds.
- Full combat replay of all 10,016 new encounters, independent policy/feedback verification, a preselected watchable comparison and preserved source/protocol fingerprints.
- Varied pretraining did not establish a meaningful advantage over narrow training: +0.35 HP [-0.42, 1.50]. Continued learning during reserved histories did help compared with frozen memory: +3.71 HP [2.15, 5.63] in the late switch window. No production policy change.

See [the lab](synthetic-lab.md). These tested families now serve as regression cases; they cannot remain an untouched validation set after guiding future changes.

## Unmeasured: human enjoyment

No human-player data has been collected. The [human-fixed-v1 protocol](playtest.md) specifies a formative study with 6–10 participants. Keep incomplete sessions and reports of confusion. Analyze unaided explanations, deliberate counterplay, fairness, enjoyment and frustration alongside combat outcomes. No human finding is established by automated QA.

The question is whether players can recognize and enjoy the mechanic, with specific examples and failures. If the signal is unclear, revise telegraphs, tactical differences or the study length under a new version before adding scope.

## Completed: switch-boundary control and retention test

- The [exact switch control](experiments/switch-boundary-v1.md) adds 1,152 new frozen encounters, reusing 1,152 verified online outcomes. After varied pretraining, updates after the switch add +2.04 HP [0.33, 3.83], below the 3 HP practical threshold. The earlier +3.71 HP result measures a longer learning history and is preserved.
- The [retention ablation](experiments/retention-v1.md) compares decay 0.025 with 0 using unchanged rewards, tactics and combat. It adds 16,704 encounters, two fresh behavior families and two fresh map families, with exact switch and return checkpoints.
- No decay adds only +0.13 HP [-0.13, 0.38] on the fresh switch suite. The legacy feint learning effect remains -4.63 HP [-5.88, -3.38]. Two of five locked gates pass. **Retain the original configuration.**
- The original learner's post-switch benefit on the fresh suite is +4.50 HP [2.35, 6.79]. This extends synthetic evidence for adaptation, without establishing enjoyment or arbitrary-game effectiveness.
- All 17,856 new combats matched full replay; independent feedback checks passed. A preselected [four-condition replay](experiments/retention-v1-view.html) and checksum-verified headless kit preserve the evidence. See [the guide](retention-lab.md) and [clean-extraction validation](releases/retention-lab-v1.validation.json).

## Completed: individual, team, situation and history screens

The [six-direction program](research-program.md) completes individual adaptation, joint team choices with matched reward, observable terrain memory with a capacity control, A–B–A return histories, scripted misleading histories and training selection at a fixed total encounter budget. It adds 72,000 scored fights, plus 3,584 action-table diagnostic fights. All reproduce exactly. The [fieldbook](experiments/research-program-v1-view-2.html) displays preselected real replays, odds, score changes and aggregate curves. The [headless kit](../target/releases/tactical-air-research-lab-v1-r2.tar.gz) passed [clean-extraction checks](releases/research-lab-v1-r2.validation.json): 87 checksums, 15 tests, 4,724 direct combat reconstructions and a byte-identical regenerated 35-recording viewer.

No improvement candidate passed its locked gates. The solo effect is positive but small; joint choices do not beat independent choices; terrain memory adds no damage; return memory adds no clear advantage; hardness selection does not beat uniform training. The baiting test passes its harm margin but has no audited switch requiring a different optimum, so no deception-resistance claim is warranted. The original team learner still gains +6.05 HP over frozen memory in a secondary comparison.

## Completed: validated opportunities and recovery

The [new study](opportunity-lab-v2.md) enumerates every action before learning, retains all 3,072 candidates, and requires bidirectional damage/reward separation. It adds 46,080 reserved encounters plus 4,608 development encounters, all reproduced exactly. Three isolated roles and two public-terrain memory hosts pass their declared gates. Joint squad choices remain inconclusive and trail independent choices with matched reward in a secondary comparison.

Recovery and cumulative regret now have explicit, reproducible definitions. Most solo learners recover within 32 encounters, but stale memory slows them compared with externally timed reset. Context memory helps when a public feature predicts what works. The [viewer](experiments/opportunity-validation-v2-view-2.html) makes the state changes, action opportunities, real choices and aggregate curves inspectable; even the preselected vanguard seed's admission failure is retained. The [headless kit](../target/releases/tactical-air-opportunity-lab-v2.tar.gz) passed [clean-extraction validation](releases/opportunity-lab-v2.validation.json).

## Completed: noisy change detection and forgetting

The [change-detection study](change-detection-lab-v1.md) adds 69,120 scored fights, all replayed exactly, across three isolated roles, five memory rules and abrupt, gradual, recurring and stationary histories. All 48 role/seed cases qualify. Both a full-reset detector and action-specific forgetting fail all improvement and stability gates; their only passing check is sample size. Stable false alarms occur 2.93–6.05 times per 100 fights. The original learner remains useful against abrupt changes; this forgetting heuristic makes it worse.

The [fieldbook](experiments/change-detection-v1-view.html) exposes actual fights, rewards, alarms and discarded scores beside all-seed results. Cached development, every rejected admission candidate, independent detector reconstruction and a [reusable headless kit](../target/releases/tactical-air-change-detection-lab-v1.tar.gz) are preserved. This is a measured rejection, not a new game feature.

## Completed: conservative intervention development

The [follow-up](conservative-intervention-v1.md) completes deterioration-only evidence, half-strength score interventions and separate observation batches on longer known histories. Stress tests cover outliers, saturation, sparse observations and ignored feedback. All three candidates fail the benefit gates; none consumes fresh validation. The original learner remains unchanged. The [recorded viewer](experiments/conservative-development-v1-view.html), complete transition record and downloadable kit preserve the negative result.

## Completed: agent-assisted NPC feasibility pilot

The [between-round pilot](agentic-npc-pilot-v1.md) gives each case ten ordinary-learning warm-up fights, then compares algorithmic learning, a statistical planner, random plans and two live-agent repetitions over sixteen fights. The agent reviews only its NPC's completed observations and selects among seven bounded plans. Rust learning continues, and combat statistics stay fixed.

All 340 scored fights and 128 recorded decisions replay exactly. Mean NPC damage improves by 5.63 HP on stable histories and 5.44 HP on recurring histories versus ordinary learning. The agent also exceeds the declared statistical comparator's aggregate, but loses to random planning in one case/history. Two familiar cases establish feasibility and descriptive outcomes; they do not establish general superiority, a memory benefit or the value of repeated adjustment over a fixed plan.

## Next: isolate the value of agent review

1. Select a fixed-plan comparator on separate development data, then compare it with repeated agent review under the same history and encounter budget.
2. Ablate carried notes and access to earlier observations while preserving the action menu and call budget. Separate memory value from the expanded behavior choices.
3. Use longer stable, change and return histories to measure recovery and unnecessary switching. Keep model repetitions nested within cases and record every failure, latency and cost.
4. Lock the candidate and analysis before testing unfamiliar worlds. Do not treat these two development fixtures as fresh validation.

## Further work: context transfer and team sample allocation

1. Test the useful public-context rule on reserved unfamiliar layouts and less exact repetitions. Keep pooled and shuffled-label capacity controls. Current terrain evidence does not establish transfer.
2. Separate squad sample allocation from representation under matched shared reward and total cost. Keep independent roles as a baseline and account for their different induced exploration distribution.
3. Require a new mechanism-level hypothesis before another forgetting study. Use known stable and recurring histories for development first; reserve fresh validation only after a candidate earns it.
4. Revisit curriculum selection by learning progress after these mechanisms are better understood. Preserve all failed cases and budget every extra probe.

## Additional questions

- Validate scout-delivered learning and interception as gameplay and as measured information-flow mechanisms.
- Add authored situations where tactic choice matters, then separately evaluate new controllers and maps. Three authored layouts are not a map-population benchmark.
- Check individual recordings against aggregate evidence; a selected successful run does not establish a typical outcome.

For each iteration: define a hypothesis and success criterion, freeze the protocol, change one mechanism, retain all outcomes, verify provenance, play it, and record the decision in [research status](research-status.md).
