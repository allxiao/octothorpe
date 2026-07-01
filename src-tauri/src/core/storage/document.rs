use std::fs;
use std::path::Path;

use crate::error::{AppError, AppResult};

/// Read a UTF-8 markdown file from disk.
pub fn read_document(path: &Path) -> AppResult<String> {
    Ok(fs::read_to_string(path)?)
}

/// Write content to a file atomically: write a sibling temp file, then rename
/// over the target. `fs::rename` replaces the destination on both Unix and
/// Windows, so readers never observe a partially-written file.
pub fn write_document(path: &Path, content: &str) -> AppResult<()> {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Other(format!("invalid file path: {}", path.display())))?;
    let dir = path.parent().unwrap_or_else(|| Path::new("."));

    let tmp = dir.join(format!(".{file_name}.tmp"));
    fs::write(&tmp, content)?;
    if let Err(e) = fs::rename(&tmp, path) {
        // Best-effort cleanup of the temp file if the rename failed.
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_content() {
        let dir = std::env::temp_dir().join("octothorpe_test_storage");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("note.md");

        write_document(&path, "# Hello\n\nworld\n").unwrap();
        let read = read_document(&path).unwrap();
        assert_eq!(read, "# Hello\n\nworld\n");

        // Overwrite replaces atomically and leaves no temp file behind.
        write_document(&path, "changed").unwrap();
        assert_eq!(read_document(&path).unwrap(), "changed");
        assert!(!dir.join(".note.md.tmp").exists());

        fs::remove_dir_all(&dir).ok();
    }
}
