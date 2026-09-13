use rusqlite::{params, Connection, Result, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{State, Manager};
use uuid::Uuid;

pub struct DbState(pub Mutex<Option<Connection>>);

#[derive(Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub name: String,
    pub barcode: Option<String>,
    pub price: f64,
    pub stock_qty: i32,
    pub low_stock_threshold: i32,
    pub synced: i32,
}

#[derive(Serialize, Deserialize)]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub credit_balance: f64,
    pub synced: i32,
}

#[derive(Serialize, Deserialize)]
pub struct SaleItemInput {
    pub product_id: String,
    pub quantity: i32,
    pub price_at_sale: f64,
}

#[derive(Serialize, Deserialize)]
pub struct SaleInput {
    pub sold_by: String,
    pub customer_id: Option<String>,
    pub discount_amount: f64,
    pub total_amount: f64,
    pub payment_mode: Option<String>,
    pub device_id: Option<String>,
    pub items: Vec<SaleItemInput>,
}

#[derive(Serialize, Deserialize)]
pub struct PurchaseItemInput {
    pub product_id: String,
    pub quantity: i32,
    pub cost_price: f64,
}

#[derive(Serialize, Deserialize)]
pub struct PurchaseInput {
    pub vendor_id: Option<String>,
    pub total_amount: f64,
    pub created_by: Option<String>,
    pub items: Vec<PurchaseItemInput>,
}

#[derive(Serialize, Deserialize)]
pub struct ExpenseInput {
    pub label: String,
    pub amount: f64,
}

#[tauri::command]
pub fn init_db(app_handle: tauri::AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    // Determine path (in memory for now, or app data dir)
    let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    
    let db_path = app_dir.join("local.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let schema = include_str!("schema.sql");
    conn.execute_batch(schema).map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn save_sale(state: State<'_, DbState>, sale: SaleInput) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("DB not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // Check stock for warnings (we allow negative stock as requested)
    let mut warnings = Vec::new();
    for item in &sale.items {
        let current_stock: i32 = tx.query_row(
            "SELECT stock_qty FROM products WHERE id = ?",
            [&item.product_id],
            |row| row.get(0)
        ).map_err(|e| e.to_string())?;
        
        if current_stock - item.quantity < 0 {
            warnings.push(format!("Warning: Product {} will have negative stock.", item.product_id));
        }
    }

    let sale_id = Uuid::new_v4().to_string();

    tx.execute(
        "INSERT INTO sales (id, sold_by, customer_id, discount_amount, total_amount, payment_mode, device_id, synced)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
        params![
            sale_id,
            sale.sold_by,
            sale.customer_id,
            sale.discount_amount,
            sale.total_amount,
            sale.payment_mode,
            sale.device_id
        ],
    ).map_err(|e| e.to_string())?;

    for item in sale.items {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item_id, sale_id, item.product_id, item.quantity, item.price_at_sale],
        ).map_err(|e| e.to_string())?;

        // Deduct stock
        tx.execute(
            "UPDATE products SET stock_qty = stock_qty - ?1, synced = 0, updated_at = datetime('now') WHERE id = ?2",
            params![item.quantity, item.product_id],
        ).map_err(|e| e.to_string())?;
    }

    if let (Some(mode), Some(customer_id)) = (sale.payment_mode, sale.customer_id) {
        if mode == "credit" {
            let amount_to_credit = sale.total_amount - sale.discount_amount;
            tx.execute(
                "UPDATE customers SET credit_balance = credit_balance + ?1, synced = 0 WHERE id = ?2",
                params![amount_to_credit, customer_id],
            ).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Return warnings alongside success if needed, for simplicity we return the sale_id (if they want warnings, we could wrap in a struct)
    // For now we just return sale_id. If frontend needs warnings, it should be part of a custom JSON response.
    // Let's just return JSON with id and warnings.
    let response = serde_json::json!({
        "id": sale_id,
        "warnings": warnings
    });
    Ok(response.to_string())
}

#[tauri::command]
pub fn get_products(state: State<'_, DbState>) -> Result<Vec<Product>, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut stmt = conn.prepare("SELECT id, name, barcode, price, stock_qty, low_stock_threshold, synced FROM products").map_err(|e| e.to_string())?;
    let product_iter = stmt.query_map([], |row| {
        Ok(Product {
            id: row.get(0)?,
            name: row.get(1)?,
            barcode: row.get(2)?,
            price: row.get(3)?,
            stock_qty: row.get(4)?,
            low_stock_threshold: row.get(5)?,
            synced: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut products = Vec::new();
    for p in product_iter {
        products.push(p.map_err(|e| e.to_string())?);
    }
    Ok(products)
}

#[tauri::command]
pub fn update_stock(state: State<'_, DbState>, product_id: String, delta: i32) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    conn.execute(
        "UPDATE products SET stock_qty = stock_qty + ?1, synced = 0, updated_at = datetime('now') WHERE id = ?2",
        params![delta, product_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_customer(state: State<'_, DbState>, name: String, phone: Option<String>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO customers (id, name, phone, synced) VALUES (?1, ?2, ?3, 0)",
        params![id, name, phone],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn record_credit_payment(state: State<'_, DbState>, customer_id: String, amount: f64, received_by: Option<String>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("DB not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let payment_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO credit_payments (id, customer_id, amount, received_by, synced) VALUES (?1, ?2, ?3, ?4, 0)",
        params![payment_id, customer_id, amount, received_by],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "UPDATE customers SET credit_balance = MAX(0, credit_balance - ?1), synced = 0 WHERE id = ?2",
        params![amount, customer_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_purchase(state: State<'_, DbState>, purchase: PurchaseInput, is_return: bool) -> Result<String, String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("DB not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    let purchase_id = Uuid::new_v4().to_string();
    let return_val = if is_return { 1 } else { 0 };

    tx.execute(
        "INSERT INTO purchases (id, vendor_id, total_amount, is_return, created_by, synced) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
        params![purchase_id, purchase.vendor_id, purchase.total_amount, return_val, purchase.created_by],
    ).map_err(|e| e.to_string())?;

    for item in purchase.items {
        let item_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO purchase_items (id, purchase_id, product_id, quantity, cost_price) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![item_id, purchase_id, item.product_id, item.quantity, item.cost_price],
        ).map_err(|e| e.to_string())?;

        let stock_delta = if is_return { -item.quantity } else { item.quantity };
        tx.execute(
            "UPDATE products SET stock_qty = stock_qty + ?1, synced = 0, updated_at = datetime('now') WHERE id = ?2",
            params![stock_delta, item.product_id],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(purchase_id)
}

#[tauri::command]
pub fn save_expense(state: State<'_, DbState>, expense: ExpenseInput) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO expenses (id, label, amount, synced) VALUES (?1, ?2, ?3, 0)",
        params![id, expense.label, expense.amount],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn get_pending_sync(state: State<'_, DbState>) -> Result<String, String> {
    // For simplicity, we can return JSON strings of arrays for each table where synced = 0
    // This is a minimal implementation.
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut sales_stmt = conn.prepare("SELECT id, sold_by, customer_id, discount_amount, total_amount, payment_mode, device_id, created_at FROM sales WHERE synced = 0").map_err(|e| e.to_string())?;
    
    // We would serialize these manually or use a struct. Let's use serde_json inline to build it.
    let sales: Vec<serde_json::Value> = sales_stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, String>(0)?,
            "sold_by": row.get::<_, String>(1)?,
            "customer_id": row.get::<_, Option<String>>(2)?,
            "discount_amount": row.get::<_, f64>(3)?,
            "total_amount": row.get::<_, f64>(4)?,
            "payment_mode": row.get::<_, Option<String>>(5)?,
            "device_id": row.get::<_, Option<String>>(6)?,
            "created_at": row.get::<_, String>(7)?,
            // items would need to be fetched separately, or we just rely on client to pull them.
            // For full robustness we should fetch items here as well.
        }))
    }).map_err(|e| e.to_string())?.filter_map(Result::ok).collect();

    // In a real app we fetch all items for each sale here, but the sync structure depends on exact payload API expects.
    
    let result = serde_json::json!({
        "sales": sales
    });
    
    Ok(result.to_string())
}

#[tauri::command]
pub fn mark_synced(state: State<'_, DbState>, table: String, id: String) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    // Very basic sanitization, only allow specific tables
    if !["sales", "products", "customers", "credit_payments", "purchases", "expenses", "vendors"].contains(&table.as_str()) {
        return Err("Invalid table name".into());
    }

    let sql = format!("UPDATE {} SET synced = 1 WHERE id = ?1", table);
    conn.execute(&sql, params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn backup_db(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let db_path = app_dir.join("local.db");
    
    // create a backup folder if not exists
    let backup_dir = app_dir.join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let backup_filename = format!("backup_{}.db", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let backup_path = backup_dir.join(&backup_filename);

    std::fs::copy(&db_path, &backup_path).map_err(|e| e.to_string())?;

    Ok(backup_path.to_string_lossy().to_string())
}
