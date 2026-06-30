//! OS-integration commands: spawning new windows (as separate processes) and
//! reading launch options.

use crate::error::{AppError, AppResult};

/// Open a new Typedown window by spawning a fresh process. Each process owns its
/// state (folder + index + watcher), so windows are fully independent. `--new-window`
/// makes the child start without restoring the last folder; `--untitled` opens it
/// on an empty buffer.
#[tauri::command]
pub fn new_window(untitled: bool) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("cannot locate executable: {e}")))?;
    let mut cmd = std::process::Command::new(exe);
    cmd.arg("--new-window");
    if untitled {
        cmd.arg("--untitled");
    }
    cmd.spawn()
        .map_err(|e| AppError::Other(format!("failed to open new window: {e}")))?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupOptions {
    /// Launched as a New Window — the frontend skips restoring the last folder.
    pub blank: bool,
    /// Open an empty untitled buffer on launch.
    pub untitled: bool,
}

/// Report how this process was launched (see [`new_window`]).
#[tauri::command]
pub fn startup_options() -> StartupOptions {
    let args: Vec<String> = std::env::args().collect();
    StartupOptions {
        blank: args.iter().any(|a| a == "--new-window"),
        untitled: args.iter().any(|a| a == "--untitled"),
    }
}
