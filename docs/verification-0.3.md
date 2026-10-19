# Verification record — 0.3.0

The evidence, code paths and user interface are checked separately. Automated play is not human evidence.

## Experiments

- Historical archive checksum and original adaptation/reward evidence passed verification.
- Additive candidate: 5,376 encounters, 16,128 independently replayed decisions/feedback/commits, 32 matched seeds; one 264-encounter exact reference replay before measurement.
- Fresh scenarios: 11,760 encounters, 34,560 independently replayed learned/frozen policy decisions; all fixed calibration/comparison combat replays and six full scenario/rule trials matched (960 actual combat replays).
- The additive candidate failed both its development and fresh-scenario advancement criteria. Gameplay remains on the original individual reward. Raw protocols, results, source hashes and negative outcomes are retained.

## Implementation

- 20 Rust behavior tests and one FFI error-boundary test passed.
- 28 browser-host/headless tests passed, including actual combat/Wasm, controls, snapshots, scout information flow, missions, legacy studies, and the new fixed-baseline study.
- Six additive-adapter tests and three scenario tests passed, including identity behavior, observation gates, exact frozen branches, and serial/worker equivalence.
- TypeScript checking and the production build passed for both the game and the dedicated playtest page.
- A real C caller linked the macOS arm64 shared library and passed mask, feedback, commit, snapshot/replay, errors, and ownership checks.

## Browser study QA

Production-browser automation completed both adaptive-first and fixed-first orders: two warm-up rounds plus 24 condition rounds each, both questionnaires, and the final reveal. Condition data stayed concealed until the second questionnaire was submitted. The source fingerprint is stored in each export under `docs/qa`.

Manual input checks in the browser confirmed right/up movement, no movement while paused, and no re-latching of a held key from repeat events after resume. The headless regression also verifies screen-relative controls across rounds and demo-style changes.

`scripts/analyze-playtests.mjs` reports **zero included human sessions** from those two files and lists their automated/nonmanual exclusions. Their responses and ratings are test inputs. A third partial-session browser check verified focus-loss pause, End & export, a real JSON download, recovery storage, and incomplete-session exclusion.

## Release scope

The release includes standalone Rust/browser guard examples, a typed npm tarball with Wasm, a source archive and a macOS arm64 native archive. Each artifact has a SHA-256 checksum. Clean extraction/installation, independent browser-host behavior and microsite link/layout verification are recorded in the release-validation JSON generated during packaging. The checks cover artifact integrity and installation; they do not establish effectiveness in another game.

The performance report uses a single role, two actions and one context, with 30 measured batches after five warm-ups. It reports batch-mean cycle costs, not individual-call tail latency. It includes JSON transport for Node/Wasm, excludes rendering/combat/startup, and is not a cross-platform guarantee.

No Windows, Linux, mobile, console, Unity, Godot or Unreal validation is claimed. No third-party game integration or human-enjoyment result is claimed.
