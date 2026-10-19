# Synthetic lab verification

Story: generated player and world manifests drive actual combat and Rust/Wasm learning; retained outcomes reconstruct the same combat and appear in a controllable browser replay.

## Measured evidence

- `synthetic-population-v1`: 9,920 scored encounters. Independent replay checked all 29,760 policy choices, reconstructing rewards from recorded physical evidence. Full combat replay matched every encounter, including inputs and final probabilities. [Machine record](experiments/synthetic-population-v1.verification-full.json).
- `feint-interactions-v1`: all 96 diagnostic combats and the derived probability decomposition matched on re-execution. [Machine record](experiments/feint-interactions-v1.verification.json).
- The preselected viewer reconstructs 120 preceding/chosen encounters across all five conditions. These are additional verification replays, not new evidence or human sessions.
- All measured source and protocol fingerprints remain unchanged. The original arena/core remain unchanged. Presentation fixes use a separate renderer and view manifest, preserving the measured exporter's source.

## Automated checks

Ten new tests cover independent randomness, collision agreement with the actual simulator, disconnected/invalid maps, held-out split separation, balanced training allocation, visibility filtering, reaction delay, bounded commands, deterministic input replay, unchanged legacy combat, frozen memory, corrupted-evidence rejection and a known interaction's diagnostic attribution. Geometry-only checks of reserved maps do not execute reserved performance cases.

The 28 existing arena/SDK/study tests and nine existing experiment tests pass, as does TypeScript checking. Total: 47 JavaScript tests. No core algorithm changes were made.

## Browser flow

The replay is a self-contained static file. HTTP serves the file; embedded verified records drive the controls and canvas. There are no API, database, credential or external-asset dependencies. Browser QA covers the five conditions, play/pause, speed, timeline endpoints, frozen probabilities and fixed-policy selection. Desktop and narrow layouts are checked for overflow and runtime errors. The detailed browser record is stored beside the replay.

The first browser check caught two presentation defects: the fractional final simulation time could fall beyond the slider's last step, and fixed tactics displayed unused nominal learning probabilities. Renderer version 2 uses a normalized timeline reaching the exact terminal frame and displays fixed selection as 100%. These fixes change no combat or evidence.

## Scope

Exact re-execution checks reproducibility; it is not an independent simulator implementation. Sensor filtering and collision probes also have direct tests, and policy feedback is reconstructed through a separate verification path. This validates the implementation and records within the specified simulator. Human realism, fun, arbitrary-map generalization, courier learning and production engine integrations remain unmeasured here.
