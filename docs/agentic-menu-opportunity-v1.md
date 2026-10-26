# Is there room to improve on a fixed NPC plan?

Yes, in these two familiar worlds. A controller allowed to simulate every available plan before each fight averaged **29.5 HP of NPC damage**, compared with **25.625 HP** for holding `far`. The difference is **3.875 HP per fight**. This controller knows the current hidden scenario and can inspect counterfactual outcomes. It is a diagnostic of available opportunity, not a result achieved by the agent.

| Case and history | Ordinary plan | Held `far` | Privileged greedy | Greedy minus `far` |
|---|---:|---:|---:|---:|
| 31001, stable | 20 | 31.5 | 34 | +2.5 |
| 31001, recurring | 13.5 | 21 | 25 | +4 |
| 31042, stable | 7 | 16.5 | 19.5 | +3 |
| 31042, recurring | 21 | 33.5 | 39.5 | +6 |
| Equal average | 15.375 | 25.625 | 29.5 | +3.875 |

All values are damage per fight. `far` was the strongest of the seven held plans in every case/history. The initial `far` benchmark was selected during v2 calibration; checking all seven against these evaluation schedules is an additional, retrospective diagnostic.

## What was simulated

The audit starts from the recorded v2 warm-up checkpoints and uses the same 24-fight stable and recurring schedules. Every fight still uses the normal Rust choice, feedback and commit path. Holding a complete plan does not freeze Rust learning: plans that permit both aim and lead can change their learned tactic choice.

Three comparisons answer different questions:

1. **Seven held plans.** Run each complete plan through each history, maintaining its own resulting policy state.
2. **Alternatives at ordinary-learning states.** Before each fight on a baseline trajectory, restore the identical full policy state and RNG for each of seven independent probes. Then separately execute the baseline fight. Alternatives beat the `far` probe at **33 of 96 states**; the mean local advantage over `far`, including ties, is **4.75 HP**.
3. **A greedy trajectory.** At its own current state, simulate all seven next fights, select the plan with the most immediate damage, then separately execute and commit it. Ties use catalog order. Subsequent probes start from that trajectory's new state.

The sum of best next-fight outcomes at baseline states is not a realizable trajectory. Switching changes later learning. The greedy controller supplies an actual sequence of state transitions, but it only optimizes the next fight and is not a global optimum or an upper bound on every possible controller.

The audit also probes both A/B scenarios from each shared initial checkpoint. All states, plans, damage, tactics, policy changes and rejected alternatives remain in the record. No tables or privileged information are supplied to the live agent.

## Accounting and reproduction

The diagnostic charges **2,236 physical simulations**: 28 checkpoint probes, 672 held-plan fights, 672 baseline-state probes, 96 baseline commits, 672 greedy probes and 96 greedy commits. A selected probe is executed again as a committed fight and both executions count. The twenty warm-ups and 1,384 calibration fights are reused records, not new simulations. Tests and replay checks are additional verification work, excluded from the diagnostic's scored count.

Nine tests pass. Every recorded transition reproduces exactly, including restored RNG, selected actions, feedback, state changes and committed outcomes. The frozen kit passes a complete replay from a clean extraction without model credentials or dependency installation.

- [Full result record](experiments/agentic-menu-opportunity-v1.results.json.gz)
- [Summary](experiments/agentic-menu-opportunity-v1.summary.json) and [replay verification](experiments/agentic-menu-opportunity-v1.verification.json)
- [Offline source and evidence kit](../publication/inputs/releases/tactical-air-agentic-menu-opportunity-v1.tar.gz) and [clean-extraction checks](releases/agentic-menu-opportunity-v1.validation.json)

The frozen audit verifier currently requires **Node.js 24.22.0 on macOS arm64**, plus system `tar` for baseline extraction. Its equality checks include runtime metadata, so other platforms and Node patches are rejected before replay. This limitation belongs to this audit verifier, not the Rust game library.

From the extracted kit:

```sh
shasum -a 256 -c SHA256SUMS
node scripts/audit-agentic-menu-v1.mjs --verify results.json
```

Archive SHA-256: `3833341e2e27033fbdea9b19f3315062547496755372ca2a697d68819be3ee68`.

## What this changes about the research question

The agent has two gaps to close: finding a strong plan, and knowing when changing it helps. In v2, choosing the fixed `far` plan explains a larger available improvement than this greedy controller's additional switching advantage. Restraining changes may prevent losses, but the selector also needs to discover useful alternatives.

The [three-fight switching comparison](agentic-npc-switching-v3.md) tests restraint separately. Neither study establishes success on unfamiliar worlds. A future controller must be chosen and frozen before fresh validation, and a non-LLM comparator must receive the same observations and simulation access.
