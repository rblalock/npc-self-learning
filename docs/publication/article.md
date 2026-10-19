# Experiment: NPCs that self-learn and adjust tactics

*A browser game and a small Rust library for NPCs that learn from combat. Individual learning and terrain-specific memory helped in the tests; attempts to automatically discard old lessons reduced performance.*

An NPC has two ways to aim: at your current position, or ahead of your movement. Could it learn which works against you, then adjust when you change how you play?

I wanted to test that with a playable game and a reusable learning library. The designer supplies the tactics. The NPC tries them, gets feedback from each encounter, and changes how often it chooses each one. The experiment measures whether those changes actually make it more effective.

The idea of keeping learning separate from the rules came from [Ink's adaptive learning design](https://github.com/siliconjungle/ink-lang/blob/main/docs/adaptive-learning.md). Ink treats learned state as an explicitly changeable part of a program, separate from the authored code around it, and its [policy learning examples](https://github.com/siliconjungle/ink-lang/blob/main/docs/policy-learning.md) leave rewards and legal choices to the application. This experiment borrows that separation. It is an independent Rust implementation and uses none of Ink's runtime, compiler or proof machinery.

[Play the game and explore the experiments](https://npc-self-learning.vercel.app/). The site also has the downloads and the full experiment record. The [research report](research-report.md) has the methods and reproduction steps, and the [evidence ledger](evidence-ledger.md) maps each number below to its source.

## The arena

The game is a small top-down shooter that runs in the browser. You fight three kinds of enemy, and each has exactly two tactics to choose from:

| Enemy | Its two tactics |
| --- | --- |
| Vanguard | Close the distance, or hold a lane |
| Flanker | Approach from the left, or from the right |
| Ranger | Aim at where you are, or lead your movement |

The game handles everything physical: movement, line of sight, collisions, aiming and damage. The learning lives in a separate Rust library that knows nothing about combat. At the start of an encounter, the game asks the library which tactic each enemy should use. After the encounter, the game reports how each choice went, and the library updates what it knows.

That boundary sets the limits. An NPC can get better at choosing between the tactics it was given. It cannot invent a new maneuver, move faster, hit harder or see through walls. The game decides what each enemy is allowed to observe and what counts as success.

The game also has a mission mode built around this. A scout carries what the first wave learned to a relay, and the next squad uses it. If you intercept the scout, the reinforcements fight without that report.

## How an NPC learns

The learner uses a technique called a contextual bandit. There is no neural network and no language model.

**Weights.** Each enemy keeps one number, a score between −1 and +1, for each of its tactics. Both start at zero. A higher score means the tactic has worked better so far.

**Choosing.** The scores become probabilities. A higher score makes a tactic more likely, but never certain. A fixed share of every choice, 16% in the arena, is spread evenly across the allowed tactics so the enemy keeps trying the one it currently prefers less. With two tactics, each always has at least an 8% chance. That exploration costs a little in the short term and is how an enemy finds out that something has changed.

**Reward.** After the encounter, the game sends back a reward for each choice: a number between −1 and +1. In the arena it is based on the damage that enemy dealt and whether it survived. The reward is the only thing the library learns from, so a reward that misses what actually mattered will teach the wrong lesson.

**Updating.** After the gradual decay described below, the score for the tactic that was used moves 22% of the way toward the reward it earned. The combined decay and reward update cannot move a score by more than 0.16 in one encounter, so one strange fight can't overturn everything.

**Memory.** The full set of scores is the enemy's memory. The game can save it and restore it later, including the random number state, so a saved enemy makes exactly the same choices when reloaded. Memory can also be split by situation, which the library calls context. An enemy could keep one set of scores for open maps and another for maps full of walls.

**Forgetting.** At each update, before applying the new reward, every score shrinks 2.5% toward zero. Old lessons fade slowly unless new evidence keeps them fresh. The game can also erase memory outright, which is the stronger form of forgetting tested later in this article.

Here is one step with the arena's settings. A ranger starts at zero for both tactics, so it picks each half the time. It leads its shots and earns a reward of 0.5, an illustrative value. Its lead score moves 22% of the way from 0 to 0.5, landing at 0.11. The next time, it leads its shots about 58% of the time. If leading earns 0.5 again, the score shrinks slightly with decay and then climbs to about 0.19, and the chance rises to about 63%. A ranger with a score of +1 for one tactic and −1 for the other would pick the better one about 92% of the time. Exploration keeps the other near 8%.

The [learning contract](../learning.md) states the exact update rule and its limits.

## What counts as working

"The NPC learned" is easy to show and hard to prove. A probability graph moving across the screen proves the scores changed. It doesn't prove the enemy got more effective.

The measurement in every experiment here is damage: how many hit points of damage the enemies dealt per encounter, under fixed combat rules. More damage means a more effective enemy. Damage says nothing about whether a fight was fun or fair, and no human-player results exist yet.

A learning enemy then has to beat something. Each comparison answers a different question:

- **Random tactics.** Does learning beat a coin flip?
- **The best fixed tactic.** Does learning beat a designer who picks one good tactic and sticks with it?
- **A frozen copy.** At some moment, copy the enemy's memory exactly and stop it from learning. If the learning copy does better afterward, the later updates helped.
- **A reset at the right moment.** Erase memory exactly when the player's behavior changes, using information a real enemy wouldn't have. This shows how much stale memory is costing.

The first test showed why the fixed tactic matters. A scripted player circled clockwise for 24 rounds, then switched to counterclockwise. After the switch, the enemies that kept learning dealt 18.70 HP more per encounter than their frozen copies over the last eight rounds (17 to 24). That looks like a clear win. The best fixed combination (vanguard closes, flanker goes right, ranger leads) still beat the learners by 12.14 HP, because it already dealt 84 HP against counterclockwise circling. It had been chosen by testing all eight combinations against clockwise, counterclockwise and cover-using players, so it was already prepared for the switch.

The same test turned up two other problems. Against a player who feinted on that map, continued learning lowered damage by 4.73 HP compared with the frozen copy. On later layouts the feint result changed sign, so it isn't a general weakness. Against a player who used cover, every combination of tactics dealt exactly 72 HP, so the enemy had nothing to learn. All of this came from 32 random seeds on one map with scripted players. [Adaptation results](../experiments/adaptation-v1.md).

## Building fights where learning can matter

The later experiments use a synthetic lab. It generates scripted players and arena layouts, with adjustable reaction time, aim error, movement patterns and timing. Every result comes from running the actual combat simulation. No language model writes a fight or judges whether an enemy seemed clever.

A broad first round of experiments tested several improvements: different reward formulas, more varied training, removing the gradual forgetting, and others. None met its success criteria. Varied training added 0.35 HP. Removing decay added 0.13 HP. An audit then found a flaw in the tests themselves. In many of them, the scripted player changed behavior but the enemy's best tactic stayed the same. The cover result above was the extreme case. A learner can't show an advantage when its choices all lead to the same outcome. [Research program](../research-program.md).

The next lab fixed that by checking each test before any learner touched it. For each candidate, it played every legal tactic against player behavior A and behavior B. A candidate qualified only if:

- A and B had different best tactics.
- Sticking with the old best tactic cost at least 12 HP after the change, in either direction.
- The enemy's reward signal showed the difference clearly enough to learn from.

Only 598 of 3,072 candidates qualified. For each seed and enemy group, the lab took the first qualifying candidate and recorded every rejection. It never looked at how a learner performed when choosing. Two of the 96 seed-and-group slots had no qualifying candidate and stayed in the record as failures.

This deliberately builds a population of fights where adapting should help. The 19.5% admission rate describes this generator. It doesn't say how often real players create such moments. [Qualification method](../opportunity-lab-v2.md).

## Individual enemies adapted

Each enemy trained against behavior A, then faced 32 encounters against behavior B. At the switch, an identical frozen copy was made, including its random state. Over all 32 encounters after the switch, the learning enemies dealt more damage:

| Enemy | Extra damage per encounter from continued learning | Adjusted interval |
| --- | ---: | --- |
| Vanguard | +8.25 HP | +4.75 to +12.58 |
| Flanker | +11.39 HP | +6.21 to +17.39 |
| Ranger | +6.21 HP | +4.15 to +8.67 |

All three met the success criteria set before the run. The interval is a paired bootstrap range, widened because six comparisons were tested together. Each enemy had 15 or 16 independent seeds. Repeating fights within a seed doesn't make them independent samples, and the intervals are approximate at this sample size.

Most enemies recovered within the 32 encounters: 14 of 15 vanguards, all 16 flankers and 15 of 16 rangers reached the lab's recovery threshold. On the lab's measure, that took about 15 to 17 encounters on average, with the few that never recovered counted as 33. When the player's behavior didn't change, learning and frozen enemies performed about the same, so the gains come from responding to the change rather than from extra practice.

Old memory had a cost. An enemy whose memory was erased exactly at the switch did 0.90 to 1.76 HP better than one carrying its old preferences, and reached the recovery threshold in about 10 encounters. When the player switched back from B to A, enemies that kept their memory also did worse than ones that had been reset. Neither reset was something the enemy decided for itself. The experiment told it when.

You can [watch recorded trials](../experiments/opportunity-validation-v2-view-2.html) with the actual combat, the enemy's tactic odds, and the best available response at each moment.

## Memory tied to the map helped

The terrain experiment asked whether separate memories help when the game can see something that predicts which tactic works. The visible feature was how much of the map was covered in walls. The player's behavior stayed the same while the map switched between sparse and dense layouts.

After training, enemies with separate memories for each layout beat enemies with one shared memory. The flanker gained 3.23 HP per encounter and the ranger 4.00 HP. Enemies with separate memories put about 71% of their choice probability on the best tactic, compared with about 50% for shared memory.

Both also beat a control that gave the enemy separate memories with the labels shuffled randomly. So the gain came from linking the right memory to the right layout. Extra storage alone didn't produce it. These enemies were tested on the layout types they trained on. Whether this carries over to unfamiliar maps hasn't been tested. [Terrain results](../opportunity-lab-v2.md).

## Squads didn't learn well together

The squad experiment had the three enemies choose as a team: one of eight possible combinations of their tactics, rewarded by total team damage. The squad gained 3.29 HP over its frozen copy, but the interval ran from −0.87 to +8.95 HP, which includes zero. That doesn't meet the success criteria.

Three enemies choosing independently, rewarded by the same team damage, did better. The team learner trailed them by 3.85 HP per encounter, in an exploratory comparison. Only 2 of 13 squads that started on the wrong combination recovered within 32 encounters, compared with 10 of 13 for independent choices.

The two setups aren't equivalent. The squad picks from eight options once per fight. Independent enemies each pick from two, three choices per fight, which spreads their experimenting differently. The tests showed that good team combinations exist. This learner didn't find them efficiently within 32 encounters. [Team results](../opportunity-lab-v2.md).

## Letting the NPC decide when to forget failed

Erasing old memory at the right moment helped a little. A real enemy doesn't know the right moment. So the next experiment gave it a simple detector that watched only its own rewards.

For each tactic, the detector compared the four most recent rewards with the four before them. If the average moved by 0.2 or more in the same direction twice in a row, it raised an alarm. One version then erased memory for both of the enemy's tactics. Another erased only the tactic that triggered the alarm.

The test histories were noisier than before. Player behavior could change abruptly, change gradually, change and then return, or stay the same. In the stable case, the player still used behavior B one fight in ten, so a surprising fight did not mean anything had changed.

This rule had already caused false alarms and lowered damage in an earlier development pass on cases that had been examined. It was run unchanged on fresh seeds anyway, to measure how and how badly it failed.

Neither version met the success criteria for any enemy. When the player's behavior changed, every average difference was negative, from −0.30 to −0.92 HP. Every version also lost damage when nothing changed. For the vanguard in stable play, full reset cost 3.22 HP per encounter and selective forgetting cost 4.37 HP. False alarms ran from 2.93 to 6.05 per 100 stable fights, against a limit of one. Each enemy had 16 seeds.

The detector did go off during almost every real change, in 190 of 192 change windows. That sounds good, but it also went off in stable play, and the resets lowered damage in both changing and stable histories. Of the 126 false alarms from full reset, 59 came after the enemy's results had improved. The design erased memory in response to good news as well as bad.

Through all of this, the standard learner kept adapting. After abrupt changes, it beat frozen memory by 3.50 HP for the vanguard, 6.08 for the flanker and 6.70 for the ranger. [Forgetting results](../change-detection-lab-v1.md), [recorded fights](../experiments/change-detection-v1-view.html).

## Gentler forgetting didn't help either

The obvious repairs were tried next. The changes were cumulative. The first version only reacted when rewards dropped. The second also halved the scores instead of erasing them. The third also compared separate batches of four rewards instead of overlapping windows.

The overlapping version had a specific flaw. One unusually bad reward appeared in two consecutive windows, so it could count as two confirmations. Both versions that kept overlapping windows failed a stress test for this before the full run, which disqualified them.

The separate-batch version passed that test and every stability check, including the limit of one intervention per 100 stable fights. It still made each enemy slightly worse:

| Enemy | When behavior changed | When nothing changed | Interventions per 100 stable fights |
| --- | --- | --- | ---: |
| Vanguard | −0.12 HP | −0.11 HP | 0.93 |
| Flanker | −0.07 HP | −0.06 HP | 0.56 |
| Ranger | −0.08 HP | −0.03 HP | 0.71 |

The required gain was at least 1 HP. All three versions had negative averages for all three enemies, so none qualified for a fresh test. These results come from the same 48 cases examined in the previous study, run over longer histories of 128 or 256 fights, with 16 cases per enemy. They are a development screen and should not be read as fresh validation.

The longer histories also showed how little room there was. Ordinary learning beat frozen memory by 2.52, 4.52 and 4.93 HP. Erasing memory at exactly the right moment, with knowledge the enemy couldn't have, added only 0.22, 0.22 and 0.13 HP on top of that. At these lengths, even perfectly timed erasing had little to add. That doesn't rule out other approaches, but it leaves little reason to keep tuning thresholds. [Gentler forgetting results](../conservative-intervention-v1.md), [recorded fights](../experiments/conservative-development-v1-view.html).

## Checking the record

Every scored fight in the forgetting study, 69,120 of them, was re-run and produced exactly the same result. Separate checks rebuilt every choice, reward update and memory reset from the logs. The gentler-forgetting screen reused recorded outcomes for 259,584 policy steps and added no new fights. Its checker rebuilt all of them and re-ran 8,352 fights as spot checks on the reused outcomes. [Verification record](../verification-change-detection-v1.md).

That proves the record matches the simulator and the library. It doesn't prove the scripted players behave like people. In these tests, a given behavior and tactic always produce the same fight. The randomness comes from which behavior appears in each encounter, not from a player adjusting mid-fight.

The recorded viewers link each displayed fight to the enemy's odds, its reward and the resulting memory change. The examples shown were chosen by a fixed rule, such as the first seed and set rounds. They illustrate the results and don't replace the full averages.

## Using it in another game

The reusable part is the Rust library. The browser game calls it through WebAssembly, and native games can call it through a C interface. A game defines its own enemy roles, tactics, situations and rewards. A separate example uses it for guards with a different vocabulary and no arena code. [Integration guide](../integration.md).

The library can't supply good choices. If every tactic leads to the same outcome, there is nothing to learn. If the reward misses a teammate's contribution, preferences drift the wrong way. If a context label doesn't predict anything, separate memories add nothing.

Version 0.3.0 includes the Rust source, a browser kit and a macOS arm64 native bundle under the MIT license. It is experimental and not published to npm or crates.io. [Quick start](../releases/quickstart.md).

## What the experiment showed

Individual NPCs can learn which of their authored tactics work and adjust when the player changes, in fights built so that the change matters. Memory tied to something visible, like the shape of the map, helps when it predicts the right tactic. Both results held up against frozen copies and other controls.

Teams choosing together didn't learn well enough. Letting an NPC decide on its own to erase its memory made it worse in every version tested, including the gentle ones. Continuing to update the scores worked better than adding these reset rules. The tests did not establish that the gradual forgetting built into the learner was itself beneficial.

The larger lesson came from the tests that failed. Many of the early tests couldn't have shown anything, because the enemy's best move never changed. Checking that a fight had something to learn before testing the learner made the results meaningful. Whether any of it makes a game more fun for a human player is still untested.
