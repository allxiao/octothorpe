//! Edit-menu commands: Markdown→HTML / plaintext conversions for the "Copy as…"
//! actions, and copying an image's pixels to the system clipboard.

use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::error::{AppError, AppResult};

/// Render Markdown to an HTML fragment (GFM: strikethrough, tables, task lists).
#[tauri::command]
pub fn markdown_to_html(markdown: String) -> String {
    use pulldown_cmark::{html, Options, Parser};

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(&markdown, opts);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

/// Strip Markdown syntax, leaving the visible prose (for "Copy as Plain Text").
#[tauri::command]
pub fn markdown_to_plaintext(markdown: String) -> String {
    crate::core::markdown::to_plaintext(&markdown)
}

/// Decode a local image file and place its pixels on the system clipboard.
/// Remote (`http(s)`) and `data:` sources are not supported yet.
#[tauri::command]
pub fn copy_image(src: String, app: AppHandle) -> AppResult<()> {
    if src.starts_with("http://") || src.starts_with("https://") || src.starts_with("data:") {
        return Err(AppError::Other(
            "only local images can be copied for now".into(),
        ));
    }

    let bytes = std::fs::read(&src)?;
    let rgba = image::load_from_memory(&bytes)
        .map_err(|e| AppError::Other(format!("could not decode image: {e}")))?
        .to_rgba8();
    let (width, height) = rgba.dimensions();

    let img = tauri::image::Image::new(rgba.as_raw(), width, height);
    app.clipboard()
        .write_image(&img)
        .map_err(|e| AppError::Other(format!("clipboard write failed: {e}")))?;
    Ok(())
}

/// Pick a non-colliding path in `dir` for `file_name`, appending `-1`, `-2`, … .
fn dedup_path(dir: &Path, file_name: &str) -> PathBuf {
    let target = dir.join(file_name);
    if !target.exists() {
        return target;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = p.extension().and_then(|s| s.to_str());
    let mut n = 1;
    loop {
        let candidate = match ext {
            Some(e) => format!("{stem}-{n}.{e}"),
            None => format!("{stem}-{n}"),
        };
        let target = dir.join(candidate);
        if !target.exists() {
            return target;
        }
        n += 1;
    }
}

/// Copy a local image file into `dest_dir` (created if needed), avoiding name
/// collisions. Returns the absolute path of the copy.
#[tauri::command]
pub fn copy_image_into(src: String, dest_dir: String) -> AppResult<String> {
    let src_path = Path::new(&src);
    let dir = PathBuf::from(&dest_dir);
    std::fs::create_dir_all(&dir)?;
    let file_name = src_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Other(format!("invalid image path: {src}")))?;
    let target = dedup_path(&dir, file_name);
    std::fs::copy(src_path, &target)?;
    Ok(target.to_string_lossy().to_string())
}

/// Write image bytes (e.g. a downloaded online image) into `dest_dir` under
/// `name` (created if needed), avoiding collisions. Returns the absolute path.
#[tauri::command]
pub fn save_image_bytes(dest_dir: String, name: String, bytes: Vec<u8>) -> AppResult<String> {
    let dir = PathBuf::from(&dest_dir);
    std::fs::create_dir_all(&dir)?;
    let target = dedup_path(&dir, &name);
    std::fs::write(&target, &bytes)?;
    Ok(target.to_string_lossy().to_string())
}
