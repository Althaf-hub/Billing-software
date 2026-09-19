# Module 10 — Procurement (Purchases, Returns, Vendors, Expenses)

> Read `00-shared-context.md` first. Build right after `09-customer-credit.md`. All admin-only.

## Relevant Schema (subset of the shared schema)
```sql
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
  is_return INTEGER DEFAULT 0,      -- 1 = this record is a purchase return
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,        -- stock IN on a normal purchase, stock OUT on a return
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

## Relevant API Routes
| Method | Route | Role |
|---|---|---|
| GET | `/vendors` | admin |
| POST | `/vendors` | admin |
| POST | `/purchases` | admin |
| POST | `/purchases/:id/return` | admin |
| GET | `/expenses` | admin |
| POST | `/expenses` | admin |

## Behavior
- Recording a purchase (`is_return = 0`) **increases** stock for each product in `purchase_items`
- Recording a purchase return (`is_return = 1`, or via `/purchases/:id/return`) **decreases**
  stock for each product
- Vendor list is simple — name + phone, no payment terms or ledger needed at this scale
- Expense log is a flat list (label + amount + date) — not tied to accounting categories, just
  for the owner's own tracking (see `00-shared-context.md` — full accounting is explicitly Skip)

## Explicitly Out of Scope
- Purchase orders / approval workflow, GRN, multi-currency import — these are full-ERP features
  not needed at 2–5 products (see the original feature catalog discussion — kept out to avoid
  scope creep)

## Acceptance Criteria
- A purchase correctly increases stock for each line item
- A purchase return correctly decreases stock and cannot be created against a product that
  wasn't previously purchased from that vendor (basic sanity check, not a hard requirement)
- All routes reject non-admin (salesman) tokens with 403
