# Prototype contract

The portable crate is an engine-independent contextual bandit. Hosts supply finite roles, contexts, legal actions, and observed outcomes. The Rust library never reads a world, renders, calls an LLM, or changes combat parameters. This is inspired by the constraints and learning separation discussed in Ink; it is not an Ink integration or proof system.

## Rust API and JSON bridge

`Engine::new(Config) -> Result<Engine, Error>`; `Engine::request(&mut self, request_json: &str) -> String` returns a JSON envelope `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`. Direct typed APIs may also exist.

Config:
```json
{"seed":42,"roles":[{"id":"vanguard","actions":["rush","hold"]},{"id":"flanker","actions":["flank_left","flank_right"]},{"id":"ranger","actions":["aim","lead"]}],"contexts":["arena"],"learning_rate":0.22,"exploration":0.16,"temperature":0.3,"decay":0.025,"max_update":0.16}
```

Operations:
- `{"op":"choose","role":"flanker","context":"arena","allowed":["flank_left","flank_right"],"baseline":false}` → `{decision_id: number, action: string, probabilities: [{action, probability}], baseline: boolean}`. Deterministic seeded sampling; no masked action can be selected. Baseline uses uniform sampling and never trains. Bounded pending decisions.
- `{"op":"feedback","decision_id":1,"reward":0.7,"observed":true}` → `{accepted:boolean}`. Reward must be finite and in [-1,1]. Unknown or duplicate decision is an error. `observed:false` consumes the decision without training. Feedback queues evidence; it does not change policy immediately.
- `{"op":"commit"}` → same shape as inspect. Aggregate pending rewards per cell, decay scores toward zero, take a bounded update toward mean reward. One encounter = one commit. Clear unresolved decisions so rewards never cross encounter boundaries. Samples/counts only count observed, adaptive feedback. Without any observed adaptive evidence, scores and sample counts remain unchanged (including no decay). No combat parameters are part of learning.
- `{"op":"inspect"}` → `{version:1, encounter:number, pending:number, queued:number, cells:[{role,context,action,score,samples,probability}]}`. Probability shown over all configured actions for the role, before runtime masks. Stable ordering.
- `{"op":"snapshot"}` → versioned JSON snapshot object (including RNG state). Only allowed at a clean encounter boundary; do not silently drop queued data.
- `{"op":"restore","snapshot":{...}}` → inspect. Validate version, exact config compatibility, identifiers, scores, counts and bounds before replacing state. Reject corrupted snapshots without mutating engine. Current state must be at a clean boundary. Restoring into a used engine retains its decision-ID high-water mark to reject stale feedback; use a fresh engine for exact replay including IDs.
- `{"op":"age","steps":1}` → inspect. Explicit host-driven forgetting at a clean boundary. Accepts 1–100 steps, each shrinking scores by the configured decay subject to max_update. Preserves sample counts, encounter, RNG and decision IDs. Never invoke for a frozen evaluation condition. This is separate from commit's no-evidence freeze.

Wrappers: wasm-bindgen `TacticalEngine(config_json: string)`, `.request(json): string`; native opaque `ta_engine_new(const char*)`, `ta_engine_request(handle,const char*)`, `ta_string_free(char*)`, `ta_engine_free(handle)`. Error ownership and pointer safety documented in C header. Engine instances are independent, single-owner mutable objects. JSON is a prototype boundary, never per render frame.

## Arena

Separate browser sample: TypeScript and Canvas. Three roles above, six authored tactics. Fixed combat rules and visible telegraphs. Real collisions and line of sight; no attacks or training evidence through walls. Memory persists between encounters. Start with a readable top-down geometric arena inspired by our diagram. Include manual play, automatic demonstration, frozen baseline, memory reset, and inspectable scores. Make adaptation timing and baseline mode clear. Auto demonstration must run the same world/combat/outcome code as manual play, not preset score changes. Learning has no hard-coded player-style-to-tactic lookup.

The `policy.ts` adapter owns initialization of Wasm and a typed request helper; the simulation consumes an injected policy interface so simulation tests can run without the DOM. Root integrator owns that adapter and workspace tooling. Arena implementer owns the rest of apps/arena.

## Validation

Meaningful library tests: reward-driven preference (including reversed reward mapping), adaptation after change, legal masks, unobserved/baseline/duplicate feedback, bounded commits, deterministic snapshot/replay, hostile snapshot rejection. Native C smoke test. Browser must load actual compiled Wasm and complete encounters through the same core. Controlled benchmark results are evidence of algorithm behavior, not proof the game is fun. Human counterplay playtest remains necessary.
