# Integrating Tactical AIR

The portable Rust core owns a small contextual bandit: legal-action selection, feedback, encounter updates, deterministic random state, and snapshots. A host owns observations, action implementation, collision/line of sight, combat rules, and the meaning of a reward. The library does not inspect a world or infer those meanings. The same core is exposed through WebAssembly and a C ABI; see [contract.md](contract.md) for the exact JSON operations.

These are an adapter foundation for Unity and Unreal, not tested engine plugins. There is no Unity package, Unreal module, Blueprint integration, engine editor UI, networking layer, console certification, or engine-specific build pipeline. The browser arena is a separate host using the Wasm wrapper.

## Host lifecycle

1. Configure a finite vocabulary of role IDs, context IDs, and authored action IDs. IDs are data; the host maps each action to its behavior.
2. At a tactical decision, derive context from available observations and pass only currently legal actions in `allowed`. Do not call this JSON boundary every render frame.
3. Execute the chosen action and retain its `decision_id`. Submit feedback once, with `observed:false` when no legitimate outcome was observed. Baseline choices do not train.
4. At the encounter boundary call `commit`. Feedback changes scores only at this boundary; unresolved decisions are cleared.
5. Save `snapshot` only at a clean boundary. Restore into a matching configuration; check the success envelope before using restored state.

Keep game rules outside the learned scores. A high score cannot grant an otherwise masked action, damage through a wall, alter health, or remove a telegraph. The host remains responsible for building its mask and measuring outcomes correctly. Give each independent policy its own handle. A shared policy across enemies is an intentional host choice; do not accidentally share a handle between concurrent threads.

## WebAssembly

`crates/tactical-air-wasm` pins `wasm-bindgen` to **0.2.129**. The CLI must match that version when generating bindings. From the repository root:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
cargo build --release --target wasm32-unknown-unknown -p tactical-air-wasm
wasm-bindgen target/wasm32-unknown-unknown/release/tactical_air_wasm.wasm \
  --target web --out-dir target/wasm-web --out-name tactical_air
```

These manual commands use Cargo's default `target/` directory; adjust the paths if overriding `CARGO_TARGET_DIR`. Serve the output over HTTP with JavaScript and Wasm assets together; the arena's build scripts do this for its own generated files.

```js
import init, { TacticalEngine } from './tactical_air.js';
await init();
const engine = new TacticalEngine(JSON.stringify(config));
function request(message) {
  const result = JSON.parse(engine.request(JSON.stringify(message)));
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
try {
  const decision = request({
    op: 'choose', role: 'vanguard', context: 'arena',
    allowed: ['hold'], baseline: false,
  });
  // Execute this authored tactic before supplying its actual observed outcome.
  request({ op: 'feedback', decision_id: decision.decision_id,
            reward: 0.7, observed: true });
  request({ op: 'commit' });
} finally {
  engine.free();
}
```

The example's `config` must define these IDs, as in contract.md. Its reward is illustrative; production adapters calculate it from events. Construction throws a JavaScript exception for malformed/invalid configuration. Requests return a JSON error envelope for validation failures, including malformed JSON. Generated `.free()` releases the instance; never call methods afterward. Unexpected internal panics can trap the Wasm instance, so recreate it rather than assuming recoverable policy state. No browser/JS callbacks are invoked by the core.

## Native C ABI

```sh
cargo build --release -p tactical-air-ffi
bash scripts/test-ffi.sh
```

The build emits a shared library and static library. Native shared-library filenames are `libtactical_air_ffi.dylib` on macOS, `libtactical_air_ffi.so` on Linux, and `tactical_air_ffi.dll` on Windows. Use the library built for the host's CPU/OS; macOS results do not establish Windows, Linux, mobile, or console support. Include [`tactical_air.h`](../crates/tactical-air-ffi/include/tactical_air.h). Define `TA_STATIC` when statically linking on Windows; supply the platform's Rust runtime link dependencies through the host build system.

`scripts/test-ffi.sh` supports macOS and Linux with Cargo, a C compiler, and Python 3. It builds the shared library, compiles actual C against its header and library, then executes that binary. It checks malformed/null/invalid-UTF-8 input, a legal-action mask, observed feedback, duplicate rejection, commit counts, snapshot restoration, seeded replay, and independent returned-string lifetimes. It is not a Unity/Unreal or all-platform test.

| Function | Ownership and error result |
| --- | --- |
| `ta_engine_new(config)` | Returns one owned opaque handle, or null. Copy `ta_last_error()` immediately on failure. |
| `ta_engine_request(handle, json)` | Returns an owned NUL-terminated UTF-8 JSON envelope. Both success and error responses must be freed. |
| `ta_string_free(response)` | Frees one response exactly once. Null is a no-op. |
| `ta_engine_free(handle)` | Frees one handle exactly once, with no request active. Null is a no-op. |
| `ta_last_error()` | Borrowed thread-local constructor/ABI diagnostic or null. Never free it. Valid until the next new/request on that thread or thread exit. Core request validation errors are in their JSON responses. |

Strings passed in must be valid readable NUL-terminated buffers for the entire call; the first NUL ends the string. Non-null handles must originate from this same loaded library and remain live and exclusively accessible during each request. Do not edit returned buffers or free them with another allocator. Dangling pointers, concurrent use/free, missing terminators, and double frees are caller undefined behavior; Rust cannot validate arbitrary C addresses. Input buffers can be released as soon as a call returns, and responses can outlive their handle.

Expected validation failures never unwind across the C boundary. Native entry points contain Rust panics; an engine whose request panics is marked unusable and must be destroyed. Keep the default Rust unwind strategy for containment. `panic=abort`, out-of-memory aborts, and invalid foreign pointers are not recoverable. A host should still treat a null response as a fatal allocation/boundary failure.

## C++ adapter sketch

This is ordinary C++17 usable as the basis of an Unreal native module. It does not use Unreal reflection or engine types. Link the matching native library and configure its runtime search path/package location.

```cpp
#include "tactical_air.h"
#include <memory>
#include <stdexcept>
#include <string>

using EnginePtr = std::unique_ptr<TaEngine, decltype(&ta_engine_free)>;
using JsonPtr = std::unique_ptr<char, decltype(&ta_string_free)>;

EnginePtr make_policy(const std::string& config) {
    EnginePtr engine(ta_engine_new(config.c_str()), &ta_engine_free);
    if (!engine) {
        const char* error = ta_last_error();
        throw std::runtime_error(error ? error : "policy construction failed");
    }
    return engine;
}

std::string request(TaEngine* engine, const std::string& json) {
    JsonPtr response(ta_engine_request(engine, json.c_str()), &ta_string_free);
    if (!response) throw std::runtime_error("policy returned no response");
    return std::string(response.get());
}
```

Parse the returned envelope with the host's JSON library and check `ok`; the sketch deliberately returns the envelope rather than treating every response as a successful action. For Unreal, the integration work still includes a module/build rule, platform library staging, UTF-8 conversion from engine strings, and ownership tied to the desired encounter/session lifetime.

## C# adapter sketch

This adapter uses P/Invoke, explicit UTF-8, and `SafeHandle` ownership. It is a starting point for a desktop Unity integration and has not been executed in Unity or IL2CPP. Package the correct native library in the host's plugin directory and configure platform import settings. Unity WebGL would need a separate JavaScript/Wasm bridge rather than desktop P/Invoke.

```csharp
using System;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class NativePolicy {
    const string Lib = "tactical_air_ffi";
    [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
    internal static extern IntPtr ta_engine_new(
        [MarshalAs(UnmanagedType.LPUTF8Str)] string json);
    [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
    internal static extern IntPtr ta_engine_request(PolicyHandle handle,
        [MarshalAs(UnmanagedType.LPUTF8Str)] string json);
    [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
    internal static extern IntPtr ta_last_error();
    [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
    internal static extern void ta_string_free(IntPtr text);
    [DllImport(Lib, CallingConvention = CallingConvention.Cdecl)]
    internal static extern void ta_engine_free(IntPtr handle);

    internal static string Utf8(IntPtr text) {
        if (text == IntPtr.Zero) return "native policy returned no text";
        int length = 0;
        while (Marshal.ReadByte(text, length) != 0) checked { length++; }
        byte[] bytes = new byte[length];
        Marshal.Copy(text, bytes, 0, length);
        return Encoding.UTF8.GetString(bytes);
    }
}

internal sealed class PolicyHandle : SafeHandleZeroOrMinusOneIsInvalid {
    internal PolicyHandle(string config) : base(true) {
        SetHandle(NativePolicy.ta_engine_new(config));
        if (IsInvalid)
            throw new InvalidOperationException(NativePolicy.Utf8(NativePolicy.ta_last_error()));
    }
    protected override bool ReleaseHandle() {
        NativePolicy.ta_engine_free(handle);
        return true;
    }
    internal string Request(string json) {
        // SafeHandle keeps the native allocation alive through this P/Invoke call.
        IntPtr response = NativePolicy.ta_engine_request(this, json);
        if (response == IntPtr.Zero) throw new InvalidOperationException("No native response");
        try { return NativePolicy.Utf8(response); }
        finally { NativePolicy.ta_string_free(response); }
    }
}
```

Use `using (var policy = new PolicyHandle(configJson)) { ... }`, or retain and dispose it at the end of its session. Parse each request result as JSON and check `ok`. `SafeHandle` protects allocation lifetime; it does **not** serialize concurrent requests. Call from one host thread or protect every request with one lock. Do not pass strings containing literal NUL characters.

Production adapters still need their own lifecycle, serialization/reload versioning, authoritative networking decisions, observed-event attribution, and platform packaging. Preserve the invariant that only the host can enact a tactic and that learning cannot modify the authored combat rules.
