# Module 1 — Cloud Database

> Read `00-shared-context.md` first.

## Task
Set up Cloudflare D1 and create the full schema (all tables are listed in
`00-shared-context.md` under "Full Database Schema" — copy them exactly as-is).

## Steps
1. `npx wrangler d1 create shop-billing-db`
2. Save the returned `database_id`
3. Run all `CREATE TABLE` statements from the shared schema
4. Seed test data:
   - One row in `shops`
   - One `admin` user, one `salesman` user (hashed passwords)
   - 3 sample `products` (with barcode + low_stock_threshold filled in)
   - One sample `customer`
   - One sample `vendor`

## Acceptance Criteria
- All tables created without errors
- Seed data queryable via `wrangler d1 execute`
- No GST-related columns present (not needed currently — see `00-shared-context.md`)
