# Research program v1 verification

The verified flow is: frozen protocol and source → archived real Rust/Wasm choices → actual arena combat → observed feedback and memory → independently reconstructed choices/rewards → full combat replay → recorded browser playback.

## Measured evidence

| Protocol | Scored fights | Fully replayed | Independent choices |
| --- | ---: | ---: | ---: |
| Individual adaptation | 22,464 | 22,464 | 22,464 |
| Team coordination | 17,280 | 17,280 | 40,320 |
| Situational memory | 9,216 | 9,216 | 9,216 |
| Return memory | 9,216 | 9,216 | 9,216 |
| Deception stress | 9,216 | 9,216 | 9,216 |
| Curriculum budget | 4,608 | 4,608 | 13,824 |
| Opportunity audit | 3,584 | 3,584 | 7,680 |
| **Total** | **75,584** | **75,584** | **111,936** |

Each result has a neighboring `.verification.json` recording its SHA-256, replay count and exact-match status. The six main verifiers also check protocol hashes and independently recompute statistics. The audit additionally matches 46,080 existing main encounters to its fixed-action tables, including physical outcomes and input fingerprints. Those matches are not new measurements.

The baseline archive is SHA-256 `1d2a0b92c30c166394e143c2514004734f494e0263978aaeb57d7ce115cea346`; its archived Wasm is `3ad3f2a18b624d56e620fc3f32ea7cfbef382ce188e158b12cefffd38c2d8970`. All reported experiments use that archive. Current production assets are not asserted to have the same binary checksum.

## Correctness checks

Thirteen research tests cover isolated actors and feedback, unchanged original three-role combat, shared observation/reward rules, real legal joint choices, observable/sham contexts, geometry and reserved-family separation, restricted deterministic bot inputs, exact checkpoints, memory-only interventions, curriculum budgets, serial/worker identity and seed-level analysis. Two audit tests cover legal forced choices, deterministic outcomes and tied/disjoint optimum handling. Twenty-eight existing relevant tests and the TypeScript check also passed during implementation.

The independent verifier does not trust recorded feedback: it recomputes eligibility and reward from physical observations, reproduces legal choice requests, checks source/parent checkpoints and memory interventions, and confirms frozen cells do not change. Full re-execution then checks the physical simulation and complete trial structure. None of these checks proves that damage is a complete game-design objective or that a task demands adaptation; the separate opportunity audit addresses part of that limitation.

## Browser evidence

The fieldbook contains 35 recordings: twelve individual-role conditions, six team, six situation, four return, four deception and three curriculum. Export reconstructs 356 encounters from original checkpoints and checks each recorded row against the stored result. Frames are actual 60 Hz simulation states sampled for 10 Hz playback, not a separately animated reconstruction.

The revised presentation makes the practical threshold, failed improvement screens and weak deception test visible. Its individual aggregate is labeled as covering all three roles. The first display export remains preserved; the `view-2` export is the reviewed presentation. The presentation revision does not alter measured results.

## Reproduction

The [guide](research-program.md) provides commands, controls, interpretation and next steps. The packaged kit includes the full source-hash closure and archived runtime, raw records, protocols, verifiers, tests and offline viewer. The package builder verifies source identities, result verification records and viewer hashes before archiving. A separate clean-extraction validator checks all checksums, runs the fifteen new tests, reconstructs the first full seed in every study, checks the corresponding audit actions and requires byte-identical regenerated replay data and presentation. Package and validation records are stored in the repository's `docs/releases` directory.

None of the tested learning candidates is used in the playable game.
