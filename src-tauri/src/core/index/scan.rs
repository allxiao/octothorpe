//! Walk the vault and (re)build the index. Documents on disk are the source of
//! truth; this populates the rebuildable SQLite cache.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use rusqlite::{params, Connection, Transaction};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::core::tags::{ancestor_paths, extract_tags};
use crate::core::vault::{extract_title, split_parent, Vault};
use crate::error::AppResult;

/// Full rescan: clear the index and rebuild it from disk.
pub fn rescan(conn: &mut Connection, vault: &Vault) -> AppResult<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM document_tags", [])?;
    tx.execute("DELETE FROM documents", [])?;
    tx.execute("DELETE FROM folders", [])?;
    tx.execute("DELETE FROM tags", [])?;
    tx.execute("DELETE FROM documents_fts", [])?;

    for entry in WalkDir::new(&vault.root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        let rel = match vault.rel_path(path) {
            Some(r) if !r.is_empty() => r,
            _ => continue,
        };
        // Skip dotfiles / dot-directories (e.g. .git, .obsidian).
        if rel.split('/').any(|s| s.starts_with('.')) {
            continue;
        }
        if entry.file_type().is_dir() {
            let (parent, name) = split_parent(&rel);
            tx.execute(
                "INSERT OR IGNORE INTO folders (rel_path, parent, name) VALUES (?1, ?2, ?3)",
                params![rel, parent, name],
            )?;
        } else if entry.file_type().is_file() && is_markdown(path) {
            index_file(&tx, vault, &rel)?;
        }
    }

    tx.commit()?;
    Ok(())
}

/// Reindex a single document after it is written, ensuring its folders exist.
pub fn reindex_one(conn: &mut Connection, vault: &Vault, rel: &str) -> AppResult<()> {
    let tx = conn.transaction()?;
    ensure_folders(&tx, rel)?;
    index_file(&tx, vault, rel)?;
    prune_tags(&tx)?;
    tx.commit()?;
    Ok(())
}

/// Remove a document from the index (after its file is deleted).
pub fn remove_one(conn: &mut Connection, rel: &str) -> AppResult<()> {
    use rusqlite::OptionalExtension;
    let tx = conn.transaction()?;
    let id: Option<i64> = tx
        .query_row("SELECT id FROM documents WHERE rel_path = ?1", params![rel], |r| r.get(0))
        .optional()?;
    if let Some(id) = id {
        tx.execute("DELETE FROM documents_fts WHERE rowid = ?1", params![id])?;
    }
    tx.execute("DELETE FROM documents WHERE rel_path = ?1", params![rel])?;
    prune_tags(&tx)?;
    tx.commit()?;
    Ok(())
}

fn index_file(tx: &Transaction, vault: &Vault, rel: &str) -> AppResult<()> {
    let abs = vault.abs_path(rel);
    let meta = fs::metadata(&abs)?;
    let content = fs::read_to_string(&abs)?;

    let (folder, file_name) = split_parent(rel);
    let stem = file_name
        .strip_suffix(".markdown")
        .or_else(|| file_name.strip_suffix(".md"))
        .unwrap_or(&file_name);
    let title = extract_title(&content, stem);
    let body = crate::core::markdown::segment_cjk(&crate::core::markdown::to_plaintext(&content));

    // UPSERT keyed on rel_path so the document's id (and thus the FTS rowid) is
    // stable across reindexes.
    tx.execute(
        "INSERT INTO documents (rel_path, folder, title, mtime, size, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(rel_path) DO UPDATE SET
             folder = excluded.folder, title = excluded.title, mtime = excluded.mtime,
             size = excluded.size, content_hash = excluded.content_hash",
        params![
            rel,
            folder,
            title,
            mtime_secs(&meta),
            meta.len() as i64,
            sha256_hex(content.as_bytes())
        ],
    )?;
    let doc_id: i64 =
        tx.query_row("SELECT id FROM documents WHERE rel_path = ?1", params![rel], |r| {
            r.get(0)
        })?;

    // Link the document to each as-written tag path it contains.
    tx.execute("DELETE FROM document_tags WHERE document_id = ?1", params![doc_id])?;
    let leaf_tags: BTreeSet<String> = extract_tags(&content).into_iter().collect();
    for tag in leaf_tags {
        tx.execute("INSERT OR IGNORE INTO tags (path) VALUES (?1)", params![tag])?;
        let tag_id: i64 =
            tx.query_row("SELECT id FROM tags WHERE path = ?1", params![tag], |r| r.get(0))?;
        tx.execute(
            "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
            params![doc_id, tag_id],
        )?;
    }

    // Keep the full-text row (rowid == documents.id) in sync. Title is also
    // CJK-segmented so non-spaced scripts are searchable.
    tx.execute("DELETE FROM documents_fts WHERE rowid = ?1", params![doc_id])?;
    tx.execute(
        "INSERT INTO documents_fts (rowid, title, body) VALUES (?1, ?2, ?3)",
        params![doc_id, crate::core::markdown::segment_cjk(&title), body],
    )?;
    Ok(())
}

/// Insert folder rows for every ancestor directory of a document path.
fn ensure_folders(tx: &Transaction, rel: &str) -> AppResult<()> {
    for anc in ancestor_paths(&split_parent(rel).0) {
        let (parent, name) = split_parent(&anc);
        tx.execute(
            "INSERT OR IGNORE INTO folders (rel_path, parent, name) VALUES (?1, ?2, ?3)",
            params![anc, parent, name],
        )?;
    }
    Ok(())
}

/// Drop tag rows no longer referenced by any document.
fn prune_tags(tx: &Transaction) -> AppResult<()> {
    tx.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM document_tags)",
        [],
    )?;
    Ok(())
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref(),
        Some("md") | Some("markdown")
    )
}

fn mtime_secs(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
