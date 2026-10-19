# Conservative interventions still fail to improve adaptation

Keep the original learner. Separating reward observations into batches reduced unnecessary interventions, and half-strength updates caused less harm than full reset. None of the three candidates improved changing-history damage in any role. No candidate earned a fresh validation run.

This is **development on 48 previously examined cases**, using 259,584 cached policy transitions. It adds **zero new scored physical fights**. The original physical action tables remain the source of the simulated outcomes. All decisions and updates reproduced; verification also re-executed all 192 selected table fights and 8,160 trajectory fights. These are verification work, not additional observations for inference.

Open the [recorded fights](experiments/conservative-development-v1-view.html), [protocol](experiments/conservative-development-v1.protocol.json), [summary](experiments/conservative-development-v1.summary.json), [verification](experiments/conservative-development-v1.verification.json), or [research kit](../target/releases/tactical-air-conservative-lab-v1.tar.gz).

## What changed

The preceding study found that a short-window detector erased useful preferences after both decreases and increases in reward. This development screen changes intervention direction, strength and evidence collection in stages, preserving the archived Rust/Wasm learner and combat simulator.

| Arm | Detection and action |
| --- | --- |
| Retained | Ordinary learning, no added intervention |
| Frozen | Same trained memory and random state, no updates |
| Legacy reset | Original overlapping-window detector, both directions, full context reset |
| Down-only reset | Same detector rule; suppress positive alarms, clear scores and counts on negative alarms |
| Down-only softening | Same detector rule; halve scores after negative alarms, preserve sample counts |
| Separate batches and softening | Compare separate batches of four observations; require two consecutive low batches against a held reference; halve scores |
| Signaled reset | Clear memory immediately before the hidden expected-damage optimum changes; privileged reference |

The detector sees only completed observed rewards and their role/context/action identity. Autonomous interventions happen after the normal learning commit and affect later choices. All interventions preserve configuration, counters, random state and unrelated memory cells. No probes or forced exploration are added.

The separate-batch rule retains the same 0.2 reward-drop threshold and two-confirmation requirement. Its recent batches do not overlap, but they share a reference. That does not make them independent statistical tests. A non-declining batch updates the reference without intervention. After an alarm, the most recent batch becomes the new reference.

Softening changes confidence by scaling both scores toward zero. It preserves observation counts, which are evidence metadata rather than an estimate of remaining confidence. The rules do not directly estimate the future cost of forgetting; their advancement gates constrain measured harm.

## Cases and histories

Use all sixteen previously selected seeds for each of vanguard, flanker and ranger. These were the first qualifying candidates in the preceding change-detection study. Source hashes, selection and admission were checked before use. There was no reselection based on performance.

Every case trains for 32 fights on a mixture of 90% A and 10% B, then forks identical memory and random state into all seven arms. Abrupt and gradual histories last 128 fights; recurring and stable histories last 256. B is 90% likely after an abrupt switch. Gradual B probability rises from 10% to 90% over 64 fights. Recurrence returns to 90% A after 128 fights. Stable play stays at 90% A throughout.

All arms share a sampled history within a case. A physical A or B outcome is deterministic conditional on the selected action, so a previously verified action table supplies the same combat outcome without executing physics again. Longer histories remain development on known cases; they are not an unseen population.

The budget is 1,536 shared training transitions plus 258,048 branch transitions. Extra combat probes: zero. The running physical evidence total remains 254,344 executions from the earlier eighteen scored records. This additional development record contains cached transitions only.

## Results

Positive differences would favor the candidate over ordinary retained learning. Changing-history damage equally averages the three changing histories within each seed, so the longer recurring history does not dominate. Stable damage uses all 256 stable fights. Brackets are descriptive 95% paired percentile seed-bootstrap intervals, with n=16 per role. These examined cases provide no fresh-validation or multiplicity-adjusted claim.

| Role | Candidate | Changing gain, HP per fight | Stable gain, HP per fight | Interventions per 100 stable fights |
| --- | --- | --- | --- | ---: |
| Vanguard | Down-only reset | −0.35 [−0.48, −0.24] | −2.08 [−3.39, −1.02] | 3.39 |
| Vanguard | Down-only softening | −0.12 [−0.19, −0.06] | −0.31 [−0.57, −0.11] | 3.54 |
| Vanguard | Separate batches | −0.12 [−0.21, −0.05] | −0.11 [−0.22, −0.03] | 0.93 |
| Flanker | Down-only reset | −0.34 [−0.53, −0.17] | −0.47 [−0.84, −0.18] | 1.66 |
| Flanker | Down-only softening | −0.12 [−0.19, −0.07] | −0.12 [−0.19, −0.06] | 1.73 |
| Flanker | Separate batches | −0.07 [−0.14, −0.02] | −0.06 [−0.13, +0.01] | 0.56 |
| Ranger | Down-only reset | −0.47 [−0.81, −0.19] | −0.32 [−0.50, −0.16] | 1.56 |
| Ranger | Down-only softening | −0.21 [−0.36, −0.10] | −0.17 [−0.25, −0.09] | 1.51 |
| Ranger | Separate batches | −0.08 [−0.12, −0.05] | −0.03 [−0.08, +0.01] | 0.71 |

The original automatic reset also remains in the data. In this longer development screen it loses 0.59, 0.59 and 0.92 HP on changing histories for vanguard, flanker and ranger. Its stable intervention rates are 6.05, 2.95 and 3.17 per 100 fights. Compare mechanisms within this screen; its longer horizons differ from the preceding reserved study.

The separate-batch candidate passes the declared stable-mean, lower-bound, worst-seed and intervention-rate gates in all roles. It fails the required 1 HP changing-history gain in all three. Passing a harm limit permits further consideration; it does not establish a benefit. The full-reset and soft overlapping-window candidates fail additional gates.

Retained learning still beats frozen memory by 2.52, 4.52 and 4.93 HP across the equally weighted changing histories. A privileged reset adds only 0.22, 0.22 and 0.13 HP over retained learning on those long histories. Those are descriptive controls. They suggest limited average headroom for this reset reference at this horizon, rather than a general ceiling on better learning systems.

## The single-outlier failure

The review found a stress failure before the development run. After stable rewards of +0.8, a single −1 observation appears in two consecutive overlapping recent windows. A following +0.8 observation can therefore complete the old detector's two-confirmation condition and cause a reset.

Both down-only variants retain that detector and fail the single-outlier check. Their stress failures are recorded and disqualify them from advancement even if their aggregate performance had passed. The separate-batch candidate passes this check, constant saturated rewards, sparse-observation traces, ignored-feedback tests and the positive-change test. Sustained declines still trigger it after enough observations.

These traces test specific invariants, not every possible noise distribution. The chosen detector can still intervene under stable mixtures, as the full development results show.

## Verification and recorded examples

Six behavior tests pass. They exercise intervention boundaries and corrupt records, including altered reward, random state, reset timing and retained scores. The full verifier reconstructs 259,584 decisions, rewards, commits and interventions independently of the trial's reward/intervention host. It uses the same archived Rust/Wasm core; this is not an independent implementation of that core.

All 192 selected action-table fights reproduce exactly. The preselected first case in each role also reproduces all seven arms through abrupt and stable histories: 8,160 actual-combat trajectory fights. A separate Python check recomputes all eighteen paired comparisons' means and pairs, stable rates and the transition budget. It does not independently implement the bootstrap intervals.

The [viewer](experiments/conservative-development-v1-view.html) contains 126 reconstructed fights: seed 31001 in every role, all seven arms, abrupt rounds 1/32/128 and stable rounds 1/128/256. This display rule was chosen after aggregate results, without a search for favorable encounters. The viewer labels that selection and shows all-seed results alongside the individual fights.

## Reproduce

The headless kit requires Node.js 24. Python 3 is optional for the separate arithmetic check. No API key, dependency installation or Rust compilation is needed.

```sh
shasum -a 256 -c SHA256SUMS
npm test
npm run verify
python3 scripts/check-conservative-arithmetic-v1.py
```

To regenerate the development record at a new prefix:

```sh
node scripts/evaluate-conservative-v1.mjs --out target/conservative-reproduction
node scripts/verify-conservative-v1.mjs target/conservative-reproduction
python3 scripts/check-conservative-arithmetic-v1.py target/conservative-reproduction
```

The replay exporter uses the canonical verified result. It refuses to overwrite its existing outputs. All old experiment sources remain unchanged.

## Decision

Reject all three candidates and preserve the original learner. No fresh validation population was consumed. The result supports improving measurement and reducing intervention harm, but provides no reason to ship these additional mechanisms.

Two remaining research questions are whether public-context memory transfers to unfamiliar layouts and whether different team sampling methods improve learning at matched reward and total cost.
