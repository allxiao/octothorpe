//! Edit-menu commands: Markdown→HTML / plaintext conversions for the "Copy as…"
//! actions, and copying an image's pixels to the system clipboard.

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
