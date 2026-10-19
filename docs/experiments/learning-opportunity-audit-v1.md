# Learning opportunity audit

Separately specified diagnostic on the six completed screens. No main protocol or learner was changed. 3584 new fixed-action fights.

| Study | Enemy | Action-sensitive fights | Direction changes requiring a different optimum | Mean best–worst range |
|---|---|---:|---:|---:|
| individual-adaptation-v1 | vanguard | 32.8% | 7.8% | 4.41 HP |
| individual-adaptation-v1 | flanker | 53.1% | 17.2% | 8.06 HP |
| individual-adaptation-v1 | ranger | 26.6% | 0.0% | 3.28 HP |
| team-coordination-v1 | squad | 100.0% | 56.3% | 39.22 HP |
| situational-memory-v1 | ranger | 24.2% | 4.7% | 3.28 HP |
| return-memory-v1 | ranger | 41.4% | 3.1% | 5.34 HP |
| deception-stress-v1 | ranger | 36.7% | 0.0% | 5.25 HP |
| curriculum-budget-v1 | squad | 98.4% | 64.1% | 39.19 HP |

A different optimum is required only when the best-action sets for the two directions do not overlap. Ties are retained.

| Main comparison | Optimistic mean headroom over its comparator |
|---|---:|
| individual-adaptation-v1 | 2.58 HP |
| team-coordination-v1 | 15.47 HP |
| situational-memory-v1 | 0.98 HP |
| return-memory-v1 | 1.64 HP |
| deception-stress-v1 | 2.67 HP |
| curriculum-budget-v1 | 20.13 HP |

46080 fresh main-study combats agree exactly with their corresponding table entry, including physical outcomes and synthetic input fingerprints. These matches validate the counterfactual lookup; they do not create new independent observations.

- Post-hoc diagnostic on examined generators, with new counterfactual measurements.
- Optimal means best among this small authored tactic set for a particular fixed world/controller parameter realization.
- The table is an offline oracle and must not be presented as learned foresight.
- A direction reversal need not change the optimal tactic. Warm-start benefit or lack of baiting harm alone cannot establish strategy-specific recall or adversarial robustness.
- Do not discard insensitive cases or alter success thresholds after seeing the audit. Use findings to design a separately specified next benchmark.
