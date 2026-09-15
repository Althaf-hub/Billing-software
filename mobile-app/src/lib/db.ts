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

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
      conflict_flagged INTEGER DEFAULT 0,
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

export async function getOwnSales(userId: string, period: 'today' | 'week') {
  const db = await getDb();
  const since = period === 'today' ? "date('now')" : "date('now', '-6 days')";
  return db.getAllAsync(
    `SELECT * FROM sales WHERE sold_by = ? AND date(created_at) >= ${since} ORDER BY created_at DESC`,
    [userId],
  );
}

export async function findProductByBarcode(barcode: string) {
  const db = await getDb();
  return db.getFirstAsync<{ id: string; name: string; price: number; stock_qty: number }>(
    'SELECT * FROM products WHERE barcode = ?', [barcode],
  );
}

export async function addCustomer(shopId: string, name: string, phone: string) {
  const db = await getDb();
  const id = uuidv4();
  await db.runAsync(
    'INSERT INTO customers (id, shop_id, name, phone, credit_balance) VALUES (?, ?, ?, ?, 0)',
    [id, shopId, name.trim(), phone.trim() || null],
  );
  return id;
}

export async function getMeta(key: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [key, value]);
}

export async function getPendingSales() {
  const db = await getDb();
  return db.getAllAsync<{
    id: string; customer_id: string | null; discount_amount: number; total_amount: number;
    payment_mode: string; device_id: string | null; created_at: string;
  }>('SELECT * FROM sales WHERE synced = 0 ORDER BY created_at');
}

export async function getSaleItems(saleId: string) {
  const db = await getDb();
  return db.getAllAsync<{ product_id: string; quantity: number; price_at_sale: number }>(
    'SELECT product_id, quantity, price_at_sale FROM sale_items WHERE sale_id = ?', [saleId],
  );
}

export async function markSalesSynced(
  saleIds: string[],
  invoiceNumbers: Record<string, number>,
  flaggedIds: string[] = [],
) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const saleId of saleIds) {
      const isConflict = flaggedIds.includes(saleId) ? 1 : 0;
      await transaction.runAsync(
        'UPDATE sales SET synced = 1, invoice_number = COALESCE(?, invoice_number), conflict_flagged = ? WHERE id = ?',
        [invoiceNumbers[saleId] ?? null, isConflict, saleId],
      );
      await transaction.runAsync(
        `UPDATE products SET synced = 1 WHERE id IN (SELECT product_id FROM sale_items WHERE sale_id = ?)`,
        [saleId],
      );
    }
    // Mark all other pending tables as synced
    await transaction.runAsync('UPDATE credit_payments SET synced = 1 WHERE synced = 0');
    await transaction.runAsync('UPDATE expenses SET synced = 1 WHERE synced = 0');
    await transaction.runAsync('UPDATE purchases SET synced = 1 WHERE synced = 0');
  });
}

export async function applyRemoteCatalog(products: any[], customers: any[]) {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const product of products) {
      await transaction.runAsync(
        `INSERT OR REPLACE INTO products (id, shop_id, name, barcode, price, stock_qty, low_stock_threshold, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [product.id, product.shop_id, product.name, product.barcode ?? null, product.price, product.stock_qty,
          product.low_stock_threshold ?? 5, product.updated_at ?? new Date().toISOString()],
      );
    }
    for (const customer of customers) {
      await transaction.runAsync(
        `INSERT OR REPLACE INTO customers (id, shop_id, name, phone, credit_balance, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customer.id, customer.shop_id, customer.name, customer.phone ?? null, customer.credit_balance ?? 0,
          customer.created_at ?? new Date().toISOString()],
      );
    }
  });
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

export async function getPendingCreditPayments() {
  const db = await getDb();
  return db.getAllAsync<{
    id: string;
    customer_id: string;
    amount: number;
    received_by: string | null;
    created_at: string;
  }>('SELECT id, customer_id, amount, received_by, created_at FROM credit_payments WHERE synced = 0 ORDER BY created_at');
}

export async function getPendingExpenses() {
  const db = await getDb();
  return db.getAllAsync<{
    id: string;
    label: string;
    amount: number;
    created_at: string;
  }>('SELECT id, label, amount, created_at FROM expenses WHERE synced = 0 ORDER BY created_at');
}

export async function getPendingPurchases() {
  const db = await getDb();
  const purchases = await db.getAllAsync<{
    id: string;
    vendor_id: string | null;
    total_amount: number;
    is_return: number;
    created_by: string | null;
    created_at: string;
  }>('SELECT id, vendor_id, total_amount, is_return, created_by, created_at FROM purchases WHERE synced = 0 ORDER BY created_at');

  // Attach items to each purchase
  return Promise.all(
    purchases.map(async (purchase) => ({
      ...purchase,
      items: await db.getAllAsync<{ product_id: string; quantity: number; cost_price: number }>(
        'SELECT product_id, quantity, cost_price FROM purchase_items WHERE purchase_id = ?',
        [purchase.id],
      ),
    })),
  );
}

export async function getPendingSyncCount() {
  const db = await getDb();
  const salesCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM sales WHERE synced = 0');
  const productsCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM products WHERE synced = 0');
  const creditCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM credit_payments WHERE synced = 0');
  const expenseCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM expenses WHERE synced = 0');
  const purchaseCount = await db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM purchases WHERE synced = 0');
  return (salesCount?.count || 0) + (productsCount?.count || 0) + (creditCount?.count || 0) + (expenseCount?.count || 0) + (purchaseCount?.count || 0);
}
