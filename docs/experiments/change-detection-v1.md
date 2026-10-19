# Automatic change detection and forgetting

Can feedback-only change detection and selective forgetting improve individual adaptation without damaging stable performance?

69120 scored executions: 6144 admission fights and 62976 training/comparison fights.

| Role | Intervention | Seeds | Change-history gain, HP [99.583% interval] | False alarms / 100 stable fights | Gate |
|---|---|---:|---:|---:|---|
| solo-vanguard | detector-reset | 16 | -0.37 [-0.98, 0.11] | 6.05 | Do not advance |
| solo-vanguard | detector-selective | 16 | -0.30 [-0.84, 0.18] | 4.98 | Do not advance |
| solo-flanker | detector-reset | 16 | -0.48 [-1.00, -0.09] | 3.13 | Do not advance |
| solo-flanker | detector-selective | 16 | -0.43 [-0.97, 0.03] | 3.13 | Do not advance |
| solo-ranger | detector-reset | 16 | -0.92 [-1.96, -0.18] | 3.13 | Do not advance |
| solo-ranger | detector-selective | 16 | -0.69 [-1.52, -0.10] | 2.93 | Do not advance |

Six role-by-detector comparisons: mean damage difference against retained online, equally averaging all 64 rounds in each of the three changing histories within each seed. Advancement requires >=12 qualified seeds, >=1 HP mean gain, adjusted lower CI >0, adjusted stable-history lower CI >-0.5 HP, and <=1 observed false alarm per 100 stable fights. Twelve bootstrap intervals (six gains and six noninferiority checks) use nominal 99.5833% coverage, Bonferroni 0.05/12. This is an approximate small-sample engineering screen. Stable alarm cap is a descriptive gate, not a population rate confidence bound. All other comparisons exploratory. No production promotion.

Fresh parameter/world seeds for familiar authored controllers; deliberately action-sensitive pairs. Stochastic ordering of two deterministic conditional worlds creates stationary outcome noise. This is not human behavior, arbitrary maps, new behavior families, team coordination, or continuous within-fight adaptation. Eight reward slots per action is a heuristic engineering detector, not a calibrated statistical change-point test. Formal trials execute actual archived Rust/Wasm choices and archived combat physics; development may reuse validated outcome tables and is labeled separately.

The full summary retains all per-case histories, alarms, detection misses, censored recovery, cumulative regret and uncertainty. The reserved run is not tuning data for this version.
