# Evidence ledger

Snapshot: 19 October 2026, through conservative-development-v1. Supports the [article](article.md) and [companion report](research-report.md).

## Claims and comparisons

| Claim | Exact scope and source | Scope and limitations |
| --- | --- | --- |
| The library learns bounded tactic preferences | [Learning contract](../learning.md), [integration](../integration.md), [repository boundaries](../../README.md) | Host-defined actions, observations and rewards. No invented tactics, autonomous player classifier or stat increases. |
| Ink inspired the separation of learning and fixed rules | [Ink adaptive learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/adaptive-learning.md), [Ink policy learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/policy-learning.md), README relationship section | Independent implementation. No claim of Ink code reuse, compiler/runtime integration or inherited formal guarantees. Current upstream docs are mutable; read on 18 October 2026. |
| Continued learning can help while losing to a fixed policy | [Adaptation v1](../experiments/adaptation-v1.md): +18.70 HP online minus frozen [16.31, 21.09]; online trails selected fixed by 12.14 [10.03, 14.53] | Original reversal fixture, late rounds 17–24, 32 policy seeds, one map. Intervals 95%. Fixed-policy selection enumerated all eight profiles on clockwise, counterclockwise and cover fixtures, including the later reversal behavior. The fixed policy already had calibration data for the reversal behavior; this comparison establishes no broad superiority of either approach. |
| Adaptation can hurt | Same report: feints online minus frozen −4.73 HP, equivalent loss interval [3.89, 5.58] | Original map and scripted feints. Later layouts changed the outcome. The result does not establish that feints always defeat learning. |
| Freeze timing changes the estimand | [Synthetic lab](../synthetic-lab.md): +3.71 [2.15, 5.63]; [boundary control](../experiments/switch-boundary-v1.md): +2.04 [0.33, 3.83] | Late-switch damage per encounter after varied pretraining. Different freeze boundaries; reused online outcomes, not independent replications. Boundary result misses the 3 HP practical gate. |
| Qualification checks for a real response change | [Opportunity guide](../opportunity-lab-v2.md), [audit](../experiments/opportunity-validation-v2.audit.json), [selection](../experiments/opportunity-validation-v2.selection.json) | 598/3,072 candidates; 94/96 group-seed combinations qualify. First qualifying index, no learner-based selection. Familiar controller families with fresh parameter/world seeds. |
| Solo adaptation helps on qualified tasks | [Opportunity summary](../experiments/opportunity-validation-v2.summary.json): vanguard +8.25 [4.75, 12.58], flanker +11.39 [6.21, 17.39], ranger +6.21 [4.15, 8.67] HP | All 32 B fights, online minus identical switch-frozen memory. n=15,16,16. Nominal 99.1667% paired percentile bootstraps, six primary comparisons. |
| Public terrain context helps | Same summary: flanker +3.23 [2.23, 4.36], ranger +4.00 [2.90, 5.35] HP versus pooled | Frozen evaluation after alternating terrain training. Public wall-area context. Shuffled-label, capacity-matched secondary controls also beaten. Unseen-layout transfer untested. |
| Joint squad choice did not meet its success criterion | Same summary: joint online minus own frozen +3.29 [−0.87, 8.95], primary 99.1667%; joint minus independent shared reward −3.85 [−6.23, −1.41], secondary 95% | Different representations and sampling distributions. This does not show coordination is useless or isolate its bottleneck. |
| Automatic forgetting failed | [Change-detection summary](../experiments/change-detection-v1.summary.json), [protocol](../experiments/change-detection-v1.protocol.json), [guide](../change-detection-lab-v1.md) | Six role/rule comparisons, n=16 per role. Changing means −0.30 to −0.92 HP; stable means all negative. Nominal 99.5833% intervals for six improvement and six stability tests. Only sample-size gates passed. |
| Detecting an alarm is insufficient | Same study: each rule alarms in 190/192 change windows; stable full reset 126/3,072, selective 113/3,072; 59/126 stable full-reset alarms follow increases | Operational proximity is not causal sensitivity. Rate cap is descriptive. Logs suggest mechanisms but do not isolate reset strength from detector design. |
| Baseline still adapts in noisy histories | Same summary: abrupt online minus frozen +3.50 [2.45, 4.78], +6.08 [4.23, 8.24], +6.70 [4.16, 9.59] HP | Three solo roles, 64-fight abrupt histories, exploratory 95% intervals. Deterministic physical outcomes conditional on A/B and chosen tactic; common sampled encounter schedule. |
| Fresh change-detection run reproduces exactly | [Verification](../experiments/change-detection-v1.verification.json), [clean extraction](../releases/change-detection-v1.validation.json) | 69,120 scored physical fights re-executed. Policy/feedback/detector checks also pass. Internal verification, not external replication or proof of realism. |
| Downloadable library exists | [Quick start](../releases/quickstart.md), [integration guide](../integration.md) | Experimental 0.3.0; Rust/Wasm/browser and macOS arm64 C ABI bundle. No npm/crates.io publication; no game-engine adapters or demonstrated third-party adoption. |
| Conservative interventions did not meet their success criteria | [Development guide](../conservative-intervention-v1.md), [summary](../experiments/conservative-development-v1.summary.json), [protocol](../experiments/conservative-development-v1.protocol.json) | All nine candidate/role changing means are negative. Separate batches pass stability gates but fail the 1 HP gain gate in every role. Known cases, descriptive 95% intervals, n=16 per role; no fresh validation. |
| Separate batches reduce intervention rate | Same summary: 0.93, 0.56, 0.71 interventions per 100 stable fights for vanguard, flanker, ranger | Longer histories than the preceding study. Compare candidates with controls within this screen. Non-overlapping recent batches share a reference; no independent-test claim. |
| New development reproduces | [Verification](../experiments/conservative-development-v1.verification.json), [arithmetic](../releases/conservative-development-v1.arithmetic.json) | 259,584 cached transitions, 192 table and 8,160 trajectory verification replays. Zero new scored physical fights. Separate Python arithmetic does not independently recompute bootstrap intervals. |

## Counting and uncertainty

The [research record](../research-status.md) reports 254,344 scored physical executions across 18 experiment, development and diagnostic records. That includes admission and training. It excludes reference/verification replays and reused outcomes. The count is a workload ledger, not the independent sample size or a count of players, maps or distinct tasks.

Change-detection-v1 adds 6,144 admission and 62,976 training/comparison fights. Its 14,432 cached development policy transitions add zero physical fights. That development pass already showed false alarms and harm; the unchanged declared rule ran on fresh seeds to characterize its failure. Opportunity-v2 adds 46,080 reserved fights plus 4,608 separately labeled development fights. Repeated observations are aggregated within seed before uncertainty estimation.

These are local engineering studies with protocols frozen before their reserved runs. They are not publicly preregistered, peer-reviewed or externally replicated studies. New parameter seeds from a familiar generator do not establish transfer to new controller families. Replaying a deterministic simulator verifies the record, not the generator's realism.

## Preserved artifacts

The latest research download is [tactical-air-conservative-lab-v1.tar.gz](../../target/releases/tactical-air-conservative-lab-v1.tar.gz). The [preceding change-detection kit](../../target/releases/tactical-air-change-detection-lab-v1.tar.gz) remains available. Both kits include their checksums. The library release and later research kits are separate artifacts.

| Artifact | SHA-256 |
| --- | --- |
| change-detection-v1.results.json | `4d72b2476e40e3399935ca4644742ca2d18ebef56d6d38096c99b83912e20049` |
| change-detection-v1.audit.json | `d5c3c699afabf23e6dc1ae460bb371e52cc1789b47f8896c0316f01cb19d2111` |
| tactical-air-change-detection-lab-v1.tar.gz | `1fec013f0b4154cfa4ef0ad92b81e59f1d1026a22d2cf8c837d09287c09b11f7` |

The additional conservative development record does not change the 254,344 physical-execution total. Its 259,584 cached transitions are reported separately. No candidate qualified for new reserved validation.

| Artifact | SHA-256 |
| --- | --- |
| conservative-development-v1.results.json | `ab352a9733cee3352d0108b381f37f97e8873e4921d50ed8f493ff40b4914de9` |
| tactical-air-conservative-lab-v1.tar.gz | `8db3e7d521cac4c7dd797682c22690b71f6b7e4e33d21e8f3506f5ce07c0ae0d` |
