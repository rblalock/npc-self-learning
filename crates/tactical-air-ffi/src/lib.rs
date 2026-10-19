//! C ABI with explicit allocation ownership. See `include/tactical_air.h`.
//!
//! An invalid non-null pointer is caller undefined behavior, not a recoverable error.

use std::cell::RefCell;
use std::ffi::{c_char, CStr, CString};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::ptr;
use tactical_air_core::{Config, Engine};

/// Opaque to callers. One owner, no concurrent requests or destruction.
pub struct TaEngine {
    inner: Engine,
    poisoned: bool,
}

thread_local! {
    static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
}

fn clear_error() {
    LAST_ERROR.with(|slot| *slot.borrow_mut() = None);
}

fn record_error(message: &str) {
    // Diagnostics remain C strings even if a future error contains a NUL.
    let message = message.replace('\0', "\\0");
    LAST_ERROR.with(|slot| *slot.borrow_mut() = CString::new(message).ok());
}

fn error_json(message: &str) -> String {
    serde_json::json!({"ok": false, "error": message}).to_string()
}

fn owned_string(value: String) -> *mut c_char {
    match CString::new(value) {
        Ok(value) => value.into_raw(),
        // Correct JSON escapes embedded NULs; this protects the ABI if a producer regresses.
        Err(_) => CString::new("{\"ok\":false,\"error\":\"response contains an unescaped NUL\"}")
            .map_or(ptr::null_mut(), CString::into_raw),
    }
}

/// # Safety
/// `value` is null or a readable, NUL-terminated byte string for this call.
unsafe fn input_string<'a>(value: *const c_char) -> Result<&'a str, &'static str> {
    if value.is_null() {
        return Err("JSON pointer is null");
    }
    // SAFETY: the caller promises a valid NUL-terminated allocation.
    unsafe { CStr::from_ptr(value) }
        .to_str()
        .map_err(|_| "JSON must be valid UTF-8")
}

/// Create an engine, or return null and expose a borrowed diagnostic via `ta_last_error`.
///
/// # Safety
/// `config_json` is null or readable NUL-terminated UTF-8 until this call returns.
#[no_mangle]
pub unsafe extern "C" fn ta_engine_new(config_json: *const c_char) -> *mut TaEngine {
    let result = catch_unwind(AssertUnwindSafe(|| {
        clear_error();
        // SAFETY: inherited from the C entry point's contract.
        let json = unsafe { input_string(config_json) }.map_err(str::to_owned)?;
        let config: Config =
            serde_json::from_str(json).map_err(|error| format!("invalid config JSON: {error}"))?;
        let inner = Engine::new(config).map_err(|error| error.to_string())?;
        Ok::<_, String>(Box::into_raw(Box::new(TaEngine {
            inner,
            poisoned: false,
        })))
    }));
    match result {
        Ok(Ok(engine)) => engine,
        Ok(Err(message)) => {
            record_error(&message);
            ptr::null_mut()
        }
        Err(_) => {
            record_error("engine construction panicked");
            ptr::null_mut()
        }
    }
}

/// Request one operation. Free the returned JSON string with `ta_string_free`.
///
/// # Safety
/// `engine` is null or a live handle created by this library. It must be exclusively
/// accessible until this call returns. `request_json` is null or a readable,
/// NUL-terminated byte string. Neither allocation may be freed during this call.
#[no_mangle]
pub unsafe extern "C" fn ta_engine_request(
    engine: *mut TaEngine,
    request_json: *const c_char,
) -> *mut c_char {
    let result = catch_unwind(AssertUnwindSafe(|| {
        clear_error();
        // SAFETY: a non-null handle is valid and exclusively owned per caller contract.
        let handle = unsafe { engine.as_mut() }.ok_or("engine handle is null")?;
        if handle.poisoned {
            return Err("engine is unusable after an internal panic; create a new engine");
        }
        // SAFETY: inherited from the C entry point's contract.
        let json = unsafe { input_string(request_json) }?;
        Ok::<_, &str>(handle.inner.request(json))
    }));
    match result {
        Ok(Ok(json)) => owned_string(json),
        Ok(Err(message)) => {
            record_error(message);
            owned_string(error_json(message))
        }
        Err(_) => {
            // The core may have partially mutated before panicking; never resume it.
            // SAFETY: this is the same valid handle, after its exclusive borrow ended.
            if let Some(handle) = unsafe { engine.as_mut() } {
                handle.poisoned = true;
            }
            let message = "engine request panicked; create a new engine";
            record_error(message);
            owned_string(error_json(message))
        }
    }
}

/// Borrow the thread's last constructor/ABI error, or null. Never free this pointer.
/// It remains valid until the next `ta_engine_new` or `ta_engine_request` on this thread.
#[no_mangle]
pub extern "C" fn ta_last_error() -> *const c_char {
    LAST_ERROR.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(ptr::null(), |value| value.as_ptr())
    })
}

/// # Safety
/// `value` is null or the unmodified allocation returned by `ta_engine_request`,
/// has not previously been freed, and is not being read elsewhere.
#[no_mangle]
pub unsafe extern "C" fn ta_string_free(value: *mut c_char) {
    if !value.is_null() {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            // SAFETY: caller transfers back this library's allocation, exactly once.
            drop(unsafe { CString::from_raw(value) });
        }));
    }
}

/// # Safety
/// `engine` is null or a live handle returned by `ta_engine_new`, no request is
/// active, and no subsequent request/free may use the handle.
#[no_mangle]
pub unsafe extern "C" fn ta_engine_free(engine: *mut TaEngine) {
    if !engine.is_null() {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            // SAFETY: caller transfers back this library's allocation, exactly once.
            drop(unsafe { Box::from_raw(engine) });
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_null_and_invalid_utf8_without_crossing_the_abi() {
        unsafe {
            assert!(ta_engine_new(ptr::null()).is_null());
            assert!(!ta_last_error().is_null());
            let invalid = [0xffu8, 0];
            assert!(ta_engine_new(invalid.as_ptr().cast()).is_null());
            assert!(CStr::from_ptr(ta_last_error())
                .to_str()
                .unwrap()
                .contains("UTF-8"));
            let result = ta_engine_request(ptr::null_mut(), ptr::null());
            let envelope: serde_json::Value =
                serde_json::from_slice(CStr::from_ptr(result).to_bytes()).unwrap();
            assert_eq!(envelope["ok"], false);
            ta_string_free(result);
            ta_string_free(ptr::null_mut());
            ta_engine_free(ptr::null_mut());
        }
    }
}
