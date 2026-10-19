# Counterplay prototype — 0.2

This document describes the browser arena mechanics in version 0.2, built on the Rust/Wasm library.

## Mission loop and illustrated map

The initial screen opens a fresh operation. **Deploy** starts wave one. Surviving the 26-second limit or clearing the encounter advances to a reinforcement briefing; surviving wave two wins the mission. Death requires a retry from wave one. The same policy instance continues through both wins and retries. The next mission repeats the same field and roster with existing preferences; health, damage, speed and abilities do not scale with mission number.

Scout reports are enabled in missions. The briefing states whether usable evidence arrived, was intercepted, or failed to arrive. The next wave uses only the accepted report; older preferences can fade when no report arrives. Learning changes tactic probabilities, so later deployments can punish a repeated habit, but increased difficulty on every mission is not guaranteed.

Operation memory lasts only in the current tab until reload or **Sandbox**. It is isolated from Sandbox's saved memory and from experiments. Choose **Sandbox → Experiments** to start a study. **Deploy** in Sandbox starts a fresh operation.

**Watch demo → Demo movement** controls the blue player: **Circle clockwise** (formerly Orbit), **Circle counterclockwise** (formerly Reverse), and **Use cover + dodge** (formerly Cover). Enemy choices are listed separately in Intelligence notes.

The map's hatched, numbered cover rectangles block movement and shots; the watercolor terrain, perimeter trees and contour lines are decorative. The violet envelope is the scout and the violet antenna is its destination. Opponent shapes distinguish roles without relying on color. The map is presentation only; combat geometry and observation rules remain in the simulation. See [asset provenance](assets/README.md).

## Guided exercise

Choose **Experiments → Counterplay**. A fresh, isolated policy plays four learning rounds at 3× demo speed. Choose **Play yourself** to establish your own pattern instead. The exercise stops at a reflection boundary and opens **Intelligence notes → Last round**: observed hits, damage, reward, and before/after selection probability. Expand **Evidence** for attribution details. Click **Start counterplay** to start three counterplay rounds. The demo reverses direction; manual players can change movement, use cover or exploit attack timing.

The outcome is measured, not prescribed. Four rounds are enough to expose preferences in the default demonstration; they do not guarantee a successful human counter. A completed exercise offers notes and an export. Returning to free play restores its independent saved memory.

Dashed attack lines mean the opponent is still tracking an observed target. The final 220 ms uses a solid line and a **LOCKED · DODGE** cue; its target no longer moves. Projectile travel adds time to evade. All conditions use the same attack timings and combat parameters. Faint paths show authored movement intentions derived from last sightings.

## Scout-delivered faction memory

In free play, enable **Experiments → Scout reports**. An unarmed violet scout observes the fight, then runs to the relay after eight seconds. Two direct player hits eliminate it. Clearing the fighters leaves the scout chase active until it is intercepted, delivers, or the encounter times out.

- The scout records a role's evidence only when it can see both the player and that opponent. Hits must occur while it is watching and visible to it.
- Its packet is copied at departure. Later hits and eliminations are excluded.
- Only a packet that physically reaches the relay before the encounter ends trains the next squad. Interception destroys the packet; an unfinished escape supplies no evidence.
- Existing memory remains. Without a usable report, the host explicitly ages preferences toward neutral by 2.5% for that round, subject to the library's update bound. This adds no observations.
- Uniform and held-fixed evaluation modes never age or train. Switching modes or discarding a round invents no evidence.

This is one faction's role memory across sequential arena encounters. Multiple camps, independent faction banks, delayed networks and generated tactics are outside this prototype.

## Blind comparison and export

Choose **Experiments → Blind A/B** for two three-round manual blocks. Each block starts with a fresh policy, the same seed, map and combat rules. The adaptive/uniform order is randomized per session. Memory panels, condition labels, distinguishing history colors, recap and export are hidden or disabled until the comparison ends. The demo is disabled during the comparison.

Press **N** to timestamp noticed adaptation and **C** to timestamp a counterplay attempt, or use the buttons above the arena. Open **Session notes & export** for impressions. After six completed encounters, intel and conditions are revealed, notes open automatically, and **Export JSON** downloads the actual outcomes, control mode, condition order, seed, markers and notes. The export contains no name or contact information. Sessions remain in this tab until downloaded; reload discards an unfinished study. Free-play memory is stored separately.

This is a formative tool with only three rounds per condition, not a statistical study. The automated QA export is labeled as QA and is not counted as a human playtest. Fairness and enjoyment require human evidence; the [playtest protocol](playtest.md) defines those measurements.

## Reusable boundary

The Rust core remains independent of this arena. The browser's existing JSON wrapper now uses a small typed client in `packages/browser`; it has no rendering, persistence or arena vocabulary. A separate vocabulary is exercised in the real Wasm test. Nothing has been published to a package registry.

The only new Rust operation is `{"op":"age","steps":1}`. It requires a clean boundary, accepts 1–100 steps, caps the change per step, preserves RNG and decision IDs, and never adds samples. Existing no-evidence `commit` behavior remains frozen; forgetting is an explicit host action.
