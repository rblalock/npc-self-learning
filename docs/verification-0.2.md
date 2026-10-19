# Prototype 0.2 verification — 2026-10-18

The guided exercise exposes actual learned preferences, the scout gates
faction knowledge through a delivered report, and a blind comparison records
manual play without exposing its conditions until completion.

## Automated results

All 36 tests passed: 20 Rust core tests, one Rust FFI test, and 15 JavaScript
tests exercising the arena, study state machine, typed client and real Wasm.

- Core checks include bounded aging without new samples, clean-boundary
  enforcement, exact snapshots, legal masks, reward reversal and validation.
- Arena checks cover real combat feedback, uniform and held-fixed memory,
  replay, sight restrictions, fixed combat statistics, truthful recaps, physical
  scout interception, report contents frozen at departure, the remaining scout
  chase after fighter elimination, and target lock during attack telegraphs.
- Study checks cover reflection/completion boundaries and blind condition order,
  event recording and export. The typed client also exercises non-arena vocabulary
  and resource ownership against compiled Wasm.
- The C caller compiled and linked against the macOS shared library; masks,
  feedback, commit, invalid input, duplicate feedback, snapshot/replay and string
  ownership passed.
- TypeScript checking, typed-client compilation, Rust/Wasm compilation and the
  Vite production build passed.

## Browser checks

Actual controls were exercised in the development browser, with the guided flow
repeated against the production bundle on localhost:5174.

- Generated Wasm and all production application assets loaded successfully.
  No application console errors or failed assets appeared in the final production
  check.
- The exercise completed four learning rounds, stopped for reflection, then
  completed three reverse-direction rounds. Recaps showed actual hit counts,
  rewards and before/after probabilities. Combat was advanced using fixed-step
  debug helpers to make this QA repeatable; this is not human playtest evidence.
- Starting and completing the isolated exercise preserved free-play scores and
  sample counts exactly. Discarding a live free-play encounter can advance its
  encounter/decision/RNG metadata without learning from it.
- The blind comparison used manual mode, hid memory and condition labels, started
  its second block with fresh memory, and revealed the order after six rounds.
  A real download was parsed: six outcomes, the actual condition order, a marker,
  and notes identifying the session as automated QA.
- A pointer-fired projectile sequence intercepted the scout. The resulting recap
  accepted no new evidence and reported only fading existing preferences.
- Desktop and 390px layouts showed no horizontal overflow; the reflection overlay
  and recap cards remained readable. Manual movement still requires a keyboard
  and pointer; touchscreen movement controls are not implemented.

## Evaluation and limits

The [held-fixed evaluation](held-out-evaluation.md) ran 120 training and 200
evaluation encounters across five seeds. Evaluation restored paired snapshots
and disabled further learning. Its raw JSON retains source hashes and every
per-seed result. Learned opponents dealt more damage against the orbit, weaving
and feint fixtures, with no advantage against the cover fixture. These are
descriptive simulator results, not evidence of fairness or enjoyment.

Validation ran on Apple Silicon macOS with Rust 1.94 and Node 24.22. The provided
Linux CI workflow has not run on a remote service. No engine editor was used,
no package was published, and no human playtest results have been collected.
Use the [playtest protocol](playtest.md) for that next step.

## Interface cleanup

The revised interface removes the introductory banner, puts play/demo, patterns,
pause and keyboard hints above the arena, and moves experiment setup into a
collapsible panel. Memory and last-round evidence share a tabbed inspector; the
survival chart remains visible. This changes presentation, not combat or learning.

The 15 arena/client/study tests and production build passed again. Browser QA
completed the seven-round guided flow and six-round blind flow through the new
controls, using fixed-step helpers to advance combat. The report opens at the
reflection boundary; blind intel stays concealed during both blocks and becomes
visible on completion. A pre-existing CSS condition that concealed completed
blind sessions was corrected. Inspector arrow-key navigation and notes disclosure
were checked.

The built application loaded actual Wasm without failed application assets or
console errors. The top Play control selected manual mode; an actual D key event
advanced the player 55 units over 20 fixed simulation steps. Scout reports could
be enabled from experiment setup. At 1280×800 the arena begins at y=152 and the
workspace ends around y=757, fitting the viewport. At 390px, both the experiment
panel and guided report layout had no horizontal overflow. Human playtesting
remains outstanding.

## Illustrated missions — 2026-10-18

Added three mission checks, bringing the arena/client/study/mission suite to 18 passing tests. These cover progression gates and duplicate outcomes, truthful report summaries, and real courier combat with compiled Wasm. The integration check verifies unchanged policy cells at deployment boundaries, the same policy object across missions, 72 HP opponents and 100 HP player at each wave start. TypeScript, Wasm/client compilation and the production build passed.

Production browser QA used actual Deploy/Face wave 2/next mission/Retry buttons, with fixed-step simulation helpers advancing combat. The first report produced three accepted observations; both waves cleared. Exact policy cell JSON matched before and after wave-two deployment, mission-two deployment, and retry after an idle manual player died. The mission number advanced only after two successful waves. Returning to Sandbox removed mission state; guided seven-round and blind six-round studies still reached completion. These are automated checks, not human playtest results.

The production map, four self-hosted font files and Wasm loaded successfully. Rendered desktop and 390px mobile captures were inspected; no horizontal overflow was found. Mobile is for watching the demo: manual play still requires keyboard and pointer. Mission progression currently repeats one battlefield, retains memory only within the tab, and does not promise monotonically increasing difficulty.

Coarse-pointer and narrow-screen visits default to the demo and show the keyboard/pointer requirement. Essential map labels remain at least 10 CSS pixels; secondary annotations are hidden on small canvases without changing collision geometry. A 390px production load confirmed the demo default, input requirement and pause/resume guidance.

## Clearer navigation and manual input — 2026-10-18

The simulation uses fixed screen-relative movement; demo styles do not reverse manual input. The input boundary now clears movement and firing at round, pause, control-mode, and focus transitions. Physical keyboard codes keep key release consistent across letter-case changes; auto-repeat cannot restore a key cleared at a transition. Missions and Experiments preserve the selected manual/demo mode. The guided movement test only switches demo direction when demo mode is selected.

The production build and all 19 arena/client/study/mission tests passed. A new regression checks all four movement directions across three completed rounds with each selectable demo style while in manual mode. Production browser checks made 48 assertions: eight movement keys across three completed rounds, cleared input through pause/new-round/focus/blur, mode preservation, the four-round reflection boundary and manual movement afterward, six-round blind comparison conceal/reveal, and learning on/off labels. These use dispatched browser key events and deterministic simulation steps.

The header now offers Missions and Experiments; actions name Start mission, Start wave 2, and Next mission. Experiments opens paused for selection or free practice. The map title and mission-objective sentence were removed. Success copy says “The enemy is learning” when evidence was accepted, and reports no new information otherwise. “Change your movement” identifies the player's behavior explicitly. Learning labels use on/off/paused with factual tooltip explanations.

Browser checks at 1280×800, 1280×1200 and 390×844 found no application console errors, failed requests or horizontal overflow.

## Reproducible adaptation benchmark — 2026-10-18

The [adaptation v1 report](experiments/adaptation-v1.md) records 8,568 actual arena encounters through compiled Rust Wasm: all eight fixed combinations, 32 independent policy seeds, and exact-checkpoint branches into continued and frozen learning. It retains every round, full policy cells, the local protocol, and 14 source/dependency/binary identities. Direct observations were used; this is not a mission/scout or human study.

All 25 arena/client/study/mission/evaluation tests passed under Node 24.22.0. Six benchmark tests check exhaustive legal fixed profiles, paired bootstrap seed alignment and uncertainty, practical/statistical screening gates, exact frozen branching, and identical serial/worker trial results. The full four-worker experiment completed without errors. `node scripts/verify-adaptation.mjs docs/experiments/adaptation-v1.results.json` independently verified source identities, all candidate/seed/round records, legality, frozen policy cells, summary arithmetic, and the primary bootstrap result.

The simulator and learning behavior were not changed for this milestone; the harness exports its existing config and tactic vocabulary for validation. New scripts measure that behavior. No browser UI changed, and no additional browser QA is claimed. The favorable reversal result, feint regression, fixed-policy advantage, and insensitive cover damage result are all retained. The [post-hoc interpretation](experiments/adaptation-v1-interpretation.md) is explicitly separate from the protocol and generated report.

## Reward attribution experiment — implementation checks

The reward candidate is isolated in `scripts/reward-trial.mjs`; browser behavior, the simulator, Rust core and all 14 v1 source identities remain unchanged. The host adapter changes only feedback at encounter completion and logs both original and submitted rewards with the evidence used. It is limited to direct observation and rejects courier mode.

All 30 arena/client/study/mission/evaluation/reward tests passed together. Five additional checks cover credit for a teammate contribution, exact identity-adapter behavior through Wasm, unchanged first combat with truthful candidate feedback and frozen/unobserved memory, serial/worker equivalence, and the conjunction of advancement criteria. The evaluator verified original artifacts and exactly replayed a complete 264-encounter reference trial before starting candidate measurements. No additional browser behavior is claimed from these headless checks.

The full [reward experiment](experiments/reward-attribution-v1.md) completed 5,376 candidate encounters across 32 matched seeds. `node scripts/verify-rewards.mjs` verified 19 source identities and independently replayed all 16,128 candidate decisions, feedback and commits through Wasm, matching recorded scores, probabilities, snapshots, rewards and frozen memories. It reconstructed summary statistics and the gate decision from the raw traces. Only reversal continued-learning benefit and unchanged cover damage passed; the candidate is not promoted. The protocol retained its exact pre-run SHA-256 `731b0434ac3ce011a30a78867d6e31818de4f15c4828ac4e9b2481783441fd4c`.
