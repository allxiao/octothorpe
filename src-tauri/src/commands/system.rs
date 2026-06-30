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

/// Show the OS's native file-properties dialog for a file.
#[tauri::command]
pub fn show_properties(path: String) -> AppResult<()> {
    show_properties_impl(&path)
}

/// Reveal a file in the OS file manager, selecting it.
#[tauri::command]
pub fn reveal_in_dir(path: String) -> AppResult<()> {
    reveal_in_dir_impl(&path)
}

// --- Properties: per-OS native dialog -------------------------------------

#[cfg(windows)]
fn show_properties_impl(path: &str) -> AppResult<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    // Null-terminated wide path, owned by the thread so the pointer stays valid.
    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // The "properties" verb opens the same sheet as right-click → Properties.
    // Run on a dedicated STA thread so we don't disturb Tauri's worker threads.
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        ShellExecuteW(
            None,
            w!("properties"),
            PCWSTR(wide.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn show_properties_impl(path: &str) -> AppResult<()> {
    let escaped = path.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "tell application \"Finder\"\nactivate\nopen information window of (POSIX file \"{escaped}\" as alias)\nend tell"
    );
    std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .spawn()
        .map_err(|e| AppError::Other(format!("osascript failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn show_properties_impl(path: &str) -> AppResult<()> {
    // Best-effort: ask the desktop's file manager (D-Bus) to show properties;
    // fall back to revealing the containing folder.
    let uri = format!("file://{path}");
    let dbus = std::process::Command::new("dbus-send")
        .args([
            "--session",
            "--print-reply",
            "--dest=org.freedesktop.FileManager1",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItemProperties",
            &format!("array:string:{uri}"),
            "string:",
        ])
        .status();
    match dbus {
        Ok(s) if s.success() => Ok(()),
        _ => reveal_in_dir_impl(path),
    }
}

// --- Reveal in file manager: per-OS ---------------------------------------

#[cfg(windows)]
fn reveal_in_dir_impl(path: &str) -> AppResult<()> {
    use std::os::windows::process::CommandExt;
    // raw_arg keeps `/select,"<path>"` intact (std quoting would wrap the whole
    // argument and Explorer would fail to select).
    std::process::Command::new("explorer")
        .raw_arg(format!("/select,\"{path}\""))
        .spawn()
        .map_err(|e| AppError::Other(format!("explorer failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn reveal_in_dir_impl(path: &str) -> AppResult<()> {
    std::process::Command::new("open")
        .args(["-R", path])
        .spawn()
        .map_err(|e| AppError::Other(format!("open failed: {e}")))?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn reveal_in_dir_impl(path: &str) -> AppResult<()> {
    let parent = std::path::Path::new(path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ".".into());
    std::process::Command::new("xdg-open")
        .arg(parent)
        .spawn()
        .map_err(|e| AppError::Other(format!("xdg-open failed: {e}")))?;
    Ok(())
}
