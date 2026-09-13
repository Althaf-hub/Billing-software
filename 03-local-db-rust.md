# Module 3 — Local Database Layer (Rust, Tauri)

> Read `00-shared-context.md` first.

## Task
Build the thin Rust layer inside the Tauri app that reads/writes the local SQLite database.
This is intentionally small — the React frontend calls these commands, it does not touch SQLite
directly.

## Local Schema
Same as the shared schema in `00-shared-context.md`, **minus** the `shops` table (a device only
ever needs its own shop's data — the `shop_id` is stored once in local app config, not repeated
per row lookup) plus these two considerations:
- `sales.synced` and `products` changes need a `synced` flag to track what still needs pushing
  to the cloud (see `06-sync-service.md`)
- Local `id` values are generated client-side (UUID) so they're stable across offline creation

## Rust Commands to Implement
| Command | Purpose |
|---|---|
| `init_db` | Create the local SQLite file + run schema on first launch |
| `save_sale(sale, items)` | Insert a sale + its sale_items, deduct stock, set `synced = 0` |
| `get_products()` | Return current product list from local DB |
| `update_stock(product_id, delta)` | Adjust stock (used by sales, purchases, manual adjustment) |
| `save_customer(customer)` | Insert/update a customer |
| `record_credit_payment(customer_id, amount)` | Insert payment, reduce `credit_balance` |
| `save_purchase(purchase, items, is_return)` | Insert a purchase or purchase return, adjust stock |
| `save_expense(expense)` | Insert an expense row |
| `get_pending_sync()` | Return all rows across tables where `synced = 0` |
| `mark_synced(table, id)` | Flip `synced` to 1 after a successful push |
| `backup_db()` | Copy the local SQLite file to a backup folder (see `00-shared-context.md` gotchas) |

## Acceptance Criteria
- Each command callable from the React frontend via Tauri's `invoke()`
- `save_sale` correctly deducts stock and never allows it to go negative without a warning
  (decide block-vs-warn behavior here — see `12-known-gotchas.md`)
- App works fully with network disabled — all commands succeed against local SQLite alone
