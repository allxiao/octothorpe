use std::collections::HashMap;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::core::vault::Vault;

/// Shared application state managed by Tauri. The database is vault-scoped: it
/// is opened (inside `<vault>/.typedown/`) when a vault is opened, so both are
/// `None` until then.
pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub vault: Mutex<Option<Vault>>,
    /// rel_path (vault docs) or absolute path (standalone files) -> mtime(secs)
    /// of the app's own recent writes, so the file watchers can ignore the
    /// events they trigger (self-write suppression).
    pub suppress: Mutex<HashMap<String, i64>>,
    /// Keeps the active vault watcher alive; replacing it stops the old one.
    pub watcher: Mutex<Option<Box<dyn std::any::Any + Send>>>,
    /// Keeps the watcher for a standalone (out-of-vault) file alive; replacing
    /// it stops the old one.
    pub file_watcher: Mutex<Option<Box<dyn std::any::Any + Send>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: Mutex::new(None),
            vault: Mutex::new(None),
            suppress: Mutex::new(HashMap::new()),
            watcher: Mutex::new(None),
            file_watcher: Mutex::new(None),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
