# Reward attribution experiment — v1

Protocol: [reward-attribution-v1.protocol.json](reward-attribution-v1.protocol.json). [Raw results](reward-attribution-v1.results.json) · [Summary](reward-attribution-v1.summary.json). Original [adaptation-v1 evidence](adaptation-v1.md) is retained unchanged.

**Decision: do-not-promote.** All five predeclared gates must pass to advance this candidate.

The candidate uses 50% individual damage credit and 50% team-average damage credit, retaining the original individual defeat penalty and observation gate. No combat rules, stats, player controls, legal tactics, Rust learning parameters or maps changed. This is an experiment-only host adapter; it is not enabled in the game.

Executed **5376 candidate encounters** across 32 matched policy seeds, plus **264 reference-replay encounters**. The complete replay matched the original seed exactly. Original comparison traces and all source hashes were verified before reuse; reused encounters are not new independent data.

## Advancement gates

| Gate | Measured difference, HP [95% interval] | Requirement | Pass |
| --- | --- | --- | --- |
| feint_vs_original | -0.66 [-1.08, -0.28] | Mean ≥ 3; lower bound > 0 | false |
| feint_continued_learning | -4.22 [-4.88, -3.56] | Mean ≥ 3; lower bound > 0 | false |
| reverse_vs_original | -4.55 [-5.91, -3.28] | Mean ≥ -3; lower bound ≥ -3 | false |
| reverse_continued_learning | 13.45 [11.34, 15.56] | Mean ≥ 6; lower bound > 0 | true |
| cover_damage | Max absolute late-round difference 0.00 | ≤ 1 | true |

Differences compare candidate online against original online, or candidate online against its own identically trained frozen branch. Reversal versus original is a noninferiority guard. Intervals resample paired per-seed means, not individual rounds. No gate or candidate weight was changed after measurement.

## Late-round effectiveness

| Player switch | Candidate online | Candidate frozen | Original online | Original frozen | Fixed | Random | Candidate − original | Candidate learning benefit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| reverse | 67.31 | 53.86 | 71.86 | 53.16 | 84.00 | 49.97 | -4.55 [-5.91, -3.28] | 13.45 [11.34, 15.56] |
| feint | 36.61 | 40.83 | 37.27 | 42.00 | 36.00 | 34.08 | -0.66 [-1.08, -0.28] | -4.22 [-4.88, -3.56] |
| cover | 72.00 | 72.00 | 72.00 | 72.00 | 72.00 | 72.00 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |

Higher damage measures enemy effectiveness, not player enjoyment. These are rounds 17–24 after the switch. Each reward rule trains its own policy for 24 clockwise rounds, so the candidate-versus-original effect includes changes during both training and adaptation.

## reverse: recovery and player outcomes

| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 54.84 | 52.88 | 56.06 | 53.25 |
| 5–8 | 59.81 | 50.06 | 62.06 | 50.53 |
| 9–12 | 64.59 | 54.66 | 69.09 | 55.22 |
| 13–16 | 64.13 | 52.59 | 67.97 | 53.53 |
| 17–20 | 67.50 | 54.09 | 72.28 | 52.97 |
| 21–24 | 67.13 | 53.63 | 71.44 | 53.34 |

Candidate late clear rate: 100.00%; player death rate: 0.00%; mean duration: 22.34s. Candidate minus fixed damage: -16.69 [-19.03, -14.44] HP.

| Tactic | Candidate probability after training | After switch |
| --- | ---: | ---: |
| vanguard/rush | 62.17% | 76.44% |
| vanguard/hold | 37.83% | 23.56% |
| flanker/flank_left | 73.76% | 26.09% |
| flanker/flank_right | 26.24% | 73.91% |
| ranger/aim | 11.91% | 29.23% |
| ranger/lead | 88.09% | 70.77% |

## feint: recovery and player outcomes

| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 39.28 | 40.41 | 41.06 | 41.44 |
| 5–8 | 37.78 | 39.75 | 39.09 | 40.59 |
| 9–12 | 36.00 | 40.59 | 37.50 | 41.72 |
| 13–16 | 36.19 | 39.94 | 37.50 | 41.16 |
| 17–20 | 35.81 | 40.78 | 36.56 | 42.47 |
| 21–24 | 37.41 | 40.88 | 37.97 | 41.53 |

Candidate late clear rate: 100.00%; player death rate: 0.00%; mean duration: 13.19s. Candidate minus fixed damage: 0.61 [-0.38, 1.69] HP.

| Tactic | Candidate probability after training | After switch |
| --- | ---: | ---: |
| vanguard/rush | 62.17% | 58.30% |
| vanguard/hold | 37.83% | 41.70% |
| flanker/flank_left | 73.76% | 52.93% |
| flanker/flank_right | 26.24% | 47.07% |
| ranger/aim | 11.91% | 37.50% |
| ranger/lead | 88.09% | 62.50% |

## cover: recovery and player outcomes

| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 72.00 | 72.00 | 72.00 | 72.00 |
| 5–8 | 72.00 | 72.00 | 72.00 | 72.00 |
| 9–12 | 72.00 | 72.00 | 72.00 | 72.00 |
| 13–16 | 72.00 | 72.00 | 72.00 | 72.00 |
| 17–20 | 72.00 | 72.00 | 72.00 | 72.00 |
| 21–24 | 72.00 | 72.00 | 72.00 | 72.00 |

Candidate late clear rate: 100.00%; player death rate: 0.00%; mean duration: 11.18s. Candidate minus fixed damage: 0.00 [0.00, 0.00] HP.

| Tactic | Candidate probability after training | After switch |
| --- | ---: | ---: |
| vanguard/rush | 62.17% | 51.08% |
| vanguard/hold | 37.83% | 48.92% |
| flanker/flank_left | 73.76% | 54.03% |
| flanker/flank_right | 26.24% | 45.97% |
| ranger/aim | 11.91% | 41.86% |
| ranger/lead | 88.09% | 58.14% |

## Reproduce and interpret

```sh
npm ci
npm run build:wasm
npm run compile:sim
node scripts/evaluate-rewards.mjs --out docs/experiments/reward-attribution-v1-replication
node scripts/verify-rewards.mjs docs/experiments/reward-attribution-v1-replication.results.json
```

The runner refuses to overwrite evidence. It verifies v1 sources and raw data, then replays one full original trial exactly before reusing the original baselines. Every candidate reward retains original reward, own/team damage, observation status and actual feedback acceptance. Every frozen round is checked for exact policy preservation.

- Only tactic sampling is seeded; one map and known scripted controllers
- Fixed baseline was selected on orbit/reverse/cover, not fresh held-out scenarios
- Rewards describe effectiveness, not fun; human experience is unmeasured
- Team-average credit is not a causal contribution estimator; it may dilute individual credit
- Intervals describe policy-seed variation, not people, maps or worlds; secondary analyses exploratory
- A favorable result permits a next playtest decision, not a broad public effectiveness claim
