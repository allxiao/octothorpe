use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;

/// Open (or create) the index database and apply migrations.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    super::migrations::run(&conn)?;
    Ok(conn)
}

/// Open an in-memory index (used in tests).
#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    super::migrations::run(&conn)?;
    Ok(conn)
}
