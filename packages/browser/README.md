# @tactical-air/browser

Typed engine-independent client for the Tactical Air Rust/Wasm library. Build it from the workspace with `npm run build:sdk`. Supply the generated Wasm glue and `.wasm` file from `npm run build:wasm` in your own game's assets. This package has no arena, rendering, storage or framework dependency.

```ts
import { loadPolicy } from '@tactical-air/browser';
const policy = await loadPolicy('/wasm/tactical_air.js', {
  seed: 42, roles: [{id:'guard',actions:['advance','wait']}], contexts:['room'],
  learning_rate:.22, exploration:.16, temperature:.3, decay:.025, max_update:.16,
});
const decision = policy.choose('guard', 'room', ['advance','wait']);
// Execute decision.action, then measure its actual observed outcome.
policy.feedback(decision.decision_id, .5, true);
policy.commit();
const save = policy.snapshot();
policy.dispose();
```

For Node or an existing loader, initialize the generated module yourself and use `TacticalPolicy.fromModule(module, config)`. One client owns one engine; call `dispose()` once finished. Expected Rust errors throw JavaScript Errors. Saves require a clean boundary and matching configuration. `age(steps)` explicitly forgets old preferences without adding evidence. To evaluate a learned policy without training, choose normally, submit feedback with `observed:false`, and commit; uniform baseline uses `baseline:true` on choose. Never age a frozen evaluation policy.

This is a local package; it has not been published to npm. Native consumers can use the existing C ABI. Engine-specific packages are deferred.
