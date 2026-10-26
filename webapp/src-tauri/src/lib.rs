mod messages;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Filesystem and native save dialog. These are what
    // let the web code save a report or a backup when it is running inside the
    // desktop shell rather than a browser.
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    // Live price refresh. Scoped to one host in capabilities/default.json —
    // registering the plugin grants nothing on its own.
    .plugin(tauri_plugin_http::init())
    // Bank SMS from Messages, opt-in from Settings. Read-only; see messages.rs.
    .invoke_handler(tauri::generate_handler![
      messages::read_bank_messages,
      messages::open_full_disk_access_settings,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
