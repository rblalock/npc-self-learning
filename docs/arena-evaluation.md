# Arena evaluation

Historical **prototype 0.1** record. Its source hashes identify the original simulation. Prototype 0.2 has clearer lock timing and new host mechanics; use [the held-fixed evaluation](held-out-evaluation.md) for the current comparison. The command below runs the current simulator and will not necessarily recreate this historical artifact.

This is an exploratory test of the actual browser combat simulator and compiled
Rust/WebAssembly policy, with deterministic scripted player controls. It is not
a human playtest or evidence that the policy generalizes to other games.

Run `npm run build:wasm && npm run evaluate:arena` to reproduce. The script imports
the same DOM-free `Arena` used by the browser and the browser's generated Wasm.
Recorded per-seed scores, sample counts, probabilities, source identities and the
protocol are in [arena-evaluation.json](arena-evaluation.json).

## Protocol

Five seeds: 3, 17, 42, 101 and 2026. Each seed runs an independent uniform frozen
baseline and an independent adaptive policy, for 600 complete encounters total.
Each run performs five clockwise rounds, 35 further clockwise training rounds,
ten further clockwise measurement rounds, then ten counterclockwise rounds without
resetting memory. Adaptive learning remains enabled during measurement and after
the strategy switch. These are online adaptation measurements, not a held-out
frozen-policy evaluation. Both modes draw decisions from the same seeded Rust
implementation; subsequent action sequences diverge as preferences change.

Both controls use ordinary movement and shooting inputs. Every hit is resolved
through the same projectile, wall, line-of-sight, health and cooldown code as manual
play. The demo chooses 78% analog movement and slower shooting than a player can
request; it does not change player maximum speed or weapon rules. Enemies use
authored patrol positions or their own last visible player observation. Policy
receives a role, legal action set and observed reward, never the demo style label.

## Results

Numbers are mean damage taken by the player per encounter, averaged equally over
the five seeds. Higher damage means more effective opponents; maximum recorded
player damage is 100.

| Phase | Uniform frozen baseline | Adaptive |
| --- | ---: | ---: |
| First five clockwise rounds | 48.96 | 60.48 |
| Clockwise rounds 41–50 | 48.00 | 75.84 |
| First ten rounds after reversal | 48.72 | 61.44 |

After clockwise training, adaptive opponents inflicted more damage than the
baseline in every measured seed. The five adaptive means were 80.4, 64.8, 73.2,
80.4 and 80.4, compared with 48.0, 44.4, 45.6, 60.0 and 42.0 for the baseline.
The observed difference is 27.84 damage, or 58% relative to the baseline mean.
Do not interpret that descriptive ratio as a universal performance gain.

Reversing the player's orbit reduced adaptive opponent damage from 75.84 to 61.44
over the next ten rounds, a descriptive 19% reduction. Adaptation continued during
those rounds. This demonstrates counterplay in this particular controller and
arena, not a general guarantee that switching strategies beats a learned policy.
After the switch, adaptive probabilities varied roughly around 81% close-distance,
72% right-flank and 84% movement-leading shots. Every frozen baseline probability
remained 50%, with zero trained samples.

A separate [strategy reversal trace](arena-strategy-reversal.json) records the
policy before and after the switch for seeds 3, 42 and 101: 40 clockwise rounds
followed by ten counterclockwise rounds. Left-flank selection probabilities of
80.3%, 81.5% and 81.0% became right-flank probabilities of 71.7%, 71.5% and 71.6%.
The policy never receives the controller label; different movement generates
different shot opportunities, hits and rewards. This trace is separate from the
600-encounter cohort above and has the same exploratory limitations.

## Objective and limits

For each enemy with a visible player observation, the round reward is
`clamp(damage_landed / 32 - 0.22 - elimination_penalty, -1, 1)`; the penalty is
0.18 if that enemy was eliminated. No sighting means no training sample. Rewards
are submitted at the end of combat and committed together. Ending a round early
with the UI's New Round control discards its evidence. Health, speed, damage,
cooldowns and the six tactic implementations never learn.

The fixtures were used to diagnose and tune gameplay, so this is exploratory
evidence. There are no confidence intervals or preregistered held-out controllers.
Map, spawns, enemy coordination and scripted shooting affect attribution; a tactic
can benefit or suffer because of its teammates' choices. Global preferences share
one `arena` context rather than identifying player styles. More maps, different
controllers, matched frozen-policy evaluations and human counterplay sessions
remain useful follow-ups. Library tests separately check reward reversal,
legal masks, snapshot validation and update bounds; those tests do not establish
that combat is enjoyable.
