use rusqlite::Connection;

use crate::error::AppResult;

/// Apply the schema. The index is rebuildable, so a single idempotent v1 schema
/// is sufficient for now; future versions can branch on the `schema_version`
/// row in `meta` (or simply wipe and rescan).
pub fn run(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT
        );

        CREATE TABLE IF NOT EXISTS folders (
            id       INTEGER PRIMARY KEY,
            rel_path TEXT NOT NULL UNIQUE,
            parent   TEXT NOT NULL DEFAULT '',
            name     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS documents (
            id           INTEGER PRIMARY KEY,
            rel_path     TEXT NOT NULL UNIQUE,
            folder       TEXT NOT NULL DEFAULT '',
            title        TEXT NOT NULL,
            mtime        INTEGER NOT NULL,
            size         INTEGER NOT NULL,
            content_hash TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);

        -- One row per as-written tag path (leaf), e.g. "recipes/italian".
        CREATE TABLE IF NOT EXISTS tags (
            id   INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS document_tags (
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (document_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_doctags_tag ON document_tags(tag_id);
        "#,
    )?;
    Ok(())
}
