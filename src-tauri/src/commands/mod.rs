//! Thin IPC layer. Each command deserializes arguments, calls into `core`, and
//! maps errors. No business logic lives here.

pub mod documents;
pub mod system;
pub mod vault;
