use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::core::storage::document;
use crate::error::AppResult;
use crate::state::AppState;

/// Read a UTF-8 file from disk (standalone, out-of-vault files).
#[tauri::command]
pub fn read_file(path: String) -> AppResult<String> {
    document::read_document(&PathBuf::from(path))
}

/// Write content to a file atomically (temp file + rename). Records the write's
/// mtime (keyed by absolute path) so the standalone file watcher ignores the
/// event it triggers (self-write suppression).
#[tauri::command]
pub fn write_file(path: String, content: String, state: State<AppState>) -> AppResult<()> {
    let abs = PathBuf::from(&path);
    document::write_document(&abs, &content)?;
    if let Some(secs) = std::fs::metadata(&abs)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    {
        state.suppress.lock().unwrap().insert(path, secs.as_secs() as i64);
    }
    Ok(())
}

/// Delete a standalone file by absolute path.
#[tauri::command]
pub fn delete_file(path: String) -> AppResult<()> {
    let p = PathBuf::from(path);
    if p.exists() {
        std::fs::remove_file(&p)?;
    }
    Ok(())
}

/// Start watching a standalone file for external changes (emits `file://changed`).
#[tauri::command]
pub fn watch_file(path: String, app: AppHandle) -> AppResult<()> {
    crate::watcher::start_file(&app, PathBuf::from(path));
    Ok(())
}

/// Stop watching the standalone file.
#[tauri::command]
pub fn unwatch_file(app: AppHandle) -> AppResult<()> {
    crate::watcher::stop_file(&app);
    Ok(())
}
