mod commands;
mod core;
mod error;
mod state;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let db = core::index::db::open(&dir.join("index.sqlite")).expect("open index db");
            app.manage(AppState::new(db));
            Ok(())
        })
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
