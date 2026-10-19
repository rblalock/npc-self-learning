# What learns, and what does not

The core is a contextual bandit: it estimates an observed reward for each
`(role, context, action)` cell. Hosts define these identifiers and the legal
action mask. The crate has no combat rules, player-style classifier, counter
table, world access, network access or model API. It cannot change damage,
speed, health, visibility or an action's implementation.

The host chooses the reward. A positive outcome makes that action more likely
in that context; a negative outcome makes it less likely. Observed damage is
one possible signal, not a general measure of enjoyable or fair combat. Good
reward design and a human counterplay playtest remain separate work.

## Decision and update

For the allowed actions, choose with the mixture

`P(action) = (1 - exploration) × softmax(score / temperature) + exploration / allowed_count`.

The probability vector only contains allowed actions, in configuration order.
Baseline decisions use a uniform distribution and never train. Baseline mode
does not erase learned memory; `inspect` still shows the learned policy.

Feedback is consumed at most once and is queued until `commit`. Only observed,
adaptive feedback counts as a sample. Each observed decision should have one
causally attributable outcome; the host must not claim an outcome was observed
when it happened through a wall or outside its declared information boundary.
The `observed` flag is trusted host input, not a geometric proof.

At commit, each evidenced cell's target is its mean reward during that encounter.
For an evidence-bearing encounter:

1. `decayed = score × (1 - decay)` for every cell.
2. For cells with observations,
   `candidate = decayed + learning_rate × (mean_reward - decayed)`.
   For other cells, `candidate = decayed`.
3. Clamp the **combined** difference `candidate - score` to
   `[-max_update, max_update]`; keep the resulting score within `[-1,1]`.

One hundred samples of the same mean do not cause one hundred sequential
updates. Counts record the evidence volume, while the encounter determines the
update bound. An encounter containing only baseline, unobserved or unresolved
decisions does not update or decay any scores. Every commit clears unresolved
decisions, preventing late outcomes from crossing encounter boundaries.

Hosts can explicitly forget without inventing evidence: `age` accepts 1–100
steps at a clean encounter boundary. Each step moves scores toward zero by the
configured decay, capped by `max_update`. It preserves sample counts, encounter,
RNG and decision IDs. The arena uses one step after a scout round supplies no
usable report. Uniform and held-fixed evaluation hosts never invoke it.

Learning is not guaranteed to improve each encounter. Exploration deliberately
tries weaker actions; noisy rewards and changing opponents can reduce success.
Forgetting and continuing exploration permit recovery when counterplay changes,
but they do not guarantee fast recovery or an optimal policy.

## State and integration limits

- 1–32 roles, 1–32 actions per role, 1–64 contexts, at most 4,096 cells.
- Identifiers contain 1–64 ASCII letters, digits, `_` or `-`; duplicates reject.
- At most 1,024 unresolved decisions and 4,096 decisions per encounter.
- Rewards must be finite and between -1 and 1. Configuration bounds and unknown
  request fields are checked. JSON requests are limited to 2 MiB.
- Seeds and decision counters are exact JavaScript-safe integers. A snapshot's
  RNG state is a 16-digit hexadecimal string to preserve all bits through browser
  JSON. Sampling is deterministic for a given implementation, seed and request
  sequence; bit-identical floating math across arbitrary architectures is not
  promised.
- Snapshot and restore require a clean encounter boundary. Even consumed
  unobserved decisions require a commit before saving. Queued evidence is never
  silently dropped by snapshot/restore.
- Restore validates the version, exact existing configuration, all cell identities
  and ordering, score ranges, counters and evidence bounds before mutating state.
  Restoring into an already-used engine preserves its decision-ID high-water
  mark so stale feedback cannot attach to a newly reused ID. Restoring a fresh
  engine reproduces saved IDs and random state.
- Snapshots are not cryptographically authenticated. Validation rejects malformed
  or inconsistent data; a plausible forged history is still possible. Server
  authority and save authentication are outside this single-owner prototype.
- JSON is intended for tactical decisions and encounter boundaries, not every
  render frame. Engine instances do not share memory. Hosts must serialize access
  to each instance and keep reward attribution scoped to that instance.

## Reproduce the controlled experiment

```sh
cargo test -p tactical-air-core
cargo run --release -p tactical-air-core --example learning_benchmark -- 64 > learning-benchmark.json
```

The benchmark uses an external stochastic environment with two contexts and two
actions. The preferred action succeeds with probability 0.8, the other with 0.2;
the learner sees only the observed outcome. Paired adaptive and uniform-baseline
trials use 64 deterministic seeds and the same external random draw for each
encounter. Separate scenarios reverse the reward mapping from the outset and
switch it after 300 encounters. Results retain per-seed scores and the immediate
loss after a switch, so recovery is not confused with immediate perfect response.

The checked-in [64-seed result](../crates/tactical-air-core/benchmark-results.json)
records these mean success rates (not confidence bounds):

| Scenario and window | Adaptive | Uniform baseline |
|---|---:|---:|
| Stationary, final 100 encounters | 71.37% | 49.14% |
| Initially reversed mapping, final 100 | 71.20% | 49.02% |
| Counterplay switch, first 30 after change | 47.19% | 49.74% |
| Counterplay switch, final 100 | 71.19% | 49.02% |

The learned policy initially performs worse after the switch: 37 of 64 paired
seeds lose to baseline in that early window. Its prior knowledge has a cost when
the opponent changes. The later recovery is the relevant adaptation result,
not evidence of immediate or universally successful counterplay.

This tests algorithm behavior on supplied rewards. It does not establish that the
arena's rewards are well attributed, that the combat is fun, or that the learner
improves a human player's experience. Those require the separate simulation,
browser and human-play checks. This implementation is inspired by separating
constraints from optimization; it is not an Ink integration or a proof system.
