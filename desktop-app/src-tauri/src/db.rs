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
    pub credit_limit: f64,
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

/// Argument type for mark_sales_synced — maps local sale id to the server-assigned invoice number.
#[derive(Serialize, Deserialize)]
pub struct SyncedSaleEntry {
    pub id: String,
    pub invoice_number: Option<i64>,
    pub conflict_flagged: Option<i32>,
}

/// Row type for a product coming back from the pull response.
#[derive(Serialize, Deserialize)]
pub struct RemoteProduct {
    pub id: String,
    pub name: String,
    pub barcode: Option<String>,
    pub price: f64,
    pub stock_qty: i32,
    pub low_stock_threshold: Option<i32>,
    pub updated_at: Option<String>,
}

/// Row type for a customer coming back from the pull response.
#[derive(Serialize, Deserialize)]
pub struct RemoteCustomer {
    pub id: String,
    pub name: String,
    pub phone: Option<String>,
    pub credit_balance: Option<f64>,
    pub created_at: Option<String>,
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
    // Migrate devices created before credit limits were introduced.
    let _ = conn.execute("ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 5000", []);

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
pub fn get_customers(state: State<'_, DbState>) -> Result<Vec<Customer>, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn.prepare("SELECT id, name, phone, credit_balance, credit_limit, synced FROM customers ORDER BY name").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| Ok(Customer { id: row.get(0)?, name: row.get(1)?, phone: row.get(2)?, credit_balance: row.get(3)?, credit_limit: row.get(4)?, synced: row.get(5)? })).map_err(|e| e.to_string())?;
    rows.map(|row| row.map_err(|e| e.to_string())).collect()
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
pub fn save_customer(state: State<'_, DbState>, name: String, phone: Option<String>, credit_limit: Option<f64>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO customers (id, name, phone, credit_limit, synced) VALUES (?1, ?2, ?3, ?4, 0)",
        params![id, name, phone, credit_limit.unwrap_or(5000.0)],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn record_credit_payment(state: State<'_, DbState>, customer_id: String, amount: f64, received_by: Option<String>) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("DB not initialized")?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let balance: f64 = tx.query_row("SELECT credit_balance FROM customers WHERE id = ?", [&customer_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    if amount <= 0.0 || amount > balance { return Err("Payment must be positive and cannot exceed the outstanding balance".into()); }
    
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
pub fn get_customer_statement(state: State<'_, DbState>, customer_id: String) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let customer: serde_json::Value = conn.query_row("SELECT json_object('id', id, 'name', name, 'phone', phone, 'credit_balance', credit_balance, 'credit_limit', credit_limit) FROM customers WHERE id = ?", [&customer_id], |row| row.get(0)).map_err(|e| e.to_string()).and_then(|raw: String| serde_json::from_str(&raw).map_err(|e| e.to_string()))?;
    let mut stmt = conn.prepare("SELECT created_at, 'sale' AS type, total_amount - discount_amount AS amount, invoice_number AS reference FROM sales WHERE customer_id = ? AND payment_mode = 'credit' UNION ALL SELECT created_at, 'payment' AS type, -amount AS amount, id AS reference FROM credit_payments WHERE customer_id = ? ORDER BY created_at").map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![customer_id, customer_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?, row.get::<_, Option<String>>(3)?))).map_err(|e| e.to_string())?;
    let mut balance = 0.0; let mut entries = Vec::new();
    for row in rows { let (created_at, kind, amount, reference) = row.map_err(|e| e.to_string())?; balance += amount; entries.push(serde_json::json!({"created_at":created_at,"type":kind,"amount":amount,"reference":reference,"running_balance":balance})); }
    Ok(serde_json::json!({"customer": customer, "entries": entries}).to_string())
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
pub fn get_expenses(state: State<'_, DbState>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT id, label, amount, created_at FROM expenses ORDER BY created_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "label": row.get::<_, String>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    Ok(serde_json::to_string(&rows).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn get_vendors(state: State<'_, DbState>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT id, name, phone, created_at FROM vendors ORDER BY name",
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "phone": row.get::<_, Option<String>>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    Ok(serde_json::to_string(&rows).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn save_vendor(state: State<'_, DbState>, name: String, phone: Option<String>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO vendors (id, name, phone, synced) VALUES (?1, ?2, ?3, 0)",
        params![id, name.trim(), phone],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn get_purchases(state: State<'_, DbState>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut stmt = conn.prepare(
        "SELECT p.id, p.vendor_id, v.name AS vendor_name, p.total_amount, p.is_return, p.created_at
         FROM purchases p
         LEFT JOIN vendors v ON p.vendor_id = v.id
         ORDER BY p.created_at DESC",
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "vendor_id": row.get::<_, Option<String>>(1)?,
                "vendor_name": row.get::<_, Option<String>>(2)?,
                "total_amount": row.get::<_, f64>(3)?,
                "is_return": row.get::<_, i32>(4)?,
                "created_at": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    Ok(serde_json::to_string(&rows).map_err(|e| e.to_string())?)
}



#[tauri::command]
pub fn get_pending_sync(state: State<'_, DbState>) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    // ── Pending sales (with their items) ──────────────────────────────────────
    let mut sales_stmt = conn
        .prepare(
            "SELECT id, sold_by, customer_id, discount_amount, total_amount, \
             payment_mode, device_id, created_at \
             FROM sales WHERE synced = 0 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;

    let sale_rows: Vec<(String, serde_json::Value)> = sales_stmt
        .query_map([], |row| {
            let sale_id: String = row.get(0)?;
            Ok((
                sale_id.clone(),
                serde_json::json!({
                    "id": sale_id,
                    "sold_by": row.get::<_, String>(1)?,
                    "customer_id": row.get::<_, Option<String>>(2)?,
                    "discount_amount": row.get::<_, f64>(3)?,
                    "total_amount": row.get::<_, f64>(4)?,
                    "payment_mode": row.get::<_, Option<String>>(5)?,
                    "device_id": row.get::<_, Option<String>>(6)?,
                    "created_at": row.get::<_, String>(7)?,
                }),
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    // For each pending sale, fetch its line items
    let mut sales: Vec<serde_json::Value> = Vec::new();
    for (sale_id, mut sale_json) in sale_rows {
        let mut items_stmt = conn
            .prepare(
                "SELECT product_id, quantity, price_at_sale \
                 FROM sale_items WHERE sale_id = ?",
            )
            .map_err(|e| e.to_string())?;

        let items: Vec<serde_json::Value> = items_stmt
            .query_map([&sale_id], |row| {
                Ok(serde_json::json!({
                    "product_id": row.get::<_, String>(0)?,
                    "quantity": row.get::<_, i32>(1)?,
                    "price_at_sale": row.get::<_, f64>(2)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();

        sale_json["items"] = serde_json::Value::Array(items);
        sales.push(sale_json);
    }

    // ── Pending credit payments ───────────────────────────────────────────────
    let mut cp_stmt = conn
        .prepare(
            "SELECT id, customer_id, amount, received_by, created_at \
             FROM credit_payments WHERE synced = 0 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let credit_payments: Vec<serde_json::Value> = cp_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "customer_id": row.get::<_, String>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "received_by": row.get::<_, Option<String>>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    // ── Pending expenses ──────────────────────────────────────────────────────
    let mut exp_stmt = conn
        .prepare(
            "SELECT id, label, amount, created_at FROM expenses WHERE synced = 0 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let expenses: Vec<serde_json::Value> = exp_stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "label": row.get::<_, String>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    // ── Pending purchases (with items) ────────────────────────────────────────
    let mut pur_stmt = conn
        .prepare(
            "SELECT id, vendor_id, total_amount, is_return, created_by, created_at \
             FROM purchases WHERE synced = 0 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let purchase_rows: Vec<(String, serde_json::Value)> = pur_stmt
        .query_map([], |row| {
            let pur_id: String = row.get(0)?;
            Ok((
                pur_id.clone(),
                serde_json::json!({
                    "id": pur_id,
                    "vendor_id": row.get::<_, Option<String>>(1)?,
                    "total_amount": row.get::<_, f64>(2)?,
                    "is_return": row.get::<_, i32>(3)?,
                    "created_by": row.get::<_, Option<String>>(4)?,
                    "created_at": row.get::<_, String>(5)?,
                }),
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    let mut purchases: Vec<serde_json::Value> = Vec::new();
    for (pur_id, mut pur_json) in purchase_rows {
        let mut pi_stmt = conn
            .prepare(
                "SELECT product_id, quantity, cost_price FROM purchase_items WHERE purchase_id = ?",
            )
            .map_err(|e| e.to_string())?;
        let items: Vec<serde_json::Value> = pi_stmt
            .query_map([&pur_id], |row| {
                Ok(serde_json::json!({
                    "product_id": row.get::<_, String>(0)?,
                    "quantity": row.get::<_, i32>(1)?,
                    "cost_price": row.get::<_, f64>(2)?,
                }))
            })
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        pur_json["items"] = serde_json::Value::Array(items);
        purchases.push(pur_json);
    }

    let result = serde_json::json!({
        "sales": sales,
        "credit_payments": credit_payments,
        "expenses": expenses,
        "purchases": purchases,
    });
    Ok(result.to_string())
}

/// After a successful push, update local sales with the server-assigned invoice numbers
/// and mark them synced. Conflict-flagged sales are also marked (conflict_flagged = 1).
#[tauri::command]
pub fn mark_sales_synced(
    state: State<'_, DbState>,
    entries: Vec<SyncedSaleEntry>,
    flagged_ids: Vec<String>,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    for entry in &entries {
        let is_flagged: i32 = if flagged_ids.contains(&entry.id) { 1 } else { 0 };
        conn.execute(
            "UPDATE sales SET synced = 1, invoice_number = COALESCE(?, invoice_number), \
             conflict_flagged = ? WHERE id = ?",
            params![entry.invoice_number, is_flagged, entry.id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Mark all other pending tables synced too (credit_payments, expenses, purchases)
    // Simple approach: mark everything synced = 0 → 1 that was sent
    conn.execute_batch(
        "UPDATE credit_payments SET synced = 1 WHERE synced = 0; \
         UPDATE expenses SET synced = 1 WHERE synced = 0; \
         UPDATE purchases SET synced = 1 WHERE synced = 0;",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Apply catalog data pulled from the server — upserts products and customers.
/// Also upserts any remote sales that don't exist locally (from other devices).
#[tauri::command]
pub fn apply_remote_catalog(
    state: State<'_, DbState>,
    products: Vec<RemoteProduct>,
    customers: Vec<RemoteCustomer>,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    for product in &products {
        conn.execute(
            "INSERT INTO products \
             (id, name, barcode, price, stock_qty, low_stock_threshold, updated_at, synced) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1) \
             ON CONFLICT(id) DO UPDATE SET \
               name = excluded.name, \
               barcode = excluded.barcode, \
               price = excluded.price, \
               stock_qty = excluded.stock_qty, \
               low_stock_threshold = excluded.low_stock_threshold, \
               updated_at = excluded.updated_at, \
               synced = 1",
            params![
                product.id,
                product.name,
                product.barcode,
                product.price,
                product.stock_qty,
                product.low_stock_threshold.unwrap_or(5),
                product.updated_at,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    for customer in &customers {
        conn.execute(
            "INSERT INTO customers (id, name, phone, credit_balance, created_at, synced) \
             VALUES (?1, ?2, ?3, ?4, ?5, 1) \
             ON CONFLICT(id) DO UPDATE SET \
               name = excluded.name, \
               phone = excluded.phone, \
               credit_balance = excluded.credit_balance, \
               synced = 1",
            params![
                customer.id,
                customer.name,
                customer.phone,
                customer.credit_balance.unwrap_or(0.0),
                customer.created_at,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
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
