//! Vault-aware IPC: open a folder, browse the tree/tags, and read/write docs by
//! their vault-relative id. All write paths lock the vault (outer) then the db
//! (inner) to keep a consistent lock order.

use std::path::PathBuf;

use tauri::State;

use crate::core::index::{query, scan};
use crate::core::model::{DocumentContent, DocumentMeta, TagNode, TreeNode, VaultInfo};
use crate::core::storage::document;
use crate::core::vault::Vault;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

fn no_vault() -> AppError {
    AppError::Other("no vault is open".into())
}

#[tauri::command]
pub fn open_vault(path: String, state: State<AppState>) -> AppResult<VaultInfo> {
    let vault = Vault::new(PathBuf::from(&path));
    {
        let mut db = state.db.lock().unwrap();
        scan::rescan(&mut db, &vault)?;
    }
    let info = {
        let db = state.db.lock().unwrap();
        query::vault_info(&db, &path)?
    };
    *state.vault.lock().unwrap() = Some(vault);
    Ok(info)
}

#[tauri::command]
pub fn get_tree(state: State<AppState>) -> AppResult<Vec<TreeNode>> {
    query::build_tree(&state.db.lock().unwrap())
}

#[tauri::command]
pub fn get_tag_tree(state: State<AppState>) -> AppResult<Vec<TagNode>> {
    query::build_tag_tree(&state.db.lock().unwrap())
}

#[tauri::command]
pub fn list_documents(state: State<AppState>) -> AppResult<Vec<DocumentMeta>> {
    query::list_documents(&state.db.lock().unwrap())
}

#[tauri::command]
pub fn documents_by_tag(tag: String, state: State<AppState>) -> AppResult<Vec<DocumentMeta>> {
    query::documents_by_tag(&state.db.lock().unwrap(), &tag)
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
    let guard = state.vault.lock().unwrap();
    let vault = guard.as_ref().ok_or_else(no_vault)?;
    document::write_document(&vault.abs_path(&rel_path), &content)?;
    let mut db = state.db.lock().unwrap();
    scan::reindex_one(&mut db, vault, &rel_path)?;
    query::document_meta(&db, &rel_path)
}

#[tauri::command]
pub fn create_document(
    folder: String,
    title: String,
    state: State<AppState>,
) -> AppResult<DocumentMeta> {
    let guard = state.vault.lock().unwrap();
    let vault = guard.as_ref().ok_or_else(no_vault)?;

    let stem = slugify(&title);
    let mut rel = join_rel(&folder, &format!("{stem}.md"));
    let mut n = 2;
    while vault.abs_path(&rel).exists() {
        rel = join_rel(&folder, &format!("{stem}-{n}.md"));
        n += 1;
    }

    document::write_document(&vault.abs_path(&rel), &format!("# {title}\n\n"))?;
    let mut db = state.db.lock().unwrap();
    scan::reindex_one(&mut db, vault, &rel)?;
    query::document_meta(&db, &rel)
}

#[tauri::command]
pub fn delete_document(rel_path: String, state: State<AppState>) -> AppResult<()> {
    let guard = state.vault.lock().unwrap();
    let vault = guard.as_ref().ok_or_else(no_vault)?;
    let abs = vault.abs_path(&rel_path);
    if abs.exists() {
        std::fs::remove_file(&abs)?;
    }
    scan::remove_one(&mut state.db.lock().unwrap(), &rel_path)?;
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
