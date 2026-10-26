# Comparing NPC plan selectors with the same experience

This development study asks whether an agent can use a shared set of trial fights better than an algorithmic plan selector. The previous fixed-plan benchmark had 1,384 calibration fights that the agent did not receive. Its advantage was informative, but did not isolate the value of the selector at a matched experience budget.

The new comparison will give both selectors the same initial observations of all seven authored plans, the same starting Rust policy and the same subsequent encounter budget. Each then sees its own completed fights. Ordinary Rust learning continues. There are no hidden opponent labels, future schedules, simulation probes or changes to combat statistics.

## Stopping point for this research question

The existing evidence is already sufficient to report the prototype and its development findings, including unsuccessful agent interventions. More fights on the same two worlds do not create new independent worlds.

This is the final planned development comparison for the current seven-plan agent interface. The protocol will define practical gain and harm criteria before any new model requests. A candidate that passes earns a separately frozen test on unfamiliar worlds. A candidate that fails is reported as unsuccessful; there will be no automatic prompt revision, threshold sweep, replacement run or additional study merely to obtain a favorable result.

A successful fresh-world test could support effectiveness within the specified synthetic population. It would still not establish human enjoyment, arbitrary-game transfer, invented tactics, or model weight learning. Those are separate questions, not prerequisites for publishing this experiment.

## Status

Design and implementation in progress. No live v4 requests have been sent. Exact initialization, selectors, budgets and analysis will be recorded in a frozen protocol before execution. Results from earlier studies remain unchanged.

## Registered comparison

The [protocol](experiments/agentic-npc-matched-v4.protocol.json) uses the same two ranger worlds and the exact stable and recurring schedules from v2. Each world first reproduces its ten ordinary-learning warm-up fights. It then executes fourteen real fights: all seven plans in catalog order, followed by the reverse order. Survey opponents use a separate frozen 90/10 stream. Attempts and average order position are balanced; hidden opponent conditions are not. Missing observations receive no replacement.

Rust learning and its random-number state continue through this survey. Every subsequent branch starts from the complete resulting checkpoint and the same twenty-four public observations. The survey therefore changes initialization: previous evaluation damage numbers cannot substitute for the new controls.

There are eight branches per world/history: ordinary Rust learning, the prior calibrated `far` reference, an active algorithmic selector, its held-first control, two active-agent repetitions and their two held-first controls. Each branch gets twenty-four evaluation fights. A held control freezes the complete initial plan while ordinary Rust tactic learning continues. Its first fight must exactly match its active selector.

The algorithm weights past observed damage by `2^(-age/12)`, where age is elapsed fights. Its initial selection uses the highest weighted mean. Later selections add `12 * sqrt(log(1 + N) / n)`, where `n` is the plan's sum of observation weights and `N` is that sum across all plans. Damage is capped at 100 HP for this calculation. Unobserved plans get exploration priority after initialization. Ties retain the current plan, then use catalog order.

The twelve-fight half-life and twelve-HP exploration scale are declared choices. There is no parameter sweep or extra tuning simulation. This is an explicit comparator, not a claim to have found the best algorithm. Requiring an agent to beat the algorithm's held-first control protects against a victory caused only by excessive algorithmic exploration.

Both selectors receive the same observation fields and plan permissions. After initialization each sees its own completed history. Agent requests additionally carry its own previous bounded note; the algorithm may derive statistics from the same history. Neither receives internal policy cells, seeds, world labels, future schedules, audit tables or counterfactual probes. Opponent behavior can respond to differing NPC behavior.

## Budget and decision

The run allows 192 unique model requests, with no retries. The durable journal retains the $12.80 admission-accounting cap, $0.10 in-flight reservations and permanent failure stop. A registered output directory prevents a fresh folder from resetting the allowance. Reported costs can exceed reservations in flight; accounting is not a guaranteed invoice ceiling.

There are 816 physical executions: twenty reproduced warm-ups, twenty-eight new survey fights and 768 evaluation fights. The warm-ups reproduce existing trajectories and add no independent evidence. The old `far` selection still had 1,384 additional calibration fights, disclosed separately. There are no new calibration or tuning runs and no extra simulation probes.

Results will include all twenty-four evaluation rounds and cumulative performance across all thirty-eight post-warm-up fights, including the shared survey. Agent repetitions are averaged within world/history, then the four cells receive equal weight. Algorithm selection time is recorded separately from model latency and reported cost.

Continuous agent review advances only if all of these declared engineering gates pass:

- At least 2 HP more damage per evaluation fight than both active and held-first algorithmic control.
- At least 1 HP more than the agent's paired held-first control.
- All three contrasts positive within each model repetition, averaged over the four cells.
- No world/history average worse than any of those controls by more than 1 HP.

If continued review fails, a held-agent candidate requires at least 2 HP over held-algorithm, positive gain in each repetition and the same cell harm limit. Continued algorithmic selection requires at least 1 HP over its own held-first plan and the same harm limit before it merits further consideration. These are development gates, not statistical tests or automatic game changes.
