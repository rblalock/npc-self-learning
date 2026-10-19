# Change-detection v1 verification

The chain is protocol → admission → exact training checkpoint → choice → physical fight → observed reward → committed memory → detector alarm → memory-only intervention → next choice. Each layer is recorded.

- The protocol and complete source closure were SHA-256 frozen before fresh admission. All 1,536 candidates remain in the audit. Selection was written before any learner ran.
- All 6,144 admission fights and 62,976 training/comparison fights were re-executed. Complete trial payloads match exactly, including input hashes, physics, policy outputs, detector events and snapshots.
- An independent verifier reconstructs every Rust choice, reward and commit from physical evidence. A separate detector implementation reconstructs alarms and exact reset boundaries. Changed RNG/config/counters, altered rewards, omitted alarms and mis-timed reference resets are rejected in mutation checks.
- Ten focused tests cover bounded buffers, confirmation logic, missing observations, identity isolation, selective cell preservation, latent mixture schedules, ties in privileged timing, cache-versus-combat equivalence, worker equivalence, corruption rejection and censored metrics.
- A Python arithmetic check recomputes all six primary and stable means directly from raw damage records, false-alarm counts, encounter budgets and preservation of non-cell snapshot fields. It does not import the JavaScript analyzer.
- Development preserves 14,432 cached policy transitions on eleven previously examined cases. All cached histories reproduce, and the 44 embedded physical action-table entries replay exactly. These are reused outcomes, not additional scored combat evidence.
- The offline fieldbook reconstructs every displayed combat through the real simulator, matches the recorded row and final core snapshot, and records renderer/data/result fingerprints. Browser checks cover selectors, playback, scrubbing, diagnostic rounds, desktop and mobile layout.
- The downloadable kit is extracted into a clean directory, every checksum is checked, all ten tests run, the first reserve seed's admission and all three complete trial histories are reconstructed, and the regenerated viewer must match byte for byte. The full verifier remains available for all 69,120 fights.

Canonical result SHA-256: `4d72b2476e40e3399935ca4644742ca2d18ebef56d6d38096c99b83912e20049`.

Canonical audit SHA-256: `d5c3c699afabf23e6dc1ae460bb371e52cc1789b47f8896c0316f01cb19d2111`.

The [machine verification](experiments/change-detection-v1.verification.json), [independent arithmetic](releases/change-detection-v1.primary-arithmetic.json), [browser QA](releases/change-detection-v1.browser-qa.json), and [package validation](releases/change-detection-v1.validation.json) retain exact counts. These are implementation and provenance checks, not independent replication by another lab, public preregistration, human evidence or arbitrary-game validation. Earlier evidence and the production core remain unchanged.
