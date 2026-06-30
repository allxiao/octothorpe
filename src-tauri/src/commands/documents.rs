use std::path::PathBuf;

use crate::core::storage::document;
use crate::error::AppResult;

/// Read a UTF-8 file from disk. (M0: path-based; M2 will switch to vault ids.)
#[tauri::command]
pub fn read_file(path: String) -> AppResult<String> {
    document::read_document(&PathBuf::from(path))
}

/// Write content to a file atomically (temp file + rename).
#[tauri::command]
pub fn write_file(path: String, content: String) -> AppResult<()> {
    document::write_document(&PathBuf::from(path), &content)
}
