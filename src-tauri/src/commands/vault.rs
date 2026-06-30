//! Vault-aware IPC: open a folder, browse the tree/tags, and read/write docs by
//! their vault-relative id. The SQLite index lives in `<vault>/.typedown/` so it
//! is scoped to the vault. Write paths lock the vault (outer) then the db (inner)
//! to keep a consistent lock order.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};

use crate::core::index::{db, query, scan};
use crate::core::model::{DocumentContent, DocumentMeta, SearchHit, TagNode, TreeNode, VaultInfo};
use crate::core::storage::document;
use crate::core::vault::Vault;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

fn no_vault() -> AppError {
    AppError::Other("no vault is open".into())
}

/// Record the mtime of a file the app just wrote, so the watcher ignores the
/// event it triggers (self-write suppression).
fn record_write(state: &AppState, rel: &str, abs: &Path) {
    if let Some(secs) = std::fs::metadata(abs)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
    {
        state.suppress.lock().unwrap().insert(rel.to_string(), secs.as_secs() as i64);
    }
}

#[tauri::command]
pub fn open_vault(path: String, app: AppHandle, state: State<AppState>) -> AppResult<VaultInfo> {
    let root = PathBuf::from(&path);

    // Vault-scoped index under <vault>/.typedown/ (a dot-dir, so it's skipped by
    // the scanner). Drop a .gitignore so the index isn't committed.
    let meta_dir = root.join(".typedown");
    std::fs::create_dir_all(&meta_dir)?;
    let gitignore = meta_dir.join(".gitignore");
    if !gitignore.exists() {
        std::fs::write(&gitignore, "# typedown index — not part of your notes\n*\n")?;
    }

    let vault = Vault::new(root);
    let mut conn = db::open(&meta_dir.join("index.sqlite"))?;
    scan::rescan(&mut conn, &vault)?;
    let info = query::vault_info(&conn, &path)?;

    *state.db.lock().unwrap() = Some(conn);
    *state.vault.lock().unwrap() = Some(vault);
    state.suppress.lock().unwrap().clear();

    // Watch the vault for external changes.
    crate::watcher::start(&app);
    Ok(info)
}

#[tauri::command]
pub fn get_tree(state: State<AppState>) -> AppResult<Vec<TreeNode>> {
    let guard = state.db.lock().unwrap();
    query::build_tree(guard.as_ref().ok_or_else(no_vault)?)
}

#[tauri::command]
pub fn get_tag_tree(state: State<AppState>) -> AppResult<Vec<TagNode>> {
    let guard = state.db.lock().unwrap();
    query::build_tag_tree(guard.as_ref().ok_or_else(no_vault)?)
}

#[tauri::command]
pub fn list_documents(state: State<AppState>) -> AppResult<Vec<DocumentMeta>> {
    let guard = state.db.lock().unwrap();
    query::list_documents(guard.as_ref().ok_or_else(no_vault)?)
}

#[tauri::command]
pub fn documents_by_tag(tag: String, state: State<AppState>) -> AppResult<Vec<DocumentMeta>> {
    let guard = state.db.lock().unwrap();
    query::documents_by_tag(guard.as_ref().ok_or_else(no_vault)?, &tag)
}

#[tauri::command]
pub fn search(
    query: String,
    tag: Option<String>,
    limit: Option<i64>,
    state: State<AppState>,
) -> AppResult<Vec<SearchHit>> {
    let guard = state.db.lock().unwrap();
    let db = guard.as_ref().ok_or_else(no_vault)?;
    // `query` (param) shadows the module, so call it by its absolute path.
    crate::core::index::query::search(db, &query, tag.as_deref(), limit)
}

#[tauri::command]
pub fn read_document(rel_path: String, state: State<AppState>) -> AppResult<DocumentContent> {
    let guard = state.vault.lock().unwrap();
    let vault = guard.as_ref().ok_or_else(no_vault)?;
    let content = document::read_document(&vault.abs_path(&rel_path))?;
    Ok(DocumentContent { rel_path, content })
}

#[tauri::command]
pub fn write_document(
    rel_path: String,
    content: String,
    state: State<AppState>,
) -> AppResult<DocumentMeta> {
    let vguard = state.vault.lock().unwrap();
    let vault = vguard.as_ref().ok_or_else(no_vault)?;
    let abs = vault.abs_path(&rel_path);
    document::write_document(&abs, &content)?;
    record_write(&state, &rel_path, &abs);

    let mut dguard = state.db.lock().unwrap();
    let db = dguard.as_mut().ok_or_else(no_vault)?;
    scan::reindex_one(db, vault, &rel_path)?;
    query::document_meta(db, &rel_path)
}

#[tauri::command]
pub fn create_document(
    folder: String,
    title: String,
    state: State<AppState>,
) -> AppResult<DocumentMeta> {
    let vguard = state.vault.lock().unwrap();
    let vault = vguard.as_ref().ok_or_else(no_vault)?;

    let stem = slugify(&title);
    let mut rel = join_rel(&folder, &format!("{stem}.md"));
    let mut n = 2;
    while vault.abs_path(&rel).exists() {
        rel = join_rel(&folder, &format!("{stem}-{n}.md"));
        n += 1;
    }
    let abs = vault.abs_path(&rel);
    document::write_document(&abs, &format!("# {title}\n\n"))?;
    record_write(&state, &rel, &abs);

    let mut dguard = state.db.lock().unwrap();
    let db = dguard.as_mut().ok_or_else(no_vault)?;
    scan::reindex_one(db, vault, &rel)?;
    query::document_meta(db, &rel)
}

#[tauri::command]
pub fn delete_document(rel_path: String, state: State<AppState>) -> AppResult<()> {
    let vguard = state.vault.lock().unwrap();
    let vault = vguard.as_ref().ok_or_else(no_vault)?;
    let abs = vault.abs_path(&rel_path);
    if abs.exists() {
        std::fs::remove_file(&abs)?;
    }
    let mut dguard = state.db.lock().unwrap();
    scan::remove_one(dguard.as_mut().ok_or_else(no_vault)?, &rel_path)?;
    Ok(())
}

fn join_rel(folder: &str, name: &str) -> String {
    if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    }
}

/// Filesystem-safe slug for a new document's filename.
fn slugify(title: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in title.trim().chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let slug = out.trim_matches('-').to_string();
    if slug.is_empty() {
        "untitled".into()
    } else {
        slug
    }
}
