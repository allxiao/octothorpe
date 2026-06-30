use std::sync::Mutex;

use rusqlite::Connection;

use crate::core::vault::Vault;

/// Shared application state managed by Tauri. The SQLite connection is opened at
/// startup; the vault is set when the user opens a folder.
pub struct AppState {
    pub db: Mutex<Connection>,
    pub vault: Mutex<Option<Vault>>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Mutex::new(db),
            vault: Mutex::new(None),
        }
    }
}
