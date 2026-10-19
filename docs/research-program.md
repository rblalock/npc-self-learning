# Six directions for adaptive enemies

The first controlled screen is complete for individual adaptation, team coordination, situational memory, returning strategies, misleading histories and adaptive training. **72,000 scored encounters** were followed by a separate **3,584-encounter action-opportunity audit**. Every encounter reproduced exactly. None of the five improvement proposals met its declared advancement criteria. The scripted deception test met its harm margin, but the audit shows that it was too weak to establish deception resistance.

The useful finding is where to work next: **make sure a task requires a different response before judging whether an enemy learned that response.** Team fights have substantial action-dependent outcomes; several isolated-ranger tasks do not. The original game learner remains the reference configuration.

Open the [research fieldbook](experiments/research-program-v1-view-2.html) to watch all six studies, change conditions and inspect actual tactic odds, score updates and aggregate learning curves. The displayed encounters were specified before outcomes: first seed, first reserved case, all three roles in the individual study. They are illustrations, not estimates of typical performance.

## Results

Positive differences mean more damage inflicted by enemies, in HP per encounter. Primary intervals below are nominal **99.1667% paired seed-bootstrap intervals**, applying a Bonferroni allocation of 0.05 across six primary questions. They are approximate intervals from 16 seed replicates, not a guarantee about arbitrary games. Cases and roles are averaged within each seed before resampling. Secondary results use exploratory, unadjusted 95% intervals.

| Question | Primary comparison | Difference [interval] | Decision |
| --- | --- | --- | --- |
| [Individual adaptation](experiments/individual-adaptation-v1.md) | Online minus frozen at the switch, isolated enemies | +0.59 [+0.27, +0.97] | Small positive effect; below the 3 HP practical threshold |
| [Team coordination](experiments/team-coordination-v1.md) | Joint combinations minus independent choices, same shared reward | −2.44 [−6.42, +1.41] | No demonstrated gain; one reserved case regressed by 11.63 HP |
| [Situational memory](experiments/situational-memory-v1.md) | Terrain-specific memory minus pooled memory, solo ranger | 0.00 [0.00, 0.00] | No gain in this screen; little available damage improvement |
| [Returning strategies](experiments/return-memory-v1.md) | Retained memory minus reset cells, first four returning encounters | +0.23 [−0.09, +0.61] | No clear practical recall advantage |
| [Misleading histories](experiments/deception-stress-v1.md) | Baited memory minus reset cells, first four attack encounters | +0.28 [+0.05, +0.61] | Within the −3 HP harm margin; weak stress test |
| [Training efficiency](experiments/curriculum-budget-v1.md) | Hardness-selected training minus uniform training, equal total encounters | −1.13 [−2.42, +0.22] | Selection cost did not produce a demonstrated benefit |

Except for return/deception (first four) and curriculum (all twelve), the primary window is the final four encounters after switching. The improvement studies require a mean gain of at least 3 HP, a positive adjusted lower interval bound and no reserved-case mean loss worse than 6 HP, plus their protocol-specific control gates. A statistical signal alone does not pass the practical gate.

There is still evidence that learning works in these environments. In the team study, the **original independent learner gained +6.05 HP [3.94, 8.39]** over its own exact frozen checkpoint. Joint choices gained +3.47 HP [1.59, 5.67] over their own frozen checkpoint, but did not beat the simpler learner. These are secondary comparisons. Their role is to distinguish “the new architecture failed to improve” from “nothing learned.”

## What each experiment isolates

### Individual adaptation

Each original role fights alone, with the other actors removed before simulation begins. Its health, movement, weapon, cooldown and authored choices are unchanged. The host preserves original actor identifiers for projectile attribution and verifies that absent actors contribute no damage, sighting or reward.

Each role receives 48 diverse training encounters. Each test case then has twelve repeat encounters and twelve switched encounters, with online, exact-boundary frozen, uniform-random and training-selected fixed controls. The fixed tactic is the highest-scored action immediately before the switch; it is not chosen using test outcomes.

Exploratory role effects versus frozen are +0.28 HP for vanguard, +1.03 for flanker and +0.47 for ranger. The aggregate +0.59 HP is real within this screen's statistical model, but modest. It does not establish player-specific identity memory: “individual” here means one enemy without teammates.

### Team coordination

Three hosts use the same underlying Rust/Wasm policy: original independent roles with original personal rewards; independent roles with a shared team reward; and one squad decision over all eight existing tactic combinations with that same shared reward. This makes the principal comparison about the joint-choice architecture rather than merely changing its reward.

The shared reward is `2 × min(total enemy damage, 100) / 100 − 1`, eligible only when every role has an actual sighting. Original individual feedback stays unchanged. The joint host has eight score cells and one decision per encounter; the independent hosts have six cells and three decisions. Exploration and temperature scalars match, but a product of three two-action distributions is not an eight-action softmax. The treatment includes that sampling difference. It is not a pure representation experiment with identical action probabilities.

All three variants receive equal encounter schedules. The primary joint-minus-shared average is negative with substantial uncertainty, and cover-peek/courtyard loses 11.63 HP. Shared-minus-original averages exactly zero, while individual cases differ. Larger action space, sampling and reward eligibility are possible contributors; this experiment does not identify one as the cause.

### Situational memory

A solo ranger receives either one pooled memory, separate sparse/dense terrain memories, or two sham memories assigned by a deterministic hash independent of terrain. Public wall area defines terrain; no player family, strategy label, future state or hidden enemy state enters the decision.

The sham condition controls for extra memory capacity. Terrain-minus-pooled damage is exactly zero in the primary window, and terrain-minus-sham is only +0.28 HP [0.00, 0.56]. This does not show that context is useless: the action audit finds very little room for this ranger's two choices to improve damage in these cases. We have tested one coarse terrain feature, not general situation understanding.

### Returning strategies

The history is A for 24 encounters, B for 24, then A for 24. Four return branches use retained online memory, retained frozen memory, reset cells, or saved A cells. Reset and saved-A interventions preserve the B checkpoint's random stream and counters; only memory cells change. The saved-A branch is an externally signaled reference, not an enemy autonomously recognizing A.

Retained-minus-reset is +0.23 HP in the first four return encounters and +0.02 in the last four. Retained-minus-saved-A is −0.05 HP [−0.14, 0.00] early. Only 3.1% of audited direction pairs require disjoint best-action sets. A return to the original movement direction therefore seldom demands recovery of a different optimal tactic.

### Misleading histories

The solo ranger observes 24 bait encounters and then 24 opposite-direction attack encounters. Controls include matching-direction training, frozen baited memory and reset cells with aligned random state. This is a fixed scripted bait-and-reverse history. There is no optimizing attacker, learned attacker or access to the learner's private policy.

The primary baited-minus-reset comparison stays within the declared harm margin. Baited memory nevertheless trails matching history by −0.75 HP [−1.41, −0.23] early. The audit finds **zero** direction pairs requiring a different best tactic; observed reward magnitudes can still differ. Advertise neither deception resistance nor adversarial robustness from this result.

### Training efficiency

Every arm spends 48 pretest combats. Uniform48 uses all 48 for updates. Uniform24 uses 24 updates plus 24 ignored frozen probes. Adaptive24 uses 24 updates plus 24 selection probes. In each of eight cycles, three probes start from the same frozen checkpoint; the lowest enemy-damage case supplies the next three training examples. Reserved cases are never used for selection.

This is a hardness heuristic, not an estimate of learning value. Compared with matched 24-update uniform training, its exploratory effect is +0.33 HP [−0.42, 1.23]. Compared with spending all 48 encounters on uniform learning, it is −1.13 HP. Selection overhead is part of the result. Equal encounter budgets do not mean equal simulation steps or CPU time; both are recorded separately.

## The action-opportunity audit

After the primary outcomes were available, a separately frozen [diagnostic protocol](experiments/learning-opportunity-audit-v1.protocol.json) enumerated every legal tactic or combination on each reserved world in both movement directions. It executed 3,584 counterfactual fights and checked **46,080 existing main-study fights** against the corresponding outcome tables, including complete physical results and input fingerprints. Matches are validation, not additional independent observations.

“Action-sensitive” means at least two legal choices produce different damage. A “required change” means the best-action sets in the two directions do not overlap: keeping any previously optimal tactic would now be suboptimal. Ties are handled as sets, not arbitrarily broken to manufacture a switch.

| Study / actor | Action-sensitive situations | Direction pairs requiring a different optimum | Mean best-minus-worst range |
| --- | ---: | ---: | ---: |
| Individual / vanguard | 32.8% | 7.8% | 4.41 HP |
| Individual / flanker | 53.1% | 17.2% | 8.06 HP |
| Individual / ranger | 26.6% | 0.0% | 3.28 HP |
| Team / squad | 100.0% | 56.3% | 39.22 HP |
| Situational / ranger | 24.2% | 4.7% | 3.28 HP |
| Return / ranger | 41.4% | 3.1% | 5.34 HP |
| Deception / ranger | 36.7% | 0.0% | 5.25 HP |
| Curriculum / squad | 98.4% | 64.1% | 39.19 HP |

Each row has 64 direction pairs (16 seeds × four cases) and 128 direction-specific situations. These are descriptive results from the examined suite, not new population confidence bounds. A direction-switch audit alone does not validate whether the sparse/dense context feature predicts different optima across maps.

The optimistic offline best-action headroom over each primary comparator is 2.58 HP for individual adaptation, 15.47 for team coordination, 0.98 for situational memory, 1.64 for return memory, 2.67 for deception and 20.13 for curriculum. The individual, context and return improvement thresholds were larger than the average available headroom under these exact action tables. Preserve the failed screens; do not lower thresholds after observing them.

This oracle knows each world's outcomes. It is a diagnostic ceiling, not a policy we trained, and it is never supplied to the learning agent. A new learner may fail to attain it even with adequate data. The team result establishes substantial available opportunity, not that joint choices necessarily exploit it efficiently.

## Reproducibility and scope

All six protocols and their shared sources were frozen before the first measured fight in this program. Sixteen separate seed replicates per study combine deterministic policy, map and player streams. Four training movement families and two training map families are separate from two newly authored reserved movement families (zigzag advance and cover peek) crossed with two reserved map families (long spines and courtyard). Small spawn jitter and bounded sensor-limited player variability are seeded. The family-level sample remains small; thousands of encounters are not thousands of independent worlds.

Actual perception, movement, bullets, collision, line of sight and combat come from the immutable baseline arena. The original Rust/Wasm core makes the choices and applies updates. The physical host only isolates actors and routes decisions/feedback. No LLM generates observations or grades success. The archived measurement binary is the evidence identity; the current browser build is not claimed to be byte-identical to it.

Each raw result contains scenarios, initial/end checkpoints, choices, probabilities, actions, physical outcomes, observations, feedback, learned cells, frame counts and input fingerprints. A separate verifier reconstructs choices and rewards, verifies branch/intervention provenance, recomputes summaries, and re-executes **all 75,584** new fights. Determinism checks establish implementation consistency, not realism or validity of the reward objective.

The audit was designed after inspecting primary results and is explicitly exploratory. All examined reserved cases now become development/regression cases. Further confirmatory work needs a new locked validation population; this program cannot be repeatedly retuned and still called untouched.

## Run the research kit

The packaged headless kit requires **Node.js 24**, no dependency installation, API key or Rust rebuild. It contains the archived Wasm runtime, preserved simulator, protocols, raw results, independent verifiers, tests and offline replay. From its extracted directory:

```sh
shasum -a 256 -c SHA256SUMS
npm test
npm run verify:research
```

Reproduce to fresh output locations; measurement writers refuse to overwrite evidence:

```sh
node scripts/evaluate-research.mjs --out target/research-replication
node scripts/verify-research.mjs target/research-replication
node scripts/opportunity-audit.mjs --out target/opportunity-replication
node scripts/replay-research.mjs --out target/research-replay
```

The audit command includes independent verification and full combat replay. It checks against the preserved canonical six parent results in `docs/experiments`, not an arbitrary replication directory. The replay command likewise uses those canonical results and their verification records. `target` is created by baseline extraction before the replay export; its output argument is a filename prefix, while the six-study evaluator takes a directory. Embedded replay data works offline; report links in a replay exported elsewhere may need the reports copied alongside it.

Source hashes intentionally reject unversioned edits to measured code. To extend the lab, preserve these files and introduce a new version of the implementation/protocol; use a new output location and fresh validation families. Changing the locked files and rerunning their historical verifier is not a valid new experiment.

## Next milestone

1. **Validate learning opportunities first.** On development fixtures, enumerate legal actions and demonstrate meaningful action gaps, actual optimal-response changes and enough headroom for the declared effect size. Keep insensitive cases as negative controls. For context, validate different optima across public situations, not just movement reversals.
2. **Measure adaptation speed and regret.** Compare damage lost to the offline best feasible action, encounters to recover after a verified change, and cumulative performance, alongside damage and clear/death rates. Specify windows and thresholds before testing.
3. **Separate mechanisms.** Solo tests should establish action learning without teammate effects. Team tests should distinguish coordination, credit assignment and sampling budget. Situation tests should use observable features with predictive value plus capacity/shuffled-label controls. Return/deception tests must actually change what works.
4. **Improve training selection only when the task is learnable.** Compare uniform, hardness and learning-progress selection at fixed total cost. Include probes, rejected worlds and simulation steps in costs. Keep validation out of selection.
5. **Run a fresh confirmatory screen, then package the supported behavior.** Keep unfavorable cases, report effect uncertainty, and use preselected demos beside aggregate results.

This is a completed first screen in all six directions, not a claim that all six capabilities have been solved. The archived simulator, learner and verification tools support further controlled comparisons.
