-- ============================================================
-- Local SQLite Schema
-- Same as cloud schema minus `shops`. Includes `synced` flag.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin','salesman')) DEFAULT 'salesman',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT,
  price REAL NOT NULL,
  stock_qty INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  synced INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  credit_balance REAL DEFAULT 0,
  credit_limit REAL DEFAULT 5000,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sold_by TEXT NOT NULL REFERENCES users(id),
  customer_id TEXT REFERENCES customers(id),
  invoice_number INTEGER, -- Set by cloud later
  discount_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  payment_mode TEXT CHECK (payment_mode IN ('cash','upi','card','credit')),
  device_id TEXT,
  synced INTEGER DEFAULT 0,
  conflict_flagged INTEGER DEFAULT 0, -- Set to 1 by server when sale would take stock negative
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
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL,
  received_by TEXT REFERENCES users(id),
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  vendor_id TEXT REFERENCES vendors(id),
  total_amount REAL NOT NULL,
  is_return INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  synced INTEGER DEFAULT 0,
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
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  synced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
