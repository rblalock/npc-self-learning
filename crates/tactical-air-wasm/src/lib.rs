//! Small JSON bridge; policy and validation live in `tactical-air-core`.

use tactical_air_core::{Config, Engine};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct TacticalEngine {
    inner: Engine,
}

#[wasm_bindgen]
impl TacticalEngine {
    /// Throws a JavaScript exception for malformed JSON or invalid configuration.
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<TacticalEngine, JsValue> {
        let config: Config = serde_json::from_str(config_json)
            .map_err(|error| JsValue::from_str(&format!("invalid config JSON: {error}")))?;
        let inner = Engine::new(config).map_err(|error| JsValue::from_str(&error.to_string()))?;
        Ok(Self { inner })
    }

    /// Returns the core's JSON success/error envelope; malformed requests are data errors.
    pub fn request(&mut self, json: &str) -> String {
        self.inner.request(json)
    }
}
