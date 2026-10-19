#ifndef TACTICAL_AIR_H
#define TACTICAL_AIR_H

#if defined(_WIN32) && !defined(TA_STATIC)
#define TA_API __declspec(dllimport)
#else
#define TA_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Opaque, single-owner mutable state. Different handles are independent.
 * Serialize all accesses to a handle; never free it during a request.
 * Input strings must be readable NUL-terminated UTF-8, alive for the call.
 * This API cannot detect dangling pointers, undersized allocations or double free.
 * Such violations are undefined behavior. JSON is an encounter/tactic boundary,
 * not a per-render-frame transport. See docs/contract.md for operations.
 */
typedef struct TaEngine TaEngine;

/* NULL on malformed JSON, invalid UTF-8/configuration or internal Rust panic.
 * A NULL config is rejected. Retrieve a diagnostic with ta_last_error().
 * Success allocates a handle that must be released once with ta_engine_free().
 */
TA_API TaEngine *ta_engine_new(const char *config_json);

/* An owned UTF-8 JSON envelope: {"ok":true,"data":...} or
 * {"ok":false,"error":"..."}. NULL handle/input and malformed JSON are errors.
 * Free every returned non-NULL string once with ta_string_free(), even on errors.
 * Do not modify a returned buffer. Multiple responses may remain alive at once.
 * Never free a response using free(), delete, Marshal.FreeHGlobal or another DLL.
 * An internal panic poisons the handle; destroy and recreate it before continuing.
 * Allocation failure may abort the process; callers should still handle NULL.
 */
TA_API char *ta_engine_request(TaEngine *engine, const char *request_json);

/* Borrowed thread-local constructor/ABI diagnostic, or NULL if absent.
 * Request-level validation errors are in the returned JSON envelope.
 * Valid until the next new/request call on this thread, or thread exit.
 * Copy immediately if retaining it; never pass it to ta_string_free().
 */
TA_API const char *ta_last_error(void);

/* NULL is a no-op. Each non-NULL pointer must originate from the corresponding
 * allocator above, and must not have been freed before. Rust panics do not unwind
 * across these C functions. Process aborts, OOM, and invalid pointers are not
 * recoverable errors; keep Rust's default unwind panic strategy for containment.
 */
TA_API void ta_string_free(char *value);
TA_API void ta_engine_free(TaEngine *engine);

#ifdef __cplusplus
}
#endif
#endif
