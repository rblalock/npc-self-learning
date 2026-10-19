# Prototype verification — 2026-10-18

Browser inputs and demo controls drive one arena simulation; observed combat outcomes cross the Wasm boundary into the Rust learner; committed preferences appear in the UI and survive reload.

## Automated results

| Boundary | Result |
| --- | --- |
| Rust policy | 19 behavior tests passed, including reward reversal, legal masks, no-evidence/baseline freezing, bounded updates, hostile snapshot rejection and exact JSON score persistence. |
| Native Rust ABI handling | One FFI boundary test passed. |
| Real C caller | Compiled and linked against the macOS shared library. Mask, feedback, duplicate handling, commit, snapshot/replay, invalid inputs and string ownership passed. |
| Actual arena + Wasm | Six tests passed: combat evidence, frozen memory, full encounter replay, hidden-player invariance, cover/projectile behavior and fixed combat statistics under opposing learned policies. |
| Browser build | TypeScript check and Vite production build passed. |
| Same-world evaluation | 600 encounters across five seeds, plus a 150-encounter tactic reversal trace. See the raw evaluation files and their protocol. |

## Production browser checks

Tested the built static application on localhost:5174, not only the Vite development server.

- The generated WebAssembly module loaded successfully; there is no alternate JavaScript policy.
- Manual movement responded to keyboard input; moving right for 20 fixed steps changed x from 460 to 515.
- Dash moved the player and started its fixed cooldown.
- A real pointer click fired a projectile; the target's health fell from 72 to 54.
- Completed automatic encounters submitted actual damage rewards and changed the displayed preferences.
- The frozen-baseline control displayed uniform 50/50 choices and preserved previously learned scores exactly.
- Reset returned scores and sample counts to zero.
- After seven new learning encounters, a page reload restored every score, count and computed probability exactly.
- Layout inspection at desktop and 390px widths found no horizontal overflow. Manual play remains keyboard/pointer oriented; no touchscreen movement controls are implemented.

A one-ULP snapshot parsing drift was discovered independently in the browser and arena replay test. Enabling serde_json's `float_roundtrip` feature fixed it; the regression retains the actual failing score values. The strict replay assertion was preserved.

No application console errors or failed application assets were observed in the final production-browser check. External fonts use system fallbacks if unavailable.

## Limits

Validation ran on Apple Silicon macOS with Rust 1.94 and Node 24.22. The Ubuntu CI workflow is provided but has not run on a remote service. Native Unity/Unreal integration examples have not been built inside those editors. Cross-platform bit-identical floating-point math is not promised: replay checks use the same runtime/target and saved configuration. Human fairness, perceived intelligence and enjoyment still require playtesting.
