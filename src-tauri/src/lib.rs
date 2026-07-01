mod commands;
mod core;
mod error;
mod state;
mod watcher;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::documents::read_file,
            commands::documents::write_file,
            commands::documents::delete_file,
            commands::documents::watch_file,
            commands::documents::unwatch_file,
            commands::vault::open_vault,
            commands::vault::open_path,
            commands::vault::get_tree,
            commands::vault::get_tag_tree,
            commands::vault::list_documents,
            commands::vault::documents_by_tag,
            commands::vault::search,
            commands::vault::read_document,
            commands::vault::write_document,
            commands::vault::create_document,
            commands::vault::delete_document,
            commands::system::new_window,
            commands::system::startup_options,
            commands::system::show_properties,
            commands::system::reveal_in_dir,
            commands::system::open_url,
            commands::edit::markdown_to_html,
            commands::edit::markdown_to_plaintext,
            commands::edit::copy_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
