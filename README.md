# Tactical Air

[Play the public demo, explore the evidence, and download 0.3.0](https://npc-self-learning.vercel.app).

**Blog post:** [Experiment: NPCs that self-learn and adjust tactics](https://www.rickblalock.dev/scratch-notes/testing-whether-game-enemies-learn/) — how the learner works, what the experiments measured, and recordings from the simulation.

Experimental release 0.3.0: a portable Rust library for enemies that learn which **authored, legal tactics** work, plus a playable browser arena that makes the learning visible.

The game owns perception, movement, combat and rewards. The library owns bounded preference updates, deterministic choice, and memory. It never changes health, damage, movement speed, cooldowns or available abilities.

## Latest research

The [agent-assisted NPC pilot](docs/agentic-npc-pilot-v1.md) adds model review after ten warm-up fights. Across two familiar ranger cases, agent-controlled plans increased NPC damage by 5.63 HP per fight on stable histories and 5.44 HP on changing histories versus ordinary learning. All 340 fights replay exactly. This is development evidence: that pilot did not isolate the value of repeated review or access to history. Inspect the [recorded viewer](docs/experiments/agentic-npc-pilot-v1-view.html) or [frozen offline kit](publication/inputs/releases/tactical-air-agentic-pilot-v1.tar.gz). This experimental host is separate from the playable game's controller.

The [fixed-plan and planner-history follow-up](docs/agentic-npc-ablation-v2.md) is complete: 2,172 fights and 376 successful requests. Full-history review averaged 16.8125 HP per fight, versus 17.00 when holding the agent’s first choice, 15.6875 with latest-fight input, and 25.625 with a separately calibrated fixed plan. Repeated review added no average benefit over the initial selection. These are descriptive results on two familiar cases; the fixed benchmark used extra calibration experience. The [viewer](docs/experiments/agentic-npc-ablation-v2-view.html) and [offline kit](publication/inputs/releases/tactical-air-agentic-ablation-v2.tar.gz) preserve all results; both interrupted attempts remain separately available.

The [completed article](docs/publication/article.md) and [companion report](docs/publication/research-report.md) cover individual adaptation, team choice, public terrain memory and automatic forgetting.

The earlier [conservative-intervention screen](docs/conservative-intervention-v1.md) used **259,584 cached transitions on 48 examined cases**. Separate evidence batches reduced unnecessary interventions, but all three candidates failed to improve changing-history damage in every role. No candidate earned fresh validation. The original learner remains in the game.

Watch the [126 recorded fights and all-seed results](docs/experiments/conservative-development-v1-view.html), or use the [verified headless kit](target/releases/tactical-air-conservative-lab-v1.tar.gz). This adds zero new scored physical fights. Earlier [qualified-opportunity results](docs/opportunity-lab-v2.md) support solo adaptation and useful public context; the joint squad result remains inconclusive. See the [roadmap](docs/roadmap.md).

Large evidence files are stored compressed; the preparation command restores their exact verified bytes.

## Run the prototype

Prerequisites: Rust with Cargo, Node.js 22.12+ (24 recommended), and npm. Install the Wasm target and matching binding generator once:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
npm run prepare:publication
npm run dev
```

Open **http://localhost:5173**. The build generates real Rust WebAssembly; there is no JavaScript replacement policy. `npm run dev:ui` skips rebuilding unchanged Rust. `npm run build` creates a static application in `apps/arena/dist`, with relative asset paths.

- **Missions:** the game opens at a two-wave mission. Survive contact, decide whether to intercept the scout, then face reinforcements using its delivered evidence. Win to start the next mission; lose to retry from wave one. Enemy memory carries through both transitions. Mission memory lasts in this tab until reload or switching to Experiments.
- **Play yourself / Watch demo:** top controls switch between manual play and the demo. WASD/arrows move, mouse aims, hold click fires, Space dashes, P pauses. The demo movement selector explicitly offers Circle clockwise, Circle counterclockwise, and Use cover + dodge. These control the demo player, not enemy tactics.
- **Intelligence notes:** Memory shows tactic odds and observations; Last round shows actual learning changes with expandable evidence. The survival graph stays visible in both views.
- **Experiments → Change your movement:** repeat your own movement for four rounds, inspect the evidence, then try a different route, direction, or cover for three rounds. Demo mode explicitly changes its circling direction; manual keys never reverse. Uses fresh memory and preserves free-play saves.
- **Experiments → Field playtest:** two warm-ups, two concealed 12-round conditions (learning vs selected fixed tactics), a movement-change stage, structured questions, source fingerprints, recovery and local export. See [the human protocol](docs/playtest.md).
- **Experiments → Compare enemy learning (legacy):** two three-round manual sets, randomized conditions, notes and local JSON export. Intel is revealed after both sets.
- **Experiments → Require scout reports:** intercept the violet scout before it reaches the relay to stop new information reaching the next squad.
- **Experiments → Random tactics (no learning):** enemies sample their legal tactics uniformly. Stored preferences remain intact and these rounds do not train.
- **New round:** discards unfinished evidence. Completed practice rounds save policy memory locally in the browser, independently of missions.
- **Experiments → Reset memory:** starts a new independent memory with equally likely tactics.

Switching between Missions and Experiments preserves your control mode. Experiments opens paused so you can choose a test or start free practice. Held movement and fire inputs clear when a round ends, a new round starts, the control mode changes, play pauses, or focus leaves the arena.

The manual game currently needs a keyboard and pointer. Touch and narrow-screen visits open in Watch demo, with a visible keyboard-and-mouse requirement for manual play.

## Repository boundaries

```text
crates/tactical-air-core    Pure Rust policy, validation, deterministic RNG, snapshots
crates/tactical-air-wasm    Small wasm-bindgen wrapper over that same core
crates/tactical-air-ffi     Native shared/static library, opaque C ABI and C header
apps/arena                 TypeScript combat simulation, study flow, Canvas renderer, UI
packages/browser           Small typed client over the same Wasm API
scripts                    Wasm build, real-arena evaluation and native C smoke test
```

The core accepts arbitrary host-defined roles, contexts and actions. The arena happens to use three roles with two tactics each: vanguard (close distance / hold lane), flanker (left / right), and ranger (aim / lead movement). The arena uses one context initially to keep its behavior inspectable; the library supports multiple contexts.

At an encounter boundary:

1. The host supplies a role, context and legal action mask.
2. The library samples a tactic and returns a decision ID.
3. The game executes that tactic using its ordinary combat rules.
4. The host reports observed reward against the decision ID.
5. A commit aggregates evidence, applies bounded updates, and enables a versioned save.

Selection is a contextual bandit with exploration, not a neural network or an LLM. It learns rewards supplied by the host; it does not independently know what is fun or fair. The host must enforce truthful observations and useful attribution. The browser enemy host tracks last-seen positions and uses line of sight; the core itself cannot verify world geometry.

See [learning rules and limitations](docs/learning.md), [JSON contract](docs/contract.md), and [Rust, browser, C#, and C++ integration](docs/integration.md).

## Download and integrate

See the [release quick start](docs/releases/quickstart.md) for the browser kit, npm tarball, Rust source and macOS arm64 C ABI bundle. All are MIT-licensed experimental downloads. Current downloads are [privacy edition 1](docs/releases/privacy-edition-v1.md), with sanitized build paths and updated checksums. They are not published to npm or crates.io. Check `SHA256SUMS` beside the downloads.

The independent guard examples use a different vocabulary and no arena code: `cargo run --locked --release -p tactical-air-core --example guard_host`, or serve the extracted browser kit over HTTP. Their synthetic rewards demonstrate the API, not combat effectiveness.

## Verification and evidence

```sh
npm test                     # Rust, Wasm, typed SDK, actual combat and study tests
npm run test:ffi              # Real C caller on macOS/Linux
npm run test:experiments      # Experiment adapter and scenario invariants
npm run build                # Typed, fingerprinted production arena + playtest
npm run verify:evidence      # Historical archive and both new experiment verifiers
npm run test:synthetic       # Generated players, geometry, history and evidence checks
npm run verify:synthetic -- --full # Replay all 9,920 synthetic encounters
npm run verify:feints        # Replay all 96 tactic-interaction diagnostics
npm run test:retention       # Configuration, checkpoints, bots and reward verification
npm run verify:boundary      # Replay exact strategy-switch control
npm run verify:retention     # Replay all 16,704 retention encounters
```

The original v1 experiment sources and generated binaries are immutable in `docs/experiments/baseline-v1.source.tar.gz`. `node scripts/evidence-baseline.mjs` checks its checksum, extracts it under `target/evidence-baseline-v1`, and verifies the historical reward evidence. Historical experiment commands run inside that archive, rather than against the evolved application.

New runners reuse that simulator and learner. They verify sources, preserve every seed and round, and refuse to overwrite evidence:

```sh
node scripts/evaluate-additive.mjs --out docs/experiments/additive-credit-v1-replication
node scripts/verify-additive.mjs docs/experiments/additive-credit-v1-replication.results.json
node scripts/evaluate-scenarios.mjs --out docs/experiments/scenario-transfer-v1-replication
node scripts/verify-scenarios.mjs docs/experiments/scenario-transfer-v1-replication.results.json
```

The [research record](docs/research-status.md) includes positive and negative results. Continued learning helps after reversal in tested cases, fails against feints on the original map, and offers no damage benefit in the original cover fixture. Both team-credit candidates failed their advancement criteria, so **the game retains its original reward**. Three separately specified cover/spawn scenarios add evidence of environment dependence; they do not establish arbitrary-map or human effectiveness.

The [guided playtest](docs/playtest.md) measures a different question: can people recognize, exploit and enjoy adaptation? It is implemented and automated QA passes in both condition orders. No controlled human dataset has been collected. QA exports are explicitly excluded by `scripts/analyze-playtests.mjs`.

The [synthetic lab](docs/synthetic-lab.md) now supplies six configurable player families, generated maps, repeat/switch/return histories, reserved evaluation families, and a [recorded comparison](docs/experiments/synthetic-population-v1-view.html). Its first screen completed 9,920 encounters: continued learning helped relative to frozen memory, but varied pretraining failed to establish a meaningful advantage over narrow training. A separate 96-encounter diagnostic identifies missed team credit and the role-preference changes behind the original feint decline. All 10,016 new combats were re-executed exactly.

The [retention follow-up](docs/retention-lab.md) adds 17,856 new measured encounters across two protocols. Exact switch controls narrow what the earlier result means; removing decay fails the improvement gates. The original learner still demonstrates a positive post-switch effect on two new opponent families. Reports, full verification and a [four-condition recorded replay](docs/experiments/retention-v1-view.html) are available in the research exhibit. The no-decay variant is not used in the playable game.

See [release notes](docs/releases/CHANGELOG.md), [timing data](docs/releases/performance-0.3.0.json), [verification](docs/verification-0.3.md), and the [roadmap](docs/roadmap.md). Timing uses a small synthetic policy on one Mac, not the arena or a production capacity test.

The [change-detection follow-up](docs/change-detection-lab-v1.md) tests automatic full reset and selective forgetting on noisy abrupt, gradual, recurring and stable histories. All 69,120 new fights reproduce exactly. Neither candidate passes: false resets discard useful memory. The original learner remains unchanged. Explore the [recorded fieldbook](docs/experiments/change-detection-v1-view.html) or the [headless kit](target/releases/tactical-air-change-detection-lab-v1.tar.gz).

## Where this goes next

Compare the agent's history-and-note input with a simple minimum-evidence rule for switching plans. Audit whether the full seven-plan menu offers situations where changing plans can outperform a strong held plan. Lock an improved candidate before testing unfamiliar worlds; the completed review comparison does not justify continuous agent calls yet.

Separate detecting a change from deciding that forgetting will improve performance. Calibrate against stable noisy histories before another reserved run, then test context transfer and team sample allocation under matched budgets. Human recognition, fairness and enjoyment have not been measured.

The two-wave mission loop repeats the same battlefield and roster. Learning can make familiar habits more dangerous; mission numbers do not increase stats or guarantee a harder encounter. The effectiveness of scout-delivered learning has not been established by a controlled comparison.

## Relationship to Ink

This is inspired by the separation of learned choices and fixed constraints discussed in [Ink's adaptive learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/adaptive-learning.md) and [policy learning](https://github.com/siliconjungle/ink-lang/blob/main/docs/policy-learning.md). It is an independent Rust implementation, **not an Ink runtime, compiler integration, or formal proof system**.

The illustrated field map uses an original AI-generated watercolor terrain plate with authored Canvas fortifications and unit counters. [Asset provenance](docs/assets/README.md) records the prompt and font licenses. No external game assets or source were copied.
