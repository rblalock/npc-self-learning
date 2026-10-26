# An agent reviews the NPCs between rounds

This experiment adds an AI agent to the enemy NPC improvement loop. The player
remains the opponent. The agent reviews completed fights and chooses how the
ranger should behave in the next fight. The existing Rust learner continues
updating its tactic preferences throughout.

## What happened

The agent-assisted NPC dealt more damage on average in this pilot. Across the
two familiar ranger cases, it added **5.63 HP per fight in stable histories** and
**5.44 HP in recurring histories** compared with ordinary algorithmic learning.
It also exceeded the declared statistical planner's average in both histories.
This is a small development result, not a validated superiority claim.

Mean NPC damage per post-warm-up fight:

| Opponent history | Algorithm | Statistical | Random | Agent | Agent minus algorithm |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stable mixture | 14.25 | 16.50 | 15.00 | 19.88 | +5.63 |
| Change and return | 14.25 | 14.63 | 14.25 | 19.69 | +5.44 |

Each case receives equal weight; the two agent repetitions are averaged within
each case. Warm-up fights are excluded from these means. Every subsequent fight
counts, including exploratory choices. The full experiment contains **340
scored physical fights**: twenty shared warm-ups and 320 comparison fights.

The aggregate hides some useful differences:

| Case / history | Algorithm | Statistical | Random | Agent run 1 | Agent run 2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 31001 / stable | 18.00 | 19.50 | 12.75 | 24.00 | 24.00 |
| 31001 / change and return | 9.00 | 11.25 | 9.00 | 15.75 | 15.75 |
| 31042 / stable | 10.50 | 13.50 | 17.25 | 18.00 | 13.50 |
| 31042 / change and return | 19.50 | 18.00 | 19.50 | 21.75 | 25.50 |

In case 31001's stable history, both agent runs selected leading after warm-up
and kept it for all sixteen fights. This improvement required no further plan
adjustment. In its recurring history, both runs shortened the prediction after
two zero-damage fights, then returned to normal leading after the opponent
changed back. These trajectories show the review-and-adjust loop working; they
do not measure its advantage over a well-chosen fixed plan.

Case 31042 exposed model variability. The stable-history runs produced 18.00
and 13.50 HP per fight, and their average fell below the random planner's 17.25.
The stronger recurring run selected a greater engagement distance from round
five onward and retained it through the return. A useful static setting could
explain much of that gain. Neither NPC survival nor player defeats improved:
both were zero in every post-warm-up branch. The positive finding is damage.

All **128 live decisions succeeded**, using `claude-sonnet-5-5` at medium effort.
The CLI reported **$2.9748312** for the scored pilot, with mean latency **4.88
seconds** and p95 **6.79 seconds**. Simulation time paused during requests. This
is CLI-reported accounting, not an independently reconciled bill; the separate
connection smoke test is not included in the study cost or outcomes.

The next study should compare continued agent review with a fixed plan selected
on separate development data, remove the agent's carried note/history in a
matched ablation, and test longer histories before locking a candidate for new
worlds. That separates a good initial choice from the value of repeated review
and remembered experience.

## Inspect the evidence

- [Recorded viewer](experiments/agentic-npc-pilot-v1-view.html): all case results,
  cumulative damage, every plan and explanation, and forty preselected fight
  recordings. Download and open the HTML locally; GitHub displays its source.
- [Complete results](experiments/agentic-npc-pilot-v1.results.json.gz),
  [summary](experiments/agentic-npc-pilot-v1.summary.json), and
  [replay verification](experiments/agentic-npc-pilot-v1.verification.json).
- [Frozen offline evidence kit](../publication/inputs/releases/tactical-air-agentic-pilot-v1.tar.gz)
  and [validation record](releases/agentic-npc-pilot-v1.validation.json).

All 340 physical fights and 128 recorded decisions reproduced exactly, including
policy updates, agent observations and captured frames. Replaying stored model
outputs does not show that fresh model requests would make the same choices.

## Design

Each of two previously studied ranger cases runs ten ordinary-learning fights.
The experiment saves one checkpoint, including learned scores, observations,
decision counters and random state. Every comparison starts from that exact
checkpoint and receives the same realized opponent schedule.

There are sixteen subsequent fights per branch. Stable histories keep the same
90/10 mixture of two opponent behaviors. Recurring histories begin with that
mixture, change to 10/90 at a case-seeded round between three and five, then return
at round twelve. These are sampled mixtures, not guaranteed counts. The agent
does not receive the schedule, scenario labels or future observations.

| Branch | Between-round control |
| --- | --- |
| Algorithm | Keep the original NPC behavior; Rust continues learning aim/lead preferences |
| Statistical | Sliding-window UCB chooses among the seven plans using observed NPC damage |
| Random | Sample uniformly from the same seven plans |
| Agent, two repetitions | A fresh model request reviews the branch's history and previous note, then selects one plan |

The seven plans retain the default behavior, force direct aim, force leading,
approach more closely, stay farther away, shorten leading, or lengthen leading.
All plans specify their complete settings. They change engagement distance,
prediction or tactic selection. Health, damage, movement speed, weapon cooldowns
and line of sight remain fixed. There are no generated scripts or extra simulated
fights available to the agent. Forced tactics still pass through Rust's ordinary
choice, feedback and commit operations.

The statistical comparator uses the same information and plan menu. Its index
uses the last sixteen observed rounds, damage capped at 100 and divided by 100,
and an exploration coefficient of 0.35. Untried plans are explored in declared
order. Only the baseline plan receives warm-up evidence. This is one declared
comparator, not a tuned benchmark for statistical planning.

## What the agent receives

Requests contain only completed observations: the selected NPC plan and tactic,
observed reward and NPC damage, NPC remaining health, fight duration, current
policy scores and probabilities, and a bounded note from the previous request.
Motion summaries use only samples observed through line of sight: mean speed,
stationary fraction, range and visibility time. Shot counts and hits describe the
NPC's own actions. Missing observations stay explicit.

Scenario identifiers, controller families, seeds, random state, hidden A/B labels,
counterfactual tables, replay frames and other branches are excluded. The viewer
can show evaluator information that was never given to the agent.

The provider adapter uses an existing authenticated Claude CLI installation. Each
request has a fresh temporary working directory, disabled tools and MCP servers,
disabled local customizations, an explicit system prompt, bounded output and a
deadline. It records the exact submitted prompt and schema, validated decision,
model identity, usage, latency and reported cost. It does not retain raw CLI
sessions, account details or unfiltered error output.

No model weights are trained. Learning occurs in Rust's preference state and the
agent's explicit history/note. Model sampling uses the CLI defaults; no exact
model-output reproducibility or controlled temperature comparison is claimed.

## Reproduction and further runs

Node.js 24 and the repository's normal setup are required for new runs:

```sh
npm ci
npm run prepare:publication
npm run test:agentic
npm run evaluate:agentic -- --out target/my-agentic-run
npm run verify:agentic -- target/my-agentic-run/results.json
node scripts/replay-agentic-v1.mjs target/my-agentic-run/results.json target/my-agentic-run/view.html
```

Live runs additionally require an authenticated Claude Code 2.1.310 or newer with
access to the protocol's model. They make paid or subscription-metered requests.
The frozen protocol permits 128 requests, with a $0.10 CLI budget per request and
a $12.80 accounting cap. Provider limits are checked between model calls and an
in-flight response may exceed a per-call limit. Missing cost reports are counted
conservatively for admission and remain unknown in the results.

Use `--resume` with the same output directory after interruption. Completed
requests are reused only if their observations match exactly. A pending request
whose outcome is unknown is not resent; it becomes a recorded fallback retaining
the previous plan and note. There are no automatic repair requests. Completed
results refuse overwrites. Source changes invalidate a resume.

To replay the published pilot, use its frozen evidence kit rather than replacing
its source fingerprints with those of a later checkout. The kit includes the
actual sources, compiled simulation, original Rust/Wasm evidence, model decisions,
measurements and viewer. Offline verification requires no model account or new
requests.

```sh
mkdir agentic-pilot-evidence
tar -xzf publication/inputs/releases/tactical-air-agentic-pilot-v1.tar.gz -C agentic-pilot-evidence
cd agentic-pilot-evidence
shasum -a 256 -c SHA256SUMS
npm run verify
```

The archive SHA-256 is
`d575f13df9fe07c107b341ff86a5c1396fd8b7fbf8844f3a811f792ee9bc6021`.
Its 32 files include a manifest with 31 content checksums.

After this run, a concurrency review found that an in-flight success could clear
the runner's three-failure stop and allow more requests. The current runner
latches that stop across branches; an offline regression test covers it. There
were no failed calls in the pilot, so its recorded outcomes are unaffected.
The archive retains the actual run's sources, including the earlier runner.
Use it for historical verification, and use the current checkout for new runs.

## Interpretation limits

The two cases are familiar development fixtures. Agent repetitions measure
variation on the same worlds, not additional independent worlds. All means are
descriptive; there is no p-value or confidence interval.

The expanded plan menu may contain a configuration that works well throughout a
history. Better damage therefore does not by itself demonstrate adaptation,
memory benefit or a better learning rule. Agent versus the original algorithm
measures the whole added planning package. Agent versus the statistical planner
compares selectors with the same choices, but does not isolate an internal
reasoning mechanism.

Do not use the old two-tactic action tables to compute regret for these new
distance and prediction settings. A later study needs a fixed-plan comparator
selected on separate development data, a memory ablation, longer histories and
unfamiliar scenarios before making stronger claims. Team coordination and human
enjoyment remain separate questions.

The [protocol](experiments/agentic-npc-pilot-v1.protocol.json) defines the scope,
budgets and failure behavior before model decisions are scored.
