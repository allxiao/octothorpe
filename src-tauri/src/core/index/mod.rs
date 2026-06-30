//! SQLite index over the vault. The database is a derived, disposable cache:
//! deleting it and reopening the vault reproduces identical state.

pub mod db;
pub mod migrations;
pub mod query;
pub mod scan;
