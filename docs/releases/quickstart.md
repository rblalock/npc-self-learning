# Tactical Air 0.3.0 — experimental release

This library chooses among tactics your game already implements. Your game supplies legal actions and measured rewards; the library updates bounded preferences. No server, account, model download, or LLM is required at runtime.

## Run the browser kit

Extract `tactical-air-browser-0.3.0.tar.gz`, open a terminal in its folder, and run:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`. The independent guard example includes the compiled Wasm, generated loader, typed JavaScript client, and MIT license. No npm install or Rust compiler is needed for this kit. Serve over HTTP; browser modules cannot reliably load from a `file://` URL.

Click **Simulate 40 observations**, then **Switch which action succeeds**, then simulate again. This is a synthetic API demonstration, clearly separate from the combat evidence. The host knows which action succeeds; the library receives only the observed reward.

## Use the browser library

Copy `sdk/` and `wasm/` into your application's static assets:

```js
import { loadPolicy } from './sdk/index.js';
const policy = await loadPolicy(new URL('./wasm/tactical_air.js', import.meta.url).href, {
  seed: 19,
  roles: [{ id: 'guard', actions: ['patrol', 'wait'] }],
  contexts: ['courtyard'],
  learning_rate: .22, exploration: .16, temperature: .3,
  decay: .025, max_update: .16,
});
const decision = policy.choose('guard', 'courtyard', ['patrol', 'wait']);
// Execute decision.action. Measure the actual, legitimately observed result.
policy.feedback(decision.decision_id, 0.5, true); // Example reward, not a universal rule.
policy.commit();
const memory = policy.snapshot();
policy.dispose();
```

The optional npm tarball installs with `npm install ./tactical-air-browser-0.3.0.tgz`. It includes `dist/` with types and `wasm/`; copy the Wasm files to your app's public asset directory and pass that URL to `loadPolicy`. This package is not published on npm. For Node, initialize the generated module from `readFile` and call `TacticalPolicy.fromModule`; see `scripts/sdk.test.mjs` in the source bundle.

## Use Rust

Extract `tactical-air-source-0.3.0.tar.gz`. From that directory:

```sh
cargo run --locked --release -p tactical-air-core --example guard_host
cargo test --locked --workspace
```

For another Rust project, use a path dependency on the extracted `crates/tactical-air-core`. It has no arena, renderer, browser, or game-engine dependency. The source release is not published on crates.io.

## Build the game and repeat experiments

Node 22.12+ and Rust are required. Install the Wasm target and binding generator:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
npm run build
npm run preview
```

The source includes the generated Wasm and historical evidence archive. Verify the old evidence with `node scripts/evidence-baseline.mjs`, then verify new experiments with `node scripts/verify-additive.mjs` and `node scripts/verify-scenarios.mjs`. New experiment runners refuse to overwrite evidence; pass `--out` with a fresh path prefix. The archived original commands run inside `target/evidence-baseline-v1`, not against evolved application sources.

## Integration contract

- Supply truthful observations and authored legal masks. The library cannot verify game-world perception or whether a reward measures useful behavior.
- Keep one mutable owner per engine. Use independent instances or host synchronization for concurrent game systems.
- Feedback is consumed once, then committed at an encounter boundary. Unobserved feedback does not train. Discard unfinished decisions with unobserved feedback and commit.
- Save at clean boundaries. Snapshot schema remains version 1 and restore requires matching configuration. Protocol/API compatibility is experimental; validate saves when upgrading.
- Frozen evaluation chooses normally but submits `observed: false`; do not call `age`. Uniform choice is a distinct `baseline: true` condition.
- Tactical decisions and encounter commits are the intended call frequency. Do not assume that this JSON interface belongs in every rendering frame.

## Tested support

| Target | Release status |
| --- | --- |
| Rust core on macOS arm64 | Native tests and standalone guard host |
| Wasm in Node 24 and the desktop Chromium preview | Real arena, typed client, snapshot replay, independent browser host |
| macOS arm64 C ABI | Real C caller, shared library, errors and ownership |
| Linux, Windows, mobile, consoles | Source may be portable; this release has no validation claim for those platforms |
| Unity, Godot, Unreal packages | No engine adapter included |

The timing report is a small-policy microbenchmark on an Apple M4 Max, not a production or mobile capacity guarantee. The evidence reports test scripted combat, not human enjoyment. Keep those distinctions when evaluating this library for your game.
