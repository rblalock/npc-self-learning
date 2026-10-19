# Verification: exact switch control and retention

Story: a locked protocol generates paired histories → the archived combat and Rust/Wasm policy execute them → results preserve physical evidence and checkpoints → an independent core replay reconstructs rewards → full combat replay checks the complete result → the browser displays actual recorded frames.

## Evidence

| Boundary | Result |
| --- | --- |
| Existing runtime | Core Rust, Wasm-wrapper and arena simulation sources match the preserved baseline. Measurement uses the archived Wasm binary, whose hash matches the recorded source manifest. The current game binary has a different build hash and is not used here; see `experiments/retention-v1.runtime-identity.json` |
| Configuration | Nine retention tests cover decay-only changes, default-wrapper identity, incompatible snapshot rejection, unsampled-score retention, sampled updates, exact first-combat pairing, reward tampering, geometry and deterministic fresh players |
| Existing lab compatibility | All ten synthetic tests and nine earlier experiment tests pass; TypeScript `npm run check` passes |
| Protocol freeze | Each `.started.json` stores source/protocol hashes before measured combat. Evaluators verify them again before writing results |
| Switch reconstruction | 2,304 prior repeat/online combats match exactly; 1,152 new boundary-frozen combats match full replay |
| Boundary core verification | 10,368 choices plus feedback/commits reconstructed separately from physical outcomes; checkpoint identity verified |
| Retention combat | All 16,704 measured combats re-executed exactly, including scenario manifests, input fingerprints and final states |
| Retention core verification | All 50,112 choices plus feedback/commits reconstructed independently; frozen cells stay unchanged |
| Analysis | Verifiers recompute seed-paired summaries and gate decisions exactly; all five gates retained, including three failures |
| Recorded replay | 48 reconstruction encounters match stored rows before frames are exported; all four conditions preserved |
| Browser | HTTP 200, no console errors; all four endpoint health/time checks pass; play advances, pause holds, 4× works; 390px controls fit without overflow |

Records: [boundary verification](experiments/switch-boundary-v1.verification.json), [retention verification](experiments/retention-v1.verification.json), [browser QA](experiments/retention-v1.browser-qa.json), [replay provenance](experiments/retention-v1-view.view.json).

Full combat replay uses the same host implementation to establish determinism and result integrity. The separate policy verifier bypasses that host: it reconstructs legal choices and the reward formula from enemy damage, health and sightings, then drives the real archived Rust/Wasm core. These checks complement each other; deterministic replay alone would not establish a correct reward rule.

The fresh generator was checked for geometry validity and exercised on non-evaluation seed 19 before source freeze. Reserved combat outcomes did not tune its rules. The measured run completed all 24 suite/seed jobs without interruption, early stopping or parameter changes. Candidate failure did not cancel fresh evaluation.

The current game and public site were not rebuilt or deployed by this work. No production learner change was installed. Human participant count remains zero.
