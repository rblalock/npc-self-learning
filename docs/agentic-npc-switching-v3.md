# Giving an NPC plan three fights before switching

The previous agent study found frequent plan changes without an average benefit over holding the first choice. This follow-up tests one execution rule: after entering a plan, an NPC must finish three observable fights with it before another change can take effect.

The completed comparison used **788 physical fights and 376 successful model requests**. The three-fight gate averaged **16.5 HP of NPC damage per fight**, compared with **16.8125** for immediate review and **17.0** for holding the agent's initial choice. Applied switches fell from **29 to 20**, but damage did not improve. The gate is not promoted to the playable game.

Inspect the [64-recording viewer](experiments/agentic-npc-switching-v3-view.html), [frozen protocol](experiments/agentic-npc-switching-v3.protocol.json), or [offline evidence kit](../publication/inputs/releases/tactical-air-agentic-switching-v3.tar.gz).

## Results

Means include every post-warm-up fight, including exploration. Higher damage favors the NPC.

| History | Ordinary Rust | Prior fixed `far` | Hold initial | Immediate review | Three-fight gate |
|---|---:|---:|---:|---:|---:|
| Stable | 13.5 | 24 | 17.75 | 17.5 | 17.375 |
| Recurring | 17.25 | 27.25 | 16.25 | 16.125 | 15.625 |
| Equal average | 15.375 | 25.625 | 17 | 16.8125 | 16.5 |

The primary gated-minus-immediate difference is **−0.3125 HP per fight**: −0.125 on stable histories and −0.5 on recurring histories. Gated review also trails the held initial plan by **0.5 HP** and the prior calibrated fixed plan by **9.125 HP**. Both reviewing arms remain below their held-initial average. Gated review exceeds ordinary Rust learning on stable histories (+3.875), but loses on recurring histories (−1.625).

The gate beats immediate review in two paired trajectories, ties three and loses three. These eight trajectories are nested repetitions of two familiar worlds, not eight independent worlds.

| Case / history / repetition | Hold initial | Immediate | Gated | Gated minus immediate |
|---|---:|---:|---:|---:|
| 31001 / stable / 1 | 23 | 23 | 23 | 0 |
| 31001 / stable / 2 | 23 | 23 | 23 | 0 |
| 31001 / recurring / 1 | 14 | 14.5 | 16 | +1.5 |
| 31001 / recurring / 2 | 14 | 14 | 15.5 | +1.5 |
| 31042 / stable / 1 | 12.5 | 12 | 12 | 0 |
| 31042 / stable / 2 | 12.5 | 12 | 11.5 | −0.5 |
| 31042 / recurring / 1 | 18.5 | 18 | 15.5 | −2.5 |
| 31042 / recurring / 2 | 18.5 | 18 | 15.5 | −2.5 |

## What happened between fights

After initialization, immediate review proposes and applies **29 switches**. Gated review proposes **54**, applies **20**, and blocks **34**. Those are different branch histories; subtracting their proposal counts does not estimate what a particular blocked switch would have done.

Two examples, selected after the run, show the variation:

- On recurring case 31042, both gated repetitions use `close` in evaluation rounds 7–9 and deal 0/0/0 damage. The gate blocks requests to return to `lead` in rounds 8–9. Immediate review deals 24/24/24 in those rounds. Waiting does not itself distinguish a useful experiment from persisting with an unsuccessful plan.
- On recurring case 31001, gated repetition 2 uses `far` in rounds 19–24 and deals 180 total damage. That trajectory beats its paired immediate controller, but the gain does not carry across the other world.

All eight shared initial requests choose `lead`. Stable case 31001 keeps it throughout, with identical damage under held-initial, immediate and gated control. Continuing to ask for a plan adds no benefit in those trajectories.

No evaluation branch defeats the player or leaves the NPC alive. These measurements concern damage, not a demonstrated win-rate improvement. Model explanations remain claims made by the model, not independent evidence of its reasoning.

## What changed

Both active controllers ask the same model to review their own full fight history and previous note after every fight. They receive the same fields and seven authored NPC plans. One applies recommendations immediately. The other blocks a different recommendation until the NPC has completed three observed fights under its current plan.

An initial choice is shared by both controllers and a third branch that holds it throughout. The first fight and resulting Rust state must match. Warm-up fights do not count toward the three-fight requirement. Unobserved fights do not count either. Keeping a plan leaves its count intact; switching starts a new count. Blocked recommendations are discarded. Once eligible, the controller considers the next fresh recommendation.

This is a minimum-exposure rule. It does not test whether a plan is statistically worse, and it does not require a particular amount of damage before allowing a change.

## Comparison

The experiment reuses the two familiar ranger worlds, ten-fight warm-ups and realized schedules from [v2](agentic-npc-ablation-v2.md). Stable and recurring histories each have two model repetitions. Both active controllers use full history and notes; policy scores, hidden opponent labels, future schedules and other branches remain unavailable. Ordinary Rust tactic learning continues in every branch.

The primary measurement is gated minus unrestricted mean NPC damage over all 24 evaluation fights. Secondary measurements compare each with its paired held-initial plan, ordinary Rust learning and the previously calibrated fixed plan. The fixed plan received additional simulation experience in v2; this follow-up reuses that selection without charging those old fights as new work.

Every exploratory fight and failed-call fallback counts. Model repetitions are averaged within case/history before averaging cases equally. The tables and viewer retain all eight paired trajectories, proposed and applied changes, blocked proposals, defeats, survival, cost and latency. A reduction in switches alone is not a successful outcome.

## Reproducibility and scope

New requests use the audited provider isolation and durable request journal. There are no simulation probes available to the model, retries or generated combat code. Health, damage, speed, cooldowns and visibility are fixed. The admission cap is $12.80, with $0.10 reserved for each in-flight request; reported costs can overrun in flight. A permanent failure stop preserves incomplete runs.

The live command registers one durable run directory and takes an exclusive writer lock. A new output folder cannot reset the budget or failure stop. Replacement attempts require a separate accounting amendment; none are permitted automatically by this protocol.

The offline verifier reconstructs each observation, proposal, gate decision, fight and policy update from recorded model outputs. It does not regenerate identical model responses.

These are development results on familiar worlds and reused schedules. They cannot establish generalization, a benefit from model nondeterminism itself, or superiority over all algorithmic controllers. If restraint only matches holding the initial plan, the evidence supports avoiding losses, not a benefit from continuing adaptation.

The separate seven-plan opportunity audit uses privileged simulations to locate possible gains. Its counterfactual tables are never supplied to either agent and its simulation costs are reported separately.


## Requests, cost and verification

The run completed on the first attempt. All **376 unique requests succeeded**: eight shared initial requests and 184 subsequent requests for each active controller. There were no retries, failures, fallbacks or unknown costs. The 788 physical fights comprise twenty warm-ups and **768 post-warm-up evaluation fights**; the damage means exclude warm-ups. The prior 1,384 calibration fights are reused evidence and are not counted again.

Claude CLI reported **$9.9732408**, with mean request latency **5.758 seconds** and nearest-rank p95 **10.013 seconds**. The recorded model is `claude-sonnet-5-5`, medium effort. Simulation time pauses while requests run. Reported cost is provider telemetry, not an independently reconciled invoice.

The protocol and execution sources were frozen at commit `74200b1` before live requests. All 41 source fingerprints match. Seventy-seven focused tests pass, with 26 inherited journal/runner regressions also passing. All 788 fights, 376 decisions, observations, gate events and resulting policy states reproduce exactly. Independent Python arithmetic and a separate review agree with the summary. The viewer contains **64 recordings and 7,295 frames**; every recording is selectable and scrubs to both ends on desktop and 390px mobile, without horizontal overflow or observed script errors.

- [Complete results](experiments/agentic-npc-switching-v3.results.json.gz) and [summary](experiments/agentic-npc-switching-v3.summary.json)
- [Physical replay](experiments/agentic-npc-switching-v3.verification.json) and [independent arithmetic](experiments/agentic-npc-switching-v3.arithmetic.json)
- [Clean-extraction validation](releases/agentic-npc-switching-v3.validation.json)

The offline kit needs Node.js 24, Python 3 and system `tar`. It includes the frozen source, compiled simulation, Wasm, recorded requests and results. From its extracted directory:

```sh
shasum -a 256 -c SHA256SUMS
node scripts/verify-agentic-v3.mjs results.json
python3 scripts/analyze-agentic-v3.py results.json summary.json
node scripts/replay-agentic-v3.mjs results.json regenerated-view.html
```

Archive SHA-256: `bcd61a67681b0a999b792d16e4f2208a4a06ca5f452f173980b2ab581af8c642`.

## Takeaway and next test

This three-observation gate reduced applied switching without improving average damage. It is not a successful replacement for immediate review, and neither reviewing controller beats holding its first choice on average. That rejects this particular execution rule on these cases; it does not establish that every form of cautious review will fail.

The [seven-plan audit](agentic-menu-opportunity-v1.md) finds a separate opportunity: privileged greedy selection averages 29.5 HP, above the best held plan's 25.625. Its simulation access is unavailable to the agent. The larger measured gap for the agent remains finding a strong plan in the first place.

The next useful development comparison is plan selection under a matched experience budget: give an agent and a strong non-LLM selector the same observations, permitted actions and any simulation-query allowance. Charge exploration, keep held-initial and fixed controls, and measure the entire history. Select and freeze a candidate before testing unfamiliar worlds. Another threshold sweep on these two cases would remain development work, not validation.
