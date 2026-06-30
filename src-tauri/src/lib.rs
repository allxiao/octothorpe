mod commands;
mod core;
mod error;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::documents::read_file,
            commands::documents::write_file,
            commands::vault::open_vault,
            commands::vault::get_tree,
            commands::vault::get_tag_tree,
            commands::vault::list_documents,
            commands::vault::documents_by_tag,
            commands::vault::read_document,
            commands::vault::write_document,
            commands::vault::create_document,
            commands::vault::delete_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
