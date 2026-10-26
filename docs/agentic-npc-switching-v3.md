# Giving an NPC plan three fights before switching

The previous agent study found frequent plan changes without an average benefit over holding the first choice. This follow-up tests one execution rule: after entering a plan, an NPC must finish three observable fights with it before another change can take effect.

The [frozen protocol](experiments/agentic-npc-switching-v3.protocol.json) specifies 788 fights and at most 376 model requests. Results will be added after the run and offline verification. The playable game's controller is unchanged.

## What changes

Both active controllers ask the same model to review their own full fight history and previous note after every fight. They receive the same fields and seven authored NPC plans. One applies recommendations immediately. The other blocks a different recommendation until the NPC has completed three observed fights under its current plan.

An initial choice is shared by both controllers and a third branch that holds it throughout. The first fight and resulting Rust state must match. Warm-up fights do not count toward the three-fight requirement. Unobserved fights do not count either. Keeping a plan leaves its count intact; switching starts a new count. Blocked recommendations are discarded. Once eligible, the controller considers the next fresh recommendation.

This is a minimum-exposure rule. It does not test whether a plan is statistically worse, and it does not require a particular amount of damage before allowing a change.

## Comparison

The experiment reuses the two familiar ranger worlds, ten-fight warm-ups and realized schedules from [v2](agentic-npc-ablation-v2.md). Stable and recurring histories each have two model repetitions. Both active controllers use full history and notes; policy scores, hidden opponent labels, future schedules and other branches remain unavailable. Ordinary Rust tactic learning continues in every branch.

The primary measurement is gated minus unrestricted mean NPC damage over all 24 evaluation fights. Secondary measurements compare each with its paired held-initial plan, ordinary Rust learning and the previously calibrated fixed plan. The fixed plan received additional simulation experience in v2; this follow-up reuses that selection without charging those old fights as new work.

Every exploratory fight and failed-call fallback counts. Model repetitions are averaged within case/history before averaging cases equally. All eight paired trajectories, proposed and applied changes, blocked proposals, defeats, survival, cost and latency will be reported. A reduction in switches alone is not a successful outcome.

## Reproducibility and scope

New requests use the audited provider isolation and durable request journal. There are no simulation probes available to the model, retries or generated combat code. Health, damage, speed, cooldowns and visibility are fixed. The admission cap is $12.80, with $0.10 reserved for each in-flight request; reported costs can overrun in flight. A permanent failure stop preserves incomplete runs.

The live command registers one durable run directory and takes an exclusive writer lock. A new output folder cannot reset the budget or failure stop. Replacement attempts require a separate accounting amendment; none are permitted automatically by this protocol.

The offline verifier reconstructs each observation, proposal, gate decision, fight and policy update from recorded model outputs. It does not regenerate identical model responses.

These are development results on familiar worlds and reused schedules. They cannot establish generalization, a benefit from model nondeterminism itself, or superiority over all algorithmic controllers. If restraint only matches holding the initial plan, the evidence supports avoiding losses, not a benefit from continuing adaptation.

The separate seven-plan opportunity audit uses privileged simulations to locate possible gains. Its counterfactual tables are never supplied to either agent and its simulation costs are reported separately.
