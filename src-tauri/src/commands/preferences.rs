use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::core::storage::document;
use crate::error::{AppError, AppResult};

/// Returned when no config file exists yet: an empty (all-default) config.
const DEFAULT_CONTENT: &str = "{\n  \"version\": 1\n}\n";

/// Global preferences file: `~/.octothorpe/preferences.json`.
fn prefs_path(app: &AppHandle) -> AppResult<PathBuf> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Other(format!("cannot resolve home directory: {e}")))?;
    Ok(home.join(".octothorpe").join("preferences.json"))
}

/// Read the raw preferences JSON, or a default `{ "version": 1 }` when absent.
/// Parsing/validation is the frontend's job (it owns the schema).
#[tauri::command]
pub fn read_preferences(app: AppHandle) -> AppResult<String> {
    let path = prefs_path(&app)?;
    if path.exists() {
        document::read_document(&path)
    } else {
        Ok(DEFAULT_CONTENT.to_string())
    }
}

/// Write the preferences JSON, creating `~/.octothorpe/` if needed. Writes
/// atomically (temp file + rename) so a crash never leaves a partial config.
#[tauri::command]
pub fn write_preferences(app: AppHandle, content: String) -> AppResult<()> {
    let path = prefs_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    document::write_document(&path, &content)
}
