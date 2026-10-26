# Comparing NPC plan selectors with the same experience

The matched-experience development study is complete. Continuous agent review averaged **20.625 HP of NPC damage per evaluation fight**, versus **20.5** for the active algorithm and **20.375** for each held-first control. The gains were too small and too uneven to pass the frozen advancement gates. All five continuous-review checks failed; neither a held-agent candidate nor continued algorithmic selection earned further review.

**Stop this seven-plan development line and publish the result.** The prototype and its development findings, including unsuccessful agent interventions, provide enough evidence to publish. No candidate warrants fresh validation. The stopping rule excludes post-result prompt revisions, parameter sweeps, replacement attempts and additional runs merely to obtain a favorable result.

This is a conclusion about the tested selectors, seven authored plans and two familiar ranger worlds. Repeated model requests are nested within those worlds and reused opponent schedules. They do not create independent worlds or establish a general verdict about AI.

## Registered comparison

The [frozen protocol](experiments/agentic-npc-matched-v4.protocol.json) addresses an unequal-experience comparison in [v2](agentic-npc-ablation-v2.md): its fixed `far` benchmark had 1,384 calibration fights that the agent did not receive. V4 gives the agent and a deterministic algorithm the same public initial evidence, complete starting Rust checkpoint, plan permissions and subsequent encounter allowance. It uses the same two ranger worlds and exact stable and recurring evaluation schedules from v2.

Each world first reproduces its ten ordinary-learning warm-up fights. It then executes fourteen real survey fights: all seven plans in catalog order, followed by the reverse order. Survey opponents use a separate frozen 90/10 stream. These are sequential, committed fights with continued Rust learning, not counterfactual probes. Plan attempts and average order position are balanced; hidden opponent conditions and the evolving Rust state during each trial are not. Each plan gets only two survey attempts, so its observed performance remains noisy. Missing observations are retained without replacement or reroll.

Both selectors receive the same twenty-four public preparation records, the baseline current plan and an empty initial note. Every branch restores the complete post-survey Rust checkpoint, including its random-number state. The survey therefore changes initialization: earlier evaluation scores cannot substitute for these controls. During evaluation each active selector receives its own completed history, so their later evidence can differ. Opponent behavior can also respond to differing NPC behavior.

There are eight branches per world/history: ordinary Rust learning (`retained`), the prior calibrated `far` reference (`fixed`), an active algorithm (`algorithm`), its held-first control (`algorithm-initial`), two active-agent repetitions (`agent`) and their two paired held-first controls (`agent-initial`). Each branch gets twenty-four evaluation fights. A held control freezes the complete initial plan while ordinary Rust tactic learning continues; its first fight exactly matches its active selector. A held plan that permits automatic tactic choice may still select different aim/lead actions.

Stable histories use a 90/10 opponent mixture. Recurring histories reverse that mixture at a keyed round in 6–8 and return in 17–19. Neither selector receives the schedule, hidden opponent labels, seeds, world/history/arm IDs, internal policy cells, coordinates, other branches, audit tables or counterfactual probes. Both receive the same allowlisted observation fields, plan menu and true round clock. The agent also receives its own previous bounded note, up to 1,500 characters; the algorithm derives statistics from its own public records.

All seven plans remain authored choices: baseline, aim, lead, close, far, short-lead and long-lead. No health, damage, movement speed, cooldown, visibility, reward or ability changes are allowed. There is no generated combat code, tactic invention or model weight training. Every branch uses normal Rust choice, legal masks, feedback and commit operations.

## Algorithm and analysis

The algorithm weights observed damage by `2^(-age/12)`, where age is elapsed fights. Its initial choice uses the highest weighted mean. Later choices add `12 * sqrt(log(1 + N) / n)`, where `n` is the plan's sum of observation weights and `N` is that sum across all plans. Damage is capped at 100 HP for this calculation. Unobserved fights age earlier data but add no damage or effective count. Unobserved plans get exploration priority after initialization. Ties retain the current plan, then use catalog order; if all initial plans are unobserved, the current plan is retained.

The twelve-fight half-life and twelve-HP exploration scale are declared choices. There was no parameter sweep or extra tuning simulation. This is an explicit comparator, not a proven optimal algorithm. Requiring the agent to beat the algorithm's held-first control protects against a victory caused only by excessive algorithmic exploration.

All twenty-four evaluation fights count, including exploration. Agent repetitions are averaged within world/history, then the four cells receive equal weight. Cumulative performance also includes the fourteen shared survey fights: `(survey damage + evaluation damage) / 38`. The shared survey contributes to each branch's cumulative measure but is executed only once per world. Warm-ups are excluded from these damage means. Results are descriptive; no confidence intervals or p-values are claimed.

## Results

All values below are mean NPC damage in HP per fight. The final column includes the survey; the other columns cover evaluation only. Full precision, individual rounds, plans and paired contrasts remain in the [summary](experiments/agentic-npc-matched-v4.summary.json).

| Branch | Stable | Recurring | Overall evaluation | Overall including survey |
| --- | ---: | ---: | ---: | ---: |
| Continuous agent review | 21.875 | 19.375 | **20.625** | 17.605263 |
| Active algorithm | 20 | 21 | **20.5** | 17.526316 |
| Held agent first plan | 22 | 18.75 | **20.375** | 17.447368 |
| Held algorithm first plan | 22 | 18.75 | **20.375** | 17.447368 |
| Ordinary Rust learning | 14.5 | 16.25 | 15.375 | 14.289474 |
| Prior calibrated `far` reference | 25.25 | 25 | 25.125 | 20.447368 |

The primary continuous-agent contrasts are **+0.125 HP** over the active algorithm, **+0.25 HP** over the held algorithm and **+0.25 HP** over its own held-first plan. Continued algorithmic selection gains **+0.125 HP** over its held-first control. Held-agent minus held-algorithm is exactly **0 HP**.

The agent exceeds ordinary Rust learning by **5.25 HP**, but holding the initial plan already gains **5 HP**. The higher damage therefore does not establish the value of repeated review. The calibrated `far` reference exceeds the active agent by **4.5 HP**, with its additional **1,384 prior calibration fights** still disclosed. No new calibration was performed. Its v4 mean is **25.125 HP** from the changed post-survey initialization; the historical **25.625 HP** is not a direct v4 control.

| World / history | Agent, repetitions averaged | Active algorithm | Held agent / held algorithm | Ordinary learning | Prior `far` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 31001 / stable | 31.5 | 30 | 31.5 | 21 | 31.5 |
| 31001 / recurring | 19.5 | 16.5 | 19 | 13 | 19 |
| 31042 / stable | 12.25 | 10 | 12.5 | 8 | 19 |
| 31042 / recurring | 19.25 | 25.5 | 18.5 | 19.5 | 31 |

Both agent repetitions and the algorithm initially selected `far` in world 31001 and `lead` in world 31042. Their held controls consequently match. The active agent's **−6.25 HP** mean deficit to the active algorithm in world 31042's recurring history violates the one-HP cell harm limit, despite its positive aggregate difference. The algorithm also loses **1.5, 2.5 and 2.5 HP** to its held-first control in the other three cells, while gaining **7 HP** in that recurring cell.

| World / history | Agent repetition 1 | Agent repetition 2 | Paired held-first mean, each repetition |
| --- | ---: | ---: | ---: |
| 31001 / stable | 31.5 | 31.5 | 31.5 |
| 31001 / recurring | 19.5 | 19.5 | 19 |
| 31042 / stable | 12 | 12.5 | 12.5 |
| 31042 / recurring | 18.5 | 20 | 18.5 |

Averaging each repetition over the four cells, repetition 1 is **−0.125 HP** versus the active algorithm and **0 HP** versus either held control. Repetition 2 is **+0.375 HP** versus the active algorithm and **+0.5 HP** versus either held control. Holding the agent's first plan ties the held algorithm in both repetitions. No evaluation branch defeats the player or leaves the NPC alive; the measured differences concern damage, not a win-rate improvement.

## Predeclared gates and decision

Continuous review advances only if every engineering gate passes. These are practical development thresholds, not statistical tests or automatic game changes.

| Continuous-review check | Required | Observed | Result |
| --- | --- | --- | --- |
| Gain over active algorithm | At least +2 HP | +0.125 HP | Fail |
| Gain over held algorithm | At least +2 HP | +0.25 HP | Fail |
| Gain over paired held-agent | At least +1 HP | +0.25 HP | Fail |
| Positive in each repetition | All three contrasts strictly positive in each repetition, averaged over four cells | Repetition 1: −0.125, 0, 0 HP | Fail |
| Cell harm limit | No cell mean below −1 HP versus any of those controls | −6.25 HP versus active algorithm in 31042 / recurring | Fail |

After continuous review fails, a held-agent candidate requires at least +2 HP over held-algorithm, positive gain in each repetition and no cell below −1 HP. Its gain is zero overall and in each repetition: the gain and repetition checks fail, while the cell harm check passes. **The held-agent candidate does not advance.**

Continued algorithmic selection requires at least +1 HP over its own held-first plan and no cell below −1 HP. Its +0.125 HP aggregate gain and losses down to −2.5 HP fail both checks. **Algorithmic review does not earn further consideration.** No candidate passes, so this development line stops without consuming unfamiliar-world validation. The result does not change the playable game's controller.

## Execution, cost and provider boundary

The completed run on 26 October 2026 contains **816 physical executions**: **20 reproduced warm-ups + 28 survey fights + 768 evaluation fights**. There are no extra simulation probes, new calibration fights or algorithm-tuning fights. Reproduced warm-ups count toward execution workload and add no independent evidence. The prior 1,384 calibration fights are referenced, not rerun or added to v4's count.

All **192 logical agent requests succeeded**, with **zero failures, retries or unknown-cost records**. The recorded CLI-reported cost is **$6.9760712**. The run uses `claude-sonnet-5-5` at medium effort through CLI version `2.1.310`, with provider-default sampling and no exposed seed or temperature control. This does not test whether stochastic decoding is useful.

| Timing measure | Count | Mean | p95 |
| --- | ---: | ---: | ---: |
| Agent request lifecycle | 192 | 5,257.457526 ms | 8,294.921 ms |
| Algorithm selection function | 96 | 0.012151 ms | 0.018958 ms |

Agent timing includes observation serialization, isolated-directory setup, CLI version checking, process startup, the provider request, parsing and cleanup. Algorithm timing covers the selection function after observation construction, excluding simulation. These measure different execution boundaries on the recorded host, not a normalized backend inference-speed comparison. Simulation does not advance while awaiting a request.

Each request uses a fresh isolated CLI context with session persistence, tools, MCP servers, hooks, plugins, browser access and local customizations disabled. The recorded prompt, schema, arguments and allowlisted model identity are checked by the verifier. Reported web-search and web-fetch counters are zero; no permission denials are recorded. These controls and records support the intended no-tools boundary, but **provider identity, usage, cost, turn counts and tool-use telemetry are not independently authenticated**. Reported charges are not a reconciled invoice.

Every response reports **`numTurns: 2`**, despite the adapter requesting `--max-turns 1`. The experiment therefore counts **192 logical requests**, not 192 backend turns or a verified number of internal inference operations. It does not explain or independently verify the provider's turn accounting.

The durable journal retains the $12.80 admission-accounting cap, $0.10 in-flight reservations, maximum four concurrent requests, no retries and permanent stop after three consecutive failures. One registered output directory prevents a new folder from resetting the allowance. Unknown outcomes cannot be resent; failures retain the current plan and previous note. In-flight reported costs can exceed reservations, so admission accounting is not a guaranteed invoice ceiling. No failure fallback was needed in this run.

## Evidence and verification

- [Complete results](experiments/agentic-npc-matched-v4.results.json.gz), [summary](experiments/agentic-npc-matched-v4.summary.json), [physical replay verification](experiments/agentic-npc-matched-v4.verification.json) and [independent arithmetic check](experiments/agentic-npc-matched-v4.arithmetic.json).
- [Recorded viewer, presentation revision 2](experiments/agentic-npc-matched-v4-view-2.html).
- [Offline evidence kit](../publication/inputs/releases/tactical-air-agentic-matched-v4.tar.gz) and [kit validation record](releases/agentic-npc-matched-v4.validation.json).

The measured sources were frozen at commit `6fd07957f6cb45145b31ea74be1e7456c4bc305d` with **51 source hashes**. The physical verifier checks those hashes and the frozen protocol, and exactly replays all **816 fights**, **192 recorded agent decisions** and **96 algorithm decisions**, including observations and complete physical/Rust trajectories. Replay uses recorded model outputs and makes zero model calls; it is not an independent replication or regeneration of model responses. The separate Python arithmetic check agrees with counts, costs, means, paired contrasts and all advancement gates. The implementation test run passed **110 tests**.

The verifier's results SHA-256 (serialized JSON, excluding the file's final newline) is `3c3c764e984cd230994b8a90811bb6e162068c265d304c59fc31c3b37355c949`; the recorded protocol SHA-256 is `cd03d4f5b30450373256085ef9d8ea47639f3a059c843453d96394291136c9f9`.

The offline kit SHA-256 is `a4f030cc58e0c13874738bafdbef22e3c19e76e9e842ea515b1c702a272c7d75`. A clean extraction passed all **61 content checksums**, repeated the complete replay and arithmetic checks, and regenerated the viewer byte for byte. All **64 recordings / 8,161 frames** passed selection and endpoint scrubbing on desktop and mobile, with working play/pause, no horizontal overflow and no observed script errors.

The separately fingerprinted r2 viewer is a post-run presentation revision that fixes mobile layout and expands disclosure. The frozen original viewer and sources are retained. This revision changes neither the protocol, inputs, model requests, physical outcomes nor the study's conclusions. Earlier v1, v2 and v3 evidence remains unchanged.

These two familiar worlds and reused schedules support a bounded development decision. They do not establish unfamiliar-world effectiveness, arbitrary-game transfer, human enjoyment, invented tactics, model weight learning or superiority over all possible algorithms. More repetitions on these same worlds would not supply the missing independent population. Those limits remain part of the published result; they are not reasons to continue this unsuccessful development line.
