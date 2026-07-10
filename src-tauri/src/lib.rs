mod commands;
mod favicon;
mod loader;
mod pipeline;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_image,
            commands::close_image,
            commands::render_preview,
            commands::output_size,
            commands::export_image,
            commands::export_favicon,
            commands::supported_formats,
            commands::extract_palette,
            commands::data_uri,
            commands::batch_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
