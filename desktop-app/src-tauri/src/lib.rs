// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(db::DbState(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            db::init_db,
            db::save_sale,
            db::get_products,
            db::get_customers,
            db::update_stock,
            db::save_customer,
            db::record_credit_payment,
            db::get_customer_statement,
            db::save_purchase,
            db::save_expense,
            db::get_pending_sync,
            db::mark_synced,
            db::mark_sales_synced,
            db::apply_remote_catalog,
            db::backup_db
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
