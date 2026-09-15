import * as SQLite from 'expo-sqlite';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export const DB_NAME = 'billing.db';

export async function getDb() {
  return await SQLite.openDatabaseAsync(DB_NAME);
}

export async function initDb() {
  const db = await getDb();
  
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK (role IN ('admin','salesman')) DEFAULT 'salesman',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      barcode TEXT,
      price REAL NOT NULL,
      stock_qty INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 5,
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      credit_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      sold_by TEXT NOT NULL REFERENCES users(id),
      customer_id TEXT REFERENCES customers(id),
      invoice_number INTEGER,
      discount_amount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      payment_mode TEXT CHECK (payment_mode IN ('cash','upi','card','credit')),
      device_id TEXT,
      synced INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      price_at_sale REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_payments (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      amount REAL NOT NULL,
      received_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      vendor_id TEXT REFERENCES vendors(id),
      total_amount REAL NOT NULL,
      is_return INTEGER DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      cost_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      shop_id TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// Dummy data for testing while building UI
export async function seedDummyData() {
  const db = await getDb();
  
  // check if products exist
  const count = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM products');
  if (count && count.count > 0) return;

  const shopId = "test-shop-1";
  
  await db.runAsync(
    "INSERT INTO products (id, shop_id, name, price, stock_qty, barcode, synced) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uuidv4(), shopId, "Test Product 1", 100, 50, "123456789", 1]
  );
  await db.runAsync(
    "INSERT INTO products (id, shop_id, name, price, stock_qty, barcode, synced) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uuidv4(), shopId, "Test Product 2", 250.50, 100, "987654321", 1]
  );

  const customerId = uuidv4();
  await db.runAsync(
    "INSERT INTO customers (id, shop_id, name, phone, credit_balance) VALUES (?, ?, ?, ?, ?)",
    [customerId, shopId, "John Doe", "9876543210", 500]
  );
}

// Queries
export async function getProducts() {
  const db = await getDb();
  return await db.getAllAsync('SELECT * FROM products ORDER BY name');
}

export async function getCustomers() {
  const db = await getDb();
  return await db.getAllAsync('SELECT * FROM customers ORDER BY name');
}

export async function getTodaySales(userId: string) {
  const db = await getDb();
  return await db.getAllAsync(
    `SELECT * FROM sales WHERE sold_by = ? AND date(created_at) = date('now') ORDER BY created_at DESC`,
    [userId]
  );
}

export async function saveSale(sale: any, items: any[]) {
  const db = await getDb();
  const saleId = uuidv4();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sales (id, shop_id, sold_by, customer_id, total_amount, discount_amount, payment_mode, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [saleId, sale.shop_id, sale.sold_by, sale.customer_id ?? null, sale.total_amount, sale.discount_amount ?? 0, sale.payment_mode]
    );

    for (const item of items) {
      const itemId = uuidv4();
      await db.runAsync(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?)`,
        [itemId, saleId, item.product_id, item.quantity, item.price]
      );
      await db.runAsync(
        `UPDATE products SET stock_qty = stock_qty - ?, synced = 0 WHERE id = ?`,
        [item.quantity, item.product_id]
      );
    }

    if (sale.payment_mode === 'credit' && sale.customer_id) {
      await db.runAsync(
        `UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?`,
        [sale.total_amount, sale.customer_id]
      );
    }
  });

  return saleId;
}

export async function getPendingSyncCount() {
  const db = await getDb();
  // Simply summing up pending records across sales and products for the UI indicator
  const salesCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM sales WHERE synced = 0');
  const productsCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM products WHERE synced = 0');
  return (salesCount?.count || 0) + (productsCount?.count || 0);
}
