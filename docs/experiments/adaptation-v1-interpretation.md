# Adaptation v1: interpretation and next hypothesis

This analysis was written **after** inspecting [v1 results](adaptation-v1.md). It is exploratory. The original protocol, implementation and result files remain unchanged.

## What the experiment establishes

Continued learning recovers useful enemy effectiveness after the scripted player reverses its circling direction: +18.70 damage per encounter over the same trained policy frozen, with a paired 95% interval of [16.31, 21.09], in rounds 17–24 after the switch. Learning is affecting combat, and continued updates help in this case.

The strong fixed policy still deals 84 damage versus the online learner's 71.86. Against feints, updating lowers damage to 37.27 versus 42.00 with frozen preferences. Against cover every policy deals 72 damage, despite substantial changes in learned probabilities. We have not established that learning consistently outperforms a good authored policy.

The scripted player clears every late-window encounter in all conditions and all three switch fixtures. Damage differentiates some policies, but these fixtures do not demonstrate a change in win rate.

All of these are scripted, direct-observation measurements in one deterministic arena. The 32 seeds vary tactic sampling, not maps, spawns or human players. The primary comparison branches from identical trained memory and RNG. The selected fixed policy was chosen on the declared orbit/reverse/cover suite, including the primary evaluation controller; it is a strong in-suite baseline, not a held-out generalization test. Feint is outside that selection suite but was already a familiar fixture.

## Reward attribution: a concrete diagnostic

Grouping all 2,304 feint encounters across the online, frozen and uniform branches by joint tactic profile gives deterministic outcomes for each of the eight profiles. For example, holding the vanguard and ranger tactics fixed:

| Vanguard / flanker / ranger | Recorded encounters | Team damage | Flanker damage | Flanker reward | Vanguard damage |
| --- | ---: | ---: | ---: | ---: | ---: |
| rush / flank_left / lead | 739 | 48 | 12 | −0.025 | 24 |
| rush / flank_right / lead | 360 | 36 | 12 | −0.025 | 12 |
| hold / flank_left / lead | 362 | 36 | 12 | −0.025 | 12 |
| hold / flank_right / lead | 202 | 36 | 12 | −0.025 | 12 |

These counts describe existing traces; they are not independent worlds or a new randomized trial. All eight profiles give the flanker 12 damage and −0.025 reward. With a rushing vanguard, however, choosing the left flank adds 12 team damage through the vanguard. The current role-local reward does not credit that contribution. With a holding vanguard there is no such advantage: this is an interaction between roles.

During continued learning against feints, the mean probability of a left flank falls from 79.94% to 51.18%. The ranger's lead probability also falls from 89.77% to 66.70%, and rush from 67.13% to 63.88%. Consequently the flank observation is a specific plausible contributor, not a complete causal decomposition of the 4.73 HP regression. Changing probability is not synonymous with getting smarter.

The source is `adaptation-v1.results.json`: group `trials[*].branches.feint` rows by the three `recap[*].tactic` values; read each row's `damage` and per-role `recap` damage/reward. Before/after probabilities are in `summary.bySwitch.feint.policyShift.probabilities`.

## Next comparison

Hypothesis: rewarding a role for a useful contribution to team performance will preserve or learn effective combinations that its own hit count cannot identify.

Before implementation, define a new protocol comparing the current reward with one candidate contribution/team reward. Keep movement, damage, health, observations, legal tactics and learner settings fixed. Match policy seeds; train each rule honestly; branch each trained policy into continued and frozen updates. Keep selected-fixed and uniform baselines, all original fixtures, and the original negative results. Specify the feint improvement threshold and tolerated reversal regression before running the candidate. Reuse of these fixtures is development evidence; reserve fresh scenarios for later evaluation.

Team reward alone is not assumed to solve coordination: it could add noisy credit, erase individual usefulness, or favor frustrating behavior. Measure the result. Follow with separately identified experiments on adaptation speed/exploration and scenario variation if the data warrants them. No candidate reward has been implemented or measured in v1.

## What this means for a demonstration

The honest current demonstration is direction reversal: watch learning recover from an initially harmful habit, inspect the probabilities, and compare the same trained enemy with learning paused. Show the aggregate fixed-policy comparison alongside it. Feints and cover remain accessible examples of limits.

Human evidence is still needed for the intended experience: noticing a learned tendency, deliberately exploiting it, and wanting another round. Enemy damage, comprehension, fairness and enjoyment remain separate outcomes. The [research questions](../roadmap.md) distinguish these outcomes from combat effectiveness.
