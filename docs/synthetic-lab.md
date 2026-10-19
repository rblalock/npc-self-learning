# Synthetic experiments

The lab generates opponents and encounter histories, runs the actual arena combat and Rust/Wasm policy, and preserves the resulting evidence. It needs Node.js 24 and the repository's immutable baseline archive. The headless commands need no LLM, API key, Rust rebuild, npm install, or game engine.

## First results

The [population screen](experiments/synthetic-population-v1.md) completed 9,920 encounters. Twelve independent replicate seeds covered four reserved behavior/map combinations. Both training arms received 48 encounters. The varied arm used circling, rushing, cover use and weaving; testing reserved bait-and-switch and reactive movement, with separate map families.

In the last four encounters of the switch phase:

| Comparison | Mean enemy damage difference | Paired 95% interval |
| --- | ---: | --- |
| Varied training, learning throughout the test history versus frozen after training | +3.71 HP | [2.15, 5.63] |
| Varied versus narrow training, both continuing to learn | +0.35 HP | [-0.42, 1.50] |
| Varied training with continued learning versus selected fixed tactics | +1.96 HP | [-1.63, 5.56] |

The varied-training candidate failed its predeclared meaningful-gain gate. It is not promoted. Continuing to learn helped relative to its own frozen checkpoint, but a larger variety of training encounters did not establish an advantage over the narrow training arm. The effect also varied by case. Player clear rate in this aggregate window was 82.3% for both varied online and varied frozen conditions: increased damage did not translate into a clear-rate improvement here.

The frozen checkpoint is taken **before the entire 36-encounter test history**, including its initial twelve repeat encounters. Therefore the +3.71 HP comparison measures the benefit of all continued learning during that history; it does not isolate updates made only after the direction switch. A new experiment should freeze a second branch exactly at the switch boundary.

The [feint diagnostic](experiments/feint-interactions-v1.md) adds 96 encounters across all eight joint tactic combinations, three controller styles and four existing worlds. It finds six matched action changes where team damage changes but the acting role's observed reward does not. On the original feint fixture, shifting flank-left to flank-right with a rushing vanguard costs 12 team HP while leaving flanker reward unchanged.

An exact outcome-table calculation attributes the predicted original feint decline to ranger preferences (-2.709 HP), flanker preferences (-2.183 HP) and vanguard preferences (-0.172 HP). These contributions sum to -5.065 HP under the probability model. This explains which preference changes matter; it does not establish why they occurred. The historical realized decline was -4.734 HP, which is a different quantity.

## Watch and reproduce

Open [the recorded comparison](experiments/synthetic-population-v1-view.html) directly in a browser. It is self-contained, with play/pause, speed, seeking, all five conditions, actual tactic probabilities and source fingerprints. Its seed, case and encounter were selected in the protocol before results. All five conditions happen to inflict 24 HP in this example; it is deliberately retained rather than replaced with a favorable clip. Combat duration and selected tactics differ.

```sh
npm run test:synthetic
npm run diagnose:feints -- --out target/feint-replication
npm run verify:feints -- target/feint-replication.results.json
npm run evaluate:synthetic -- --out target/population-replication
npm run verify:synthetic -- target/population-replication.results.json --full
npm run replay:synthetic -- --out target/recorded-comparison
```

Outputs refuse to overwrite prior evidence. Use a new prefix for a new run. Verification can be repeated against the same result. The default verifier replays every policy decision and one complete population seed plus all calibration combat; `--full` replays all 9,920 encounters. The checked-in verification used `--full`.

Choose any saved case without searching for a favorable outcome:

```sh
npm run replay:synthetic -- --case reactive/offset-islands --seed 3011 --round 24 --out target/reactive-example
```

The CLI accepts `--results PATH` for a replication result. Round is 1–36 across repeat, switch and return phases. Replay exports reconstruct all preceding rounds from the stored training checkpoint, compare every row against the evidence, then record the chosen encounter at 10 frames per second from the 60-step simulation. They are verification replays and are not counted as new experimental encounters.

## Boundaries

| Component | Responsibility |
| --- | --- |
| `scripts/synthetic/players.mjs` | Six parameterized controllers; reaction delay, cadence, aim error, hesitation, speed, route scale, switch period |
| `scripts/synthetic/geometry.mjs` | Collision-compatible line checks, routing, radius clearance and connected walkable-grid validation |
| `scripts/synthetic/scenarios.mjs` | Deterministic map/spawn generation, split definitions, training and repeat/switch/return schedules |
| `scripts/synthetic/runner.mjs` | Actual archived combat, Rust policy, checkpoints, input hashes, physical evidence and replay frames |
| `scripts/synthetic/diagnostic.mjs` | Complete tactic tables, matched credit comparisons and role-probability decomposition |
| `scripts/synthetic/analysis.mjs` | Seed-paired uncertainty, phase windows, all cases and predeclared gates |
| `scripts/synthetic/verify.mjs` | Independent Wasm choice/feedback replay, raw-evidence reward reconstruction and full-combat verification |
| `scripts/replay-synthetic-view.mjs` | Current viewer over the immutable measured exporter; presentation has a separate fingerprint |

Synthetic players receive self state, line-of-sight enemy positions and visible attack telegraphs, nearby visible hostile bullets, and public geometry. Their input records never contain enemy tactic IDs, scores, probabilities, hidden positions, or policy RNG state. Different branches share counter-based noise indexed by decision tick; a shorter encounter cannot shift another branch's random draws.

Geometry is validated before combat. Invalid attempts retain rejection reasons; valid defeats and weak outcomes are retained. The map validator checks a finite navigation grid and unit clearance, not every conceivable continuous trajectory. Dynamic goals inside cover are projected onto free navigation cells. All actual movement and hits still use the original simulator.

The learner remains three independent roles with two authored tactics each and one shared context. This lab measures that limitation; it does not silently add context, coordinated decisions, new rewards or stronger enemy stats. Synthetic bots are not calibrated models of people. Scouts and courier learning are outside this protocol.

## Scientific decisions

1. Keep the original game policy and reward. The varied-training advantage is unproven.
2. Treat these now-examined families as development/regression cases. New confirmatory claims require a fresh reserved family split.
3. Next isolate post-switch learning by branching a frozen copy at the exact switch boundary. This distinguishes recovery from benefits learned during the preceding repeat phase.
4. Then test one retention mechanism, such as a predeclared automatic-decay ablation, before trying coordinated tactic selection. Keep credit and representation changes separate where possible.
5. Add failure-focused curricula only after the random-population comparison and mechanism behavior are understood. Count selection simulations as part of the curriculum budget.
6. Measure human comprehension, counterplay, fairness and enjoyment separately; no participant results have been collected.

This run matches training **encounters**, not compute: narrow training used 658,827 simulation steps and varied training 581,635. The full population measurement took 23.53 seconds on this machine with four workers; this is a run record, not a portable performance claim. All secondary comparisons are exploratory.

See [verification](verification-synthetic-v1.md), [population protocol](experiments/synthetic-population-v1.protocol.json), [diagnostic protocol](experiments/feint-interactions-v1.protocol.json), and [research status](research-status.md).
