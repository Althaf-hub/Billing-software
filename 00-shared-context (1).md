# 00 — Shared Context

> Read this file first, in every agent session, before reading a specific module file.
> It contains what every module needs to know regardless of which one you're building.

## Project Summary
Multi-tenant, offline-first billing platform for small retail shops (2–5 products per shop).
No GST currently — shop is not GST-registered (revisit later if that changes).

- **Desktop app**: Tauri (Rust core + React frontend)
- **Mobile app**: React Native
- **Local database**: SQLite on each device — source of truth for day-to-day billing, works with zero internet
- **Cloud sync**: Cloudflare Workers (API) + D1 (database) — syncs devices when internet is available
- **Auth**: JWT-based, two roles — `admin` and `salesman`
- **Multi-tenant**: shared D1 database, isolated by `shop_id` on every table
- **Cost**: $0 — entirely on free tiers (Cloudflare Workers/D1/R2 free plan)

## Design Principle
Billing must **never stop** due to no internet. Local SQLite is the real database.
Cloud sync is a background convenience layer, not a dependency.

## Tech Stack
| Layer | Choice |
|---|---|
| Desktop shell | Tauri (Rust) |
| Desktop/Mobile UI | React + Tailwind + shadcn/ui |
| Mobile shell | React Native |
| Local database | SQLite |
| Cloud API | Cloudflare Workers |
| Cloud database | Cloudflare D1 |
| File storage | Cloudflare R2 (optional, invoices/logos) |
| Auth | JWT |
| Hosting cost | $0 (free tier) |

## Roles & Permissions
| Action | Admin | Salesman |
|---|---|---|
| Login | ✅ | ✅ |
| Create a sale/bill | ✅ | ✅ |
| View own sales | ✅ | ✅ |
| View all staff's sales | ✅ | ❌ |
| Add/edit/delete products | ✅ | ❌ |
| View reports | ✅ | ❌ |
| Add/remove staff logins | ✅ | ❌ |
| Change shop settings | ✅ | ❌ |
| Add customer / bill on credit / record credit payment | ✅ | ✅ |
| Record purchases / purchase returns / manage vendors | ✅ | ❌ |
| Add expense entries | ✅ | ❌ |

**Rule:** Every permission is enforced **server-side** in the Worker API (middleware checks `role`
from the JWT before running the request) — the UI hiding a menu item is cosmetic only, never the
actual security boundary.

## Full Database Schema (reference — each module file repeats only the tables it touches)
```sql
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin','salesman')) DEFAULT 'salesman',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  barcode TEXT,
  price REAL NOT NULL,
  stock_qty INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT,
  credit_balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
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

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  price_at_sale REAL NOT NULL
);

CREATE TABLE credit_payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL,
  received_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  vendor_id TEXT REFERENCES vendors(id),
  total_amount REAL NOT NULL,
  is_return INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  cost_price REAL NOT NULL
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
```
> Local SQLite (PC/mobile) uses the same schema minus `shops`, plus the `synced` flag usage
> described in `06-sync-service.md`.

## Build Order (which module file to hand an agent, in sequence)
1. `01-database.md`
2. `02-cloud-api.md`
3. `03-local-db-rust.md`
4. `04-desktop-ui.md` (billing screen first)
5. `06-sync-service.md`
6. `09-customer-credit.md`
7. `10-procurement.md`
8. `04-desktop-ui.md` (remaining admin screens)
9. `07-design-system.md`
10. `05-mobile-app.md`
11. `08-reports-export.md`

## Known Gotchas (full detail lives in `12-known-gotchas.md`)
Quick list: data backup/export, bill rounding rule, server-assigned invoice numbers (avoid
duplicate numbers across offline devices), thermal printer paper-size variance (2" vs 3"),
revoke-a-lost-device login, local SQLite file backup, credit balance limits, negative-stock
handling, free WhatsApp click-to-chat vs paid API.
