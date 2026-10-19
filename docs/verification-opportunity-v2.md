# Validated-opportunity verification

The verification follows the complete evidence path: predefined task admission → real Rust/Wasm choice → archived physical combat → observed feedback → independent policy and combat replay → regret/recovery analysis → inspectable browser recordings.

## Evidence boundaries

| Boundary | Verified evidence |
| --- | --- |
| Development | 4,608 legal fixed-action fights fully replayed; 8,704 independent policy decisions reconstructed. Embedded generator sources retain their original hashes. |
| Admission | Every one of 3,072 candidate pairs reconstructed; all 18,432 action-table fights replayed. All rejects retained. |
| Selection | First qualifying candidate for each group/seed reconstructed from the tables; 94 selected, two absent, no replacements. Selection file precedes learner runs. |
| Learning | All 27,648 train/control/test fights replayed; independent feedback, masks, commits, parent snapshots and cell-only reset checks pass. |
| Analysis | Complete summary recomputed; every learned action's physical outcome and input fingerprint matches its action-table entry. |
| Presentation | 35 preselected recordings reconstructed through 1,120 matching encounters; the first-seed vanguard admission failure remains visible. |

Reserved evidence SHA-256:

- Results: `f74e366e003d30897608b4f6a1aac5932f109777652fb2bbf728e71df9a400de`
- Admission tables: `ddbfe1c3955fc862721027e66926be96fd4799346f16cef9483f3f5b479510f9`

The main verification record contains **65,536 independent policy decisions** across the 46,080 reserved fights. Development is separate. The complete physical run uses 47,973,020 simulation steps; verification and presentation reconstructions are excluded from scored encounter counts.

## Tests and invariants

Eight new tests cover geometry and public context, tied optima and saturated/missing feedback, exact solo branches and resets, joint/product-probability regret, context capacity and frozen tests, censored recovery, independent seed analysis and worker identity. They passed before the reserved protocol was frozen. No measured implementation file or criterion changed after reserved outcomes.

All seven previous research/audit source manifests still match. The archived physical simulator and Wasm runtime remain the same historical evidence artifacts; this study does not claim byte identity with the separately built public game. No production learner or engine adapter was changed.

The browser viewer was checked across every group, phase and condition, including the unavailable preselected vanguard case. Scrubbing to the beginning, middle and end confirms final health and the recorded damage/regret relation. Controls remain usable at desktop and narrow widths. Playback renders stored states, not a second implementation of the combat rules. The reviewed `view-2` presentation labels the primary switch/terrain scope explicitly even while a secondary branch is selected.

## Package checks

The package builder verifies source identities, raw-result verification records and viewer hashes before copying the full dependency closure. It includes the archived Wasm/runtime, protocols, admission rejects, selections, raw learning records, development evidence, verifier, tests and offline viewer.

The clean-extraction validator checks every packaged checksum, runs the eight tests without dependency installation, independently replays all admission candidates for the first seed, and replays the first complete qualifying trial in every group. It then regenerates the viewer and requires byte-identical data and HTML. The separate package/validation manifests are stored under `docs/releases`.

See the [study guide](opportunity-lab-v2.md) for statistical limits, controls, findings and reproduction commands. Deterministic reproduction establishes consistency; it does not turn this selected challenge suite into an unbiased sample of human play.
