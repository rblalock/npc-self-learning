# What does repeated NPC review add?

Repeated agent review did **not** improve mean NPC damage beyond holding the
agent's first choice in this follow-up. Access to earlier fights and notes
helped compared with reviewing only the latest fight, but a separately
calibrated fixed plan performed best in every case/history comparison.

The study completed on October 26, 2026: **2,172 scored fights and 376 successful
planner requests**, with no failed requests. These are two familiar ranger
worlds with new schedules, not fresh-world validation. All adjustments concern
the enemy NPC; the player remains its opponent.

## Results

Mean NPC damage per post-warm-up fight, in HP. Higher favors the enemy NPC.
Model repetitions are averaged within each case/history, then cases receive
equal weight. All 768 post-warm-up evaluation fights count.

| Opponent history | Ordinary learner | Calibrated fixed | Held initial choice | Full history | Latest fight |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stable mixture | 13.50 | 24.00 | 17.75 | 17.50 | 15.625 |
| Change and return | 17.25 | 27.25 | 16.25 | 16.125 | 15.75 |
| Equal average of both | 15.375 | 25.625 | 17.00 | 16.8125 | 15.6875 |

The three primary contrasts answer different questions. Positive values favor
full-history review; values are HP per fight.

| Opponent history | Full − calibrated fixed | Full − held initial | Full − latest fight |
| --- | ---: | ---: | ---: |
| Stable mixture | −6.50 | −0.25 | +1.875 |
| Change and return | −11.125 | −0.125 | +0.375 |
| Equal average of both | **−8.8125** | **−0.1875** | **+1.125** |

Continued full review beats its paired held-initial branch in **one of eight
trajectories**, matches it twice, and loses five times. These runs provide no
average benefit from making another agent decision before every fight.

The history-and-note input produces more damage than latest-fight input in
seven of eight paired trajectories. It also makes fewer subsequent plan
switches: **38 versus 94**, across 184 between-round opportunities per arm.
These counts exclude the initial selection. This supports a narrow descriptive
finding: accumulated information reduced damaging switching in these runs.
It does not isolate a benefit from notes alone, or establish a general memory
advantage.

Against ordinary algorithmic learning, full review gains 4 HP per fight on
stable histories but loses 1.125 HP on change-and-return histories. Its combined
advantage is 1.4375 HP. Reporting only that combined number would hide the loss
on the changing histories.

## What happened in individual runs

| Case / history | Calibrated fixed | Held initial | Full run 1 | Full run 2 | Latest run 1 | Latest run 2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 31001 / stable | 31.50 | 23.00 | 23.00 | 23.00 | 22.00 | 22.00 |
| 31001 / change and return | 21.00 | 14.00 | 13.00 | 15.50 | 14.50 | 14.50 |
| 31042 / stable | 16.50 | 12.50 | 12.00 | 12.00 | 10.00 | 8.50 |
| 31042 / change and return | 33.50 | 18.50 | 18.00 | 18.00 | 17.00 | 17.00 |

Every shared initial request chose `lead`: predict the observed opponent's
movement when firing. In case 31001's stable history, both full-history agents
kept it for all 24 fights, exactly matching their held-initial branches. The
latest-fight agents each diverted for one fight after a zero-damage result,
then returned to leading. Their mean damage was one HP lower.

Case 31042's stable history made the difference more visible. Both full-history
runs tried three alternatives early, then returned to leading from fight five
onward. Each averaged 12 HP, slightly below the held choice's 12.5. Both
latest-fight runs switched plans after every fight and averaged 10 and 8.5 HP.
Reacting more often did not produce better adaptation.

The recurring history in case 31001 shows why repetitions matter. One
full-history run averaged 13 HP and the other 15.5; holding the shared initial
plan produced 14. One agent trajectory helped, the other hurt. Their identical
opponent schedule does not make those two model runs independent worlds.

Calibration selected `far` in both cases. It keeps the ranger's engagement
distance at 340 units instead of 275, while Rust continues choosing between
direct aim and leading. That complete plan stayed fixed during evaluation and
beat every full-history trajectory. A fixed plan here still contains ordinary
algorithmic learning; it is not a frozen sequence of NPC actions.

The fixed benchmark received additional simulation experience before evaluation.
Its result shows a strong available configuration in these worlds, not an
information- or cost-matched victory over every possible agent. Conversely,
changing plans and writing plausible explanations did not establish improvement.
The recorded explanations are model claims, not causal evidence.

No evaluation branch defeated the player or left the NPC alive. The measured
outcome is damage, not improved win rate.

## Design

Each case starts with ten ordinary-learning fights. All evaluation branches
restore the same Rust checkpoint and face the same sampled opponent schedule
for another 24 fights.

| Branch | What changes between fights |
| --- | --- |
| Ordinary learner | Rust updates tactic preferences; the default plan stays fixed |
| Calibrated fixed | One complete plan selected on separate calibration histories stays fixed |
| Held initial choice | The agent's first selected complete plan stays fixed |
| Full history | A fresh agent request reviews every completed own-branch fight and its previous note |
| Latest fight | After common initialization, a fresh request sees only its immediately preceding fight and current plan |

There are two model repetitions per case/history. Each repetition makes one
shared initial request from the ten warm-ups, the baseline plan and an empty
note. Its decision is applied to the full, latest-fight and held-initial
branches. Their first fight and resulting policy state match exactly. The
shared request is counted once.

From the second fight onward, full and latest-fight agents receive their own
branch's observations. Both omit policy scores, counts and probabilities. The
latest-fight input also excludes older fights, notes, previous reasoning,
predictions and aggregate summaries. The actual round clock remains available.
Rust learning, the current plan and consequences of earlier actions persist.
This removes a specified planner-information package, not every form of memory.

All seven plans are authored in advance: keep the default, force direct aim,
force leading, move closer, stay farther away, shorten the lead prediction, or
lengthen it. Health, weapon damage, movement speed, cooldowns and visibility are
fixed. The agent cannot generate code, invent maneuvers, edit rewards or run
extra simulated probes. Model weights are not trained. Every fight still uses
Rust's normal choice, feedback and commit operations.

Stable histories sample a 90/10 mixture of two opponent behaviors. Recurring
histories change to 10/90 at a keyed round in 6–8, then return in 17–19. The agent
receives no scenario IDs, seeds, hidden labels, switch schedule, future outcomes,
other branches or counterfactual tables. Calibration and evaluation use separate
random streams; model repetitions share each evaluation schedule.

Before evaluation, all seven fixed plans run through both histories in two
separately keyed calibration repetitions per case. Mean NPC damage, weighting
histories and repetitions equally, selects one plan per case; catalog order
breaks ties. The same winner is then used for both evaluation histories. Those
extra calibration fights are disclosed rather than hidden in the agent budget.

## Cost and execution

There are **1,384 calibration fights** and **788 evaluation fights**. Evaluation
contains twenty shared warm-ups and 768 post-warm-up fights. Calibration makes
no model requests.

| Planner requests | Count | CLI-reported cost |
| --- | ---: | ---: |
| Shared initial decisions | 8 | $0.1489376 |
| Subsequent full-history reviews | 184 | $4.8880916 |
| Subsequent latest-fight reviews | 184 | $1.4490395 |
| Total | **376** | **$6.4860687** |

All requests used `claude-sonnet-5-5` at medium effort. Mean request latency was
4.900 seconds; p95 was 8.754 seconds. Simulation time paused during requests.
Each request used a fresh isolated CLI context with tools and local
customizations disabled. Model sampling used provider defaults; this experiment
does not compare deterministic and stochastic decoding.

Full-history review consumed more input and cost more than latest-fight review.
Its additional 184 reviews did not improve the average over holding its initial
selection. These are CLI-reported charges, not an independently reconciled bill.

## Inspect and reproduce

- [Recorded viewer](experiments/agentic-npc-ablation-v2-view.html): all eight
  branches per case/history, every plan and observation, and 64 first/final
  fight recordings selected for capture before results. Download and open the
  HTML locally; GitHub displays its source.
- [Complete results](experiments/agentic-npc-ablation-v2.results.json.gz),
  [summary](experiments/agentic-npc-ablation-v2.summary.json),
  [physical replay verification](experiments/agentic-npc-ablation-v2.verification.json),
  and [independent arithmetic check](experiments/agentic-npc-ablation-v2.arithmetic.json).
- [Frozen offline kit](../publication/inputs/releases/tactical-air-agentic-ablation-v2.tar.gz)
  and [validation record](releases/agentic-npc-ablation-v2.validation.json).

All 2,172 fights and 376 recorded decisions replay exactly, including policy
state, observations and captured frames. A clean extraction also regenerates
the standalone viewer byte for byte. The 42-file kit includes 41 content
checksums and 33 recorded source fingerprints. Its SHA-256 is
`944cec04e64fe70d087ed496354f8aa24c53f6908ca3aef15e5f88b6326e432c`.

Replay requires Node.js 24; the independent arithmetic check uses Python 3.
No model account or new model requests are needed:

```sh
mkdir agentic-v2-evidence
tar -xzf publication/inputs/releases/tactical-air-agentic-ablation-v2.tar.gz -C agentic-v2-evidence
cd agentic-v2-evidence
shasum -a 256 -c SHA256SUMS
npm run verify
python3 scripts/analyze-agentic-v2.py results.json summary.json
node scripts/replay-agentic-v2.mjs results.json regenerated-view.html
```

Replaying recorded outputs does not mean a fresh model run will make identical
choices. New live runs use the [protocol](experiments/agentic-npc-ablation-v2.protocol.json),
normal repository setup and an authenticated Claude CLI:

```sh
npm run compile:agentic
node scripts/evaluate-agentic-v2.mjs --out target/my-agentic-v2-run
```

The completed run was the third execution attempt. Two infrastructure failures
are preserved separately and excluded from completed-study totals:

| Attempt | Recorded fights | Requests | Outcome |
| --- | ---: | ---: | --- |
| [First](experiments/agentic-npc-ablation-v2.attempt-1.json.gz) | 1,700 | 4 failed before inference | CLI signed out; zero reported tokens and cost |
| [Second](experiments/agentic-npc-ablation-v2.attempt-2.json.gz) | 1,816 | 16 successful, 4 timed out | Permanent failure stop; $0.248518 known cost, four costs unknown |

Both stopped journals remain latched. Their [first](../publication/inputs/releases/tactical-air-agentic-ablation-v2-attempt-1.tar.gz)
and [second](../publication/inputs/releases/tactical-air-agentic-ablation-v2-attempt-2.tar.gz)
archives retain their original protocols and sources. Before attempt three,
the accounting cap was reduced from $12.80 to $12.15 to carry forward $0.248518
in known cost and $0.40 in unknown-cost allowances. No cases, schedules, prompts,
model settings, comparisons or planned request counts changed.

Across the three v2 attempts, known reported cost is $6.7345867. Adding the four
unknown-cost allowances gives $7.1345867 in admission accounting. Actual timeout
charges remain unknown, and in-flight charges can exceed a per-call allowance.

## What this changes

The [first pilot](agentic-npc-pilot-v1.md) showed that an agent could operate the
between-fight loop and improve on the original controller in its sampled runs.
This follow-up provides stronger controls: the extra review did not improve the
average over the agent's initial choice, and the calibrated fixed plan was much
stronger. V1 and v2 use different schedules and horizons; their absolute scores
are not a direct paired comparison.

The useful signal is that accumulated observations and notes can prevent some
reactive switching. The next development test should compare that behavior with
a simple minimum-evidence switching rule under the same information and action
menu. Separately, check whether the full seven-plan menu offers situations where
changing plans can beat a strong held plan; the original two-tactic admission
check did not establish that opportunity. Lock a candidate before testing new
worlds.

These results do not establish general superiority, a causal benefit from notes
alone, or new tactical creativity. Two familiar worlds and two nested model
repetitions support a development finding, not significance claims or unseen-world
generalization. The practical conclusion is to improve and test the decision
rule before paying for continuous review in a game.
