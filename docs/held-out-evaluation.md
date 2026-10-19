# Held-fixed evaluation — prototype 0.2

This experiment separates training from measurement. Reproduce with `npm run build:wasm && npm run evaluate:held-out`. [Raw results and source hashes](held-out-evaluation.json) retain every seed and outcome.

Five policies (seeds 3, 17, 42, 101, 2026) each train for 24 clockwise-orbit encounters. For each controller, two independent instances restore the same trained snapshot, including RNG state. One samples its learned preferences; the other samples uniformly. Both disable learning and aging during the five evaluation encounters. The script asserts that every score and sample count remains unchanged.

There are 120 training encounters and 200 evaluation encounters. Three controllers are excluded from training: cover/dash, weaving, and periodic direction feints. This is scripted combat using the same simulator and compiled Wasm as the browser.

| Controller | Uniform enemy damage | Learned enemy damage |
| --- | ---: | ---: |
| Clockwise orbit, used in training | 42.72 | 71.52 |
| Cover and dash | 72.00 | 72.00 |
| Weaving | 60.48 | 76.80 |
| Direction feints | 31.68 | 39.36 |

Higher damage means more effective opponents, not necessarily a better game. The advantage disappears for the cover controller. Feints also produce much lower absolute damage than the trained orbit, for both policies. These observations motivate human counterplay testing; they do not establish that changing behavior causes a universal benefit or that the game is fun.

The arena, spawns and controllers remain limited fixtures. The cover controller produces identical damage in these runs, so that result should not be generalized to all cover play. Five seeds are descriptive, not a statistically conclusive sample. No confidence interval or success threshold was selected after seeing these results, and no controller was removed for an unfavorable outcome. Human impressions remain unmeasured.
