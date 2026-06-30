use std::sync::Mutex;

use rusqlite::Connection;

use crate::core::vault::Vault;

/// Shared application state managed by Tauri. The database is vault-scoped: it
/// is opened (inside `<vault>/.typedown/`) when a vault is opened, so both are
/// `None` until then.
pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub vault: Mutex<Option<Vault>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            vault: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
