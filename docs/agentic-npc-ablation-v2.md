# What does repeated NPC review add?

The first agent pilot improved average NPC damage, but several successful runs
settled on one plan. This follow-up separates a good plan choice from the value
of reviewing later fights. It also tests continued access to the agent's fight
history and notes.

**Status: implemented; live comparison incomplete after two stopped attempts.** On October 26, the first
attempt stopped during initialization because the Claude CLI was signed out.
Four already-dispatched requests failed with zero reported input/output tokens
and zero reported cost. The three-failure stop latched and blocked further calls.
No completed agent comparison or new effectiveness claim comes from this attempt.

The record preserves 1,384 calibration fights and 316 evaluation/control fights,
all replayed exactly. These are infrastructure-attempt executions, separate from
the planned completed study. See the [attempt data](experiments/agentic-npc-ablation-v2.attempt-1.json.gz),
[verification](experiments/agentic-npc-ablation-v2.attempt-1.verification.json), and
[frozen offline kit](../publication/inputs/releases/tactical-air-agentic-ablation-v2-attempt-1.tar.gz).
The archive SHA-256 is
`739ae5ac958465b8517eafcd183a33306286d5ef62310e47b2bad5a482152d84`.
It contains 39 files, including 38 content checksums. That stopped journal remains latched.

The second attempt used a new output directory after authentication succeeded.
Sixteen model requests succeeded, then four concurrent requests hit their
90-second deadline. The failure limit stopped further requests. The record
contains 1,384 calibration and 432 evaluation/control fights, including the
partial agent trajectories. These 1,816 fights are another infrastructure
attempt, not a completed comparison. The successful requests reported
$0.248518; costs for the four timeouts are unknown. Counting each unknown at its
$0.10 reservation gives $0.648518 in admission accounting, not a final bill.

The [second attempt data](experiments/agentic-npc-ablation-v2.attempt-2.json.gz),
[offline verification](experiments/agentic-npc-ablation-v2.attempt-2.verification.json),
and [frozen kit](../publication/inputs/releases/tactical-air-agentic-ablation-v2-attempt-2.tar.gz)
preserve the successful decisions, failed-call fallbacks and exact run sources.
All 1,816 fights and twenty decisions reproduced exactly from a clean archive
extraction, including four fallback fights. The forty-file archive has 39
content checksums and SHA-256
`fcc5433dea308e91ead458d4e8843a4bd4bd347b8c4b0f13b4c8b3d11778b61e`.
See the [validation record](releases/agentic-npc-ablation-v2-attempt-2.validation.json).
Neither attempt is discarded or used to claim effectiveness. A further run must
use a new directory and disclose both restarts; neither stopped journal may be
reset to continue.

The current CLI runner checks authentication before creating an experiment.
That guard was added after the first attempt. Its wait was extended before the
second attempt because a successful authentication check took fourteen seconds.
A successful sign-in check did not prevent the later request timeouts. Each
archive preserves its actual runner; use it for historical verification.

This is development work on the same two ranger worlds. The schedules are new;
the worlds are familiar. The player remains the opponent. All adjustments are
to the enemy NPC's existing behavior menu.

## Comparisons

Each evaluation case starts with ten ordinary-learning fights. All branches
restore the same policy checkpoint and face the same sampled opponent schedule
for twenty-four further fights.

| Branch | What changes between fights |
| --- | --- |
| Algorithm | Rust updates tactic preferences; the default plan stays fixed |
| Calibrated fixed | One complete plan selected using separate calibration histories stays fixed |
| Held initial choice | The agent's first chosen plan stays fixed |
| Full history | The agent reviews every completed fight and its previous note |
| Latest fight | After common initialization, the agent sees only its latest completed fight and current plan |

There are two model repetitions. Each repetition makes one initial request from
the ten shared warm-up fights, then applies that same decision to the full,
latest-fight and held-initial branches. Their first physical fight and policy
update must match exactly. An initial failure uses baseline immediately.

From the second fight onward, the full and latest-fight branches make separate
requests using their own outcomes. Both omit policy scores, sample counts and
probabilities so those summaries cannot provide a second history channel. The
round clock remains correct in both. The latest-fight branch receives no older
rounds, note, reasoning, prediction or aggregate statistics. It still has the
current plan and the consequences of prior Rust learning. This is a test of
continued planner-history access, not removal of all memory.

The calibrated fixed plan is an informed static benchmark. Every plan runs
through both stable and recurring calibration histories in two separately
seeded repetitions. One winner per case is selected by mean NPC damage, with
equal weight for histories and repetitions and catalog order breaking ties.
That winner is frozen before evaluation and used in both evaluation histories.
Its extra simulation experience is counted separately; it does not have a
matched training budget with the agent.

## Protocol and accounting

The [frozen protocol](experiments/agentic-npc-ablation-v2.protocol.json) specifies
1,384 calibration fights, 788 evaluation fights and 376 unique model requests.
The common initial request is counted once despite serving three branches.
Model calls have a $12.80 accounting cap, at most four concurrent requests, no
repair calls and a persisted stop after three consecutive failures. Unknown
costs consume the per-call reservation. In-flight provider charges can exceed
their declared limit; reported costs are not an independently reconciled bill.

Requests run in round waves across every case, history and repetition. A stopped
run retains partial evidence and its original planned horizon; it cannot become
a shorter completed experiment after inspecting outcomes.

Stable histories use a sampled 90/10 mixture of two opponent behaviors. Recurring
histories change to 10/90 at a keyed round between six and eight, then return
between seventeen and nineteen. The agent receives no switch schedule, hidden
labels, scenario IDs, seeds or future observations. Tuning, allowed tactics,
combat rules and model configuration match the first pilot, except for the
declared planner-information change.

## Reading the result

Three contrasts answer different questions:

1. Full history minus calibrated fixed: does the review loop beat this informed
   static benchmark?
2. Full history minus its paired held initial choice: does continued review add
   value beyond that realized first decision?
3. Full history minus its paired latest-fight branch: does continued access to
   earlier observations and notes help after shared initialization?

All post-warm-up fights count, including exploration and failed-call fallbacks.
Model repetitions are averaged within each case/history, then cases receive
equal weight. Individual trajectories and harms remain visible. Two familiar
worlds do not support significance claims or unseen-world generalization.

The latest-fight comparison changes history and notes together. It cannot
attribute a gain specifically to note-taking, model reasoning, or Rust memory.
Holding a complete plan also does not necessarily hold its tactic: `baseline`,
`close` and `far` still use Rust to choose aim or lead each fight.

## Reproduce

For new live runs after the normal repository setup:

```sh
npm run compile:agentic
node scripts/evaluate-agentic-v2.mjs --out target/my-agentic-v2-run
node scripts/verify-agentic-v2.mjs target/my-agentic-v2-run/results.json
node scripts/replay-agentic-v2.mjs target/my-agentic-v2-run/results.json target/my-agentic-v2-run/view.html
```

Live requests use the authenticated Claude CLI through the existing isolated
provider adapter. Run `claude auth login` if signed out. `--resume` preserves completed requests and never resends an
unknown pending request. Historical replay uses recorded responses and makes
no new model calls; it does not promise identical regenerated model output.
