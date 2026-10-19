# Human playtest: human-fixed-v1

The current guided study lives at `study.html` or **Experiments → Field playtest**. It is implemented; human results are still uncollected. The six-round adaptive/random comparison remains a separate legacy exercise and is not pooled with this protocol.

## Sequence specified before participant collection

1. Two controls warm-up rounds, using the same fixed enemy settings for everyone. Exclude these from condition outcomes.
2. Set A: six rounds repeating a chosen movement route, then six rounds deliberately changing that movement. Combat stats, legal tactics, controls and map stay fixed.
3. Before revealing any learning data, collect an unaided description and supporting evidence, an account of the changed approach, enjoyment/fairness/frustration ratings (1–7), and a yes/no/unsure behavior-change answer.
4. Set B: fresh independent memory, same policy seed and same 12-round structure. Repeat the exact questions.
5. Reveal which set learned and which used selected fixed tactics. Ask which set the participant would play again; export the session.

The learning condition uses the original individual-damage reward. The fixed condition always uses rush / flank right / lead, selected in `adaptation-v1`. It makes legal choices through the real Rust mask API and never updates memory. Neither rejected team-credit candidate is in the study.

Default order is independently randomized 50/50, not guaranteed exactly balanced in a small sample. A facilitator can alternate `?order=adaptive-first` and `?order=fixed-first` for a balanced recruitment schedule; assignment type and realized order are recorded. Do not choose order after seeing a participant's performance. Default seed is cryptographically sampled and identical across that participant's conditions.

## What to collect

Recruit 6–10 real players for a formative pilot. Describe the task as comparing two enemy setups. Avoid explaining expected adaptations before their unaided responses. Ask people to avoid names or personal information in notes. Use a keyboard and mouse; touch-only manual play is unsupported.

Each versioned JSON export includes anonymous session ID, source fingerprint, full protocol, seed/order, actual outcomes and recap rewards, aggregate input telemetry, timestamps/markers, pauses and interruptions, complete/incomplete status, questionnaires, final policy checkpoints, and preference. It does not contain a frame-by-frame replay of human inputs. Aggregate movement counts cannot establish exactly which route was followed; use observed play and participant descriptions for that qualitative question.

Condition labels and the notebook stay concealed through both questionnaires, but this is client-side concealment, not protection against a technically curious participant. Participants may know the project from the microsite. Record that familiarity during facilitated notes and interpret expectation effects accordingly.

Nothing uploads automatically. The browser saves its latest recovery copy locally and provides explicit download/delete controls. Starting another session replaces that latest draft; download any previous session first. End & export retains partial records and marks the session incomplete. Closing during a round retains completed rounds and marks a round in progress; the unfinished encounter is not fabricated. A previous recovery copy can be downloaded on the next visit, not resumed as exact combat state.

## Analysis and decision

```sh
node scripts/analyze-playtests.mjs path/to/session-a.json path/to/session-b.json
```

The analyzer excludes automated QA, incomplete or unversioned sessions from paired complete-session summaries while listing exclusions and preserving original files. Review partial sessions separately as usability evidence. It reports ratings and preferences descriptively, retains unaided responses, and does not manufacture statistical significance. Do not pool different source builds without explicitly examining changes.

Look for concrete descriptions of actual enemy tendencies and a deliberate response with observable effects. Separate failure to notice adaptation, unsuccessful counterplay, difficult controls, ordinary combat difficulty, and frustration. Higher enemy damage or a correct condition guess alone is insufficient. Twelve rounds may be too short for some behaviors; do not silently extend only unsuccessful sessions. If needed, define a new protocol before the next collection wave.

Automated checks run with `?qa=1`. They are conspicuously labeled, export `source: automated-qa`, and are excluded from human conclusions. The two recorded QA sessions in `docs/qa` verify the real Wasm/browser path and both condition orders; their questionnaire text and ratings are synthetic test inputs.
