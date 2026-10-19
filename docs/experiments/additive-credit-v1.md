# Additive teammate credit — v1

Protocol: [additive-credit-v1.protocol.json](additive-credit-v1.protocol.json). [Raw results](additive-credit-v1.results.json) · [Summary](additive-credit-v1.summary.json). Original [adaptation-v1 evidence](adaptation-v1.md) is retained unchanged.

**Decision: do-not-promote.** All five predeclared gates must pass to advance this candidate.

The candidate uses full individual damage credit plus a teammate-damage bonus, retaining the original individual defeat penalty and observation gate. No combat rules, stats, player controls, legal tactics, Rust learning parameters or maps changed. This is an experiment-only host adapter; it is not enabled in the game.

Executed **5376 candidate encounters** across 32 matched policy seeds, plus **264 reference-replay encounters**. The complete replay matched the original seed exactly. Original comparison traces and all source hashes were verified before reuse; reused encounters are not new independent data.

## Advancement gates

| Gate | Measured difference, HP [95% interval] | Requirement | Pass |
| --- | --- | --- | --- |
| feint_vs_original | 0.42 [0.14, 0.75] | Mean ≥ 3; lower bound > 0 | false |
| feint_continued_learning | -4.78 [-5.63, -3.94] | Mean ≥ 3; lower bound > 0 | false |
| reverse_vs_original | 0.89 [0.28, 1.73] | Mean ≥ -3; lower bound ≥ -3 | true |
| reverse_continued_learning | 19.22 [17.02, 21.56] | Mean ≥ 6; lower bound > 0 | true |
| cover_damage | Max absolute late-round difference 0.00 | ≤ 1 | true |

Differences compare candidate online against original online, or candidate online against its own identically trained frozen branch. Reversal versus original is a noninferiority guard. Intervals resample paired per-seed means, not individual rounds. No gate or candidate weight was changed after measurement.

## Late-round effectiveness

| Player switch | Candidate online | Candidate frozen | Original online | Original frozen | Fixed | Random | Candidate − original | Candidate learning benefit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| reverse | 72.75 | 53.53 | 71.86 | 53.16 | 84.00 | 49.97 | 0.89 [0.28, 1.73] | 19.22 [17.02, 21.56] |
| feint | 37.69 | 42.47 | 37.27 | 42.00 | 36.00 | 34.08 | 0.42 [0.14, 0.75] | -4.78 [-5.63, -3.94] |
| cover | 72.00 | 72.00 | 72.00 | 72.00 | 72.00 | 72.00 | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |

Higher damage measures enemy effectiveness, not player enjoyment. These are rounds 17–24 after the switch. Each reward rule trains its own policy for 24 clockwise rounds, so the candidate-versus-original effect includes changes during both training and adaptation.

## reverse: recovery and player outcomes

| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 55.31 | 53.06 | 56.06 | 53.25 |
| 5–8 | 62.34 | 50.91 | 62.06 | 50.53 |
| 9–12 | 69.19 | 55.78 | 69.09 | 55.22 |
| 13–16 | 68.72 | 53.72 | 67.97 | 53.53 |
| 17–20 | 72.66 | 52.69 | 72.28 | 52.97 |
| 21–24 | 72.84 | 54.38 | 71.44 | 53.34 |

Candidate late clear rate: 100.00%; player death rate: 0.00%; mean duration: 21.93s. Candidate minus fixed damage: -11.25 [-13.27, -9.33] HP.

| Tactic | Candidate probability after training | After switch |
| --- | ---: | ---: |
| vanguard/rush | 68.99% | 83.70% |
| vanguard/hold | 31.01% | 16.30% |
| flanker/flank_left | 82.45% | 18.32% |
| flanker/flank_right | 17.55% | 81.68% |
| ranger/aim | 10.69% | 18.52% |
| ranger/lead | 89.31% | 81.48% |

## feint: recovery and player outcomes

| Rounds | Candidate online | Candidate frozen | Original online | Original frozen |
| --- | ---: | ---: | ---: | ---: |
| 1–4 | 41.06 | 41.91 | 41.06 | 41.44 |
| 5–8 | 39.28 | 41.16 | 39.09 | 40.59 |
| 9–12 | 37.97 | 41.81 | 37.50 | 41.72 |
| 13–16 | 38.06 | 41.06 | 37.50 | 41.16 |
| 17–20 | 37.13 | 42.94 | 36.56 | 42.47 |
| 21–24 | 38.25 | 42.00 | 37.97 | 41.53 |

Candidate late clear rate: 100.00%; player death rate: 0.00%; mean duration: 13.18s. Candidate minus fixed damage: 1.69 [0.61, 2.77] HP.

| Tactic | Candidate probability after training | After switch |
| --- | ---: | ---: |
| vanguard/rush | 68.99% | 63.95% |
| vanguard/hold | 31.01% | 36.05% |
| flanker/flank_left | 82.45% | 54.08% |
| flanker/flank_right | 17.55% | 45.92% |
| ranger/aim | 10.69% | 31.73% |
| ranger/lead | 89.31% | 68.27% |

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
| vanguard/rush | 68.99% | 52.25% |
| vanguard/hold | 31.01% | 47.75% |
| flanker/flank_left | 82.45% | 69.19% |
| flanker/flank_right | 17.55% | 30.81% |
| ranger/aim | 10.69% | 34.66% |
| ranger/lead | 89.31% | 65.34% |

## Reproduce and interpret

```sh
npm ci
npm run build:wasm
npm run compile:sim
node scripts/evaluate-additive.mjs --out docs/experiments/additive-credit-v1-replication
node scripts/verify-additive.mjs docs/experiments/additive-credit-v1-replication.results.json
```

The runner refuses to overwrite evidence. It verifies v1 sources and raw data, then replays one full original trial exactly before reusing the original baselines. Every candidate reward retains original reward, own/team damage, observation status and actual feedback acceptance. Every frozen round is checked for exact policy preservation.

- Only tactic sampling is seeded; one map and known scripted controllers
- Fixed baseline was selected on orbit/reverse/cover, not fresh held-out scenarios
- Rewards describe effectiveness, not fun; human experience is unmeasured
- Team credit is not a causal contribution estimator; it may dilute individual credit
- Intervals describe policy-seed variation, not people, maps or worlds; secondary analyses exploratory
- A favorable result permits a next playtest decision, not a broad public effectiveness claim
