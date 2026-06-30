//! Filesystem watcher: keeps the index in sync with external changes to the
//! vault (other editors, git pull, sync clients) and notifies the frontend via
//! a `vault://changed` event. The app's own writes are suppressed by mtime so
//! they don't cause reload flicker.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use tauri::{AppHandle, Emitter, Manager};

use crate::core::index::scan;
use crate::state::AppState;

const DEBOUNCE_MS: u64 = 400;

/// Start (or restart) watching the currently-open vault. Replacing the stored
/// debouncer drops and stops any previous one.
pub fn start(app: &AppHandle) {
    let root = {
        let state = app.state::<AppState>();
        let vault = state.vault.lock().unwrap();
        match vault.as_ref() {
            Some(v) => v.root.clone(),
            None => return,
        }
    };

    let handle = app.clone();
    let debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let paths: BTreeSet<PathBuf> =
                    events.into_iter().flat_map(|e| e.paths.clone()).collect();
                if !paths.is_empty() {
                    process(&handle, paths);
                }
            }
        },
    );

    let mut debouncer = match debouncer {
        Ok(d) => d,
        Err(_) => return,
    };
    if debouncer
        .watcher()
        .watch(root.as_path(), RecursiveMode::Recursive)
        .is_err()
    {
        return;
    }
    debouncer.cache().add_root(root.as_path(), RecursiveMode::Recursive);

    *app.state::<AppState>().watcher.lock().unwrap() = Some(Box::new(debouncer));
}

/// Reconcile a batch of changed paths against the index, then emit the result.
fn process(app: &AppHandle, paths: BTreeSet<PathBuf>) {
    let state = app.state::<AppState>();

    // Lock order matches the write commands (vault outer, db inner).
    let vault_guard = state.vault.lock().unwrap();
    let vault = match vault_guard.as_ref() {
        Some(v) => v,
        None => return,
    };
    let mut db_guard = state.db.lock().unwrap();
    let db = match db_guard.as_mut() {
        Some(d) => d,
        None => return,
    };

    let mut updated: Vec<String> = Vec::new();
    let mut removed: Vec<String> = Vec::new();

    for path in paths {
        let rel = match vault.rel_path(&path) {
            Some(r) if !r.is_empty() => r,
            _ => continue,
        };
        // Ignore dot-dirs (.typedown index, .git, ...).
        if rel.split('/').any(|s| s.starts_with('.')) {
            continue;
        }

        if path.is_file() {
            if !is_markdown(&path) {
                continue;
            }
            // Skip the app's own writes (matched by mtime).
            let m = mtime_secs(&path);
            {
                let mut sup = state.suppress.lock().unwrap();
                if sup.get(&rel).copied() == Some(m) {
                    sup.remove(&rel);
                    continue;
                }
            }
            if scan::reindex_one(db, vault, &rel).is_ok() {
                updated.push(rel);
            }
        } else if !path.exists() {
            // Deleted file or directory.
            if scan::remove_path(db, &rel).is_ok() {
                removed.push(rel);
            }
        }
        // Existing directories need no action: they surface via their documents.
    }

    drop(db_guard);
    drop(vault_guard);

    if !updated.is_empty() || !removed.is_empty() {
        let _ = app.emit(
            "vault://changed",
            serde_json::json!({ "updated": updated, "removed": removed }),
        );
    }
}

/// Start (or restart) watching a single standalone (out-of-vault) file. The
/// file's parent directory is watched non-recursively and events are filtered
/// to the target name, which survives our atomic temp-file+rename writes (a
/// direct file watch would break when the inode is replaced).
pub fn start_file(app: &AppHandle, path: PathBuf) {
    let parent = match path.parent() {
        Some(p) => p.to_path_buf(),
        None => return,
    };
    let target = path.clone();
    let handle = app.clone();
    let debouncer = new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                let hit = events
                    .iter()
                    .any(|e| e.paths.iter().any(|p| same_file(p, &target)));
                if hit {
                    process_file(&handle, &target);
                }
            }
        },
    );

    let mut debouncer = match debouncer {
        Ok(d) => d,
        Err(_) => return,
    };
    if debouncer
        .watcher()
        .watch(parent.as_path(), RecursiveMode::NonRecursive)
        .is_err()
    {
        return;
    }
    debouncer.cache().add_root(parent.as_path(), RecursiveMode::NonRecursive);

    *app.state::<AppState>().file_watcher.lock().unwrap() = Some(Box::new(debouncer));
}

/// Stop watching the standalone file (drops the debouncer).
pub fn stop_file(app: &AppHandle) {
    *app.state::<AppState>().file_watcher.lock().unwrap() = None;
}

/// Emit a `file://changed` event for a standalone file, suppressing the app's
/// own writes (keyed by absolute path in the shared `suppress` map).
fn process_file(app: &AppHandle, target: &Path) {
    let state = app.state::<AppState>();
    let key = target.to_string_lossy().to_string();
    let removed = !target.exists();

    if !removed {
        let m = mtime_secs(target);
        let mut sup = state.suppress.lock().unwrap();
        if sup.get(&key).copied() == Some(m) {
            sup.remove(&key);
            return;
        }
    }

    let _ = app.emit(
        "file://changed",
        serde_json::json!({ "path": key, "removed": removed }),
    );
}

/// Whether a filesystem event path refers to our watched target file.
fn same_file(p: &Path, target: &Path) -> bool {
    if p == target {
        return true;
    }
    match (p.file_name(), target.file_name(), p.parent(), target.parent()) {
        (Some(a), Some(b), Some(pp), Some(tp)) => a == b && pp == tp,
        _ => false,
    }
}

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref(),
        Some("md") | Some("markdown")
    )
}

fn mtime_secs(path: &Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
