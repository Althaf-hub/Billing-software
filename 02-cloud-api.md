# Module 2 — Cloud API (Cloudflare Workers)

> Read `00-shared-context.md` first. Depends on `01-database.md` being done.

## Task
Build the REST API in Cloudflare Workers, connected to the D1 database from Module 1.

## Routes to implement

| Method | Route | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | any | Returns JWT `{ user_id, shop_id, role }` |
| GET | `/products` | admin, salesman | List products for the shop |
| POST | `/products` | admin | Add product |
| PUT | `/products/:id` | admin | Edit product |
| DELETE | `/products/:id` | admin | Delete product |
| POST | `/sales` | admin, salesman | Create a sale (with sale_items) |
| GET | `/sales?mine=true` | salesman | Own sales only |
| GET | `/sales` | admin | All shop sales |
| GET | `/reports/daily` | admin | Today's totals, breakdowns |
| GET | `/reports/monthly` | admin | Monthly report |
| POST | `/users` | admin | Add staff login |
| DELETE | `/users/:id` | admin | Remove staff login |
| GET | `/customers` | admin, salesman | List customers + credit balance |
| POST | `/customers` | admin, salesman | Add a customer |
| POST | `/customers/:id/payment` | admin, salesman | Record a payment against credit balance |
| GET | `/vendors` | admin | List vendors |
| POST | `/vendors` | admin | Add a vendor |
| POST | `/purchases` | admin | Record a purchase (stock in) |
| POST | `/purchases/:id/return` | admin | Record a purchase return (stock out) |
| GET | `/expenses` | admin | List expenses |
| POST | `/expenses` | admin | Add an expense entry |
| POST | `/sync/push` | any | Push queued offline records (server assigns `invoice_number` here) |
| GET | `/sync/pull?since=timestamp` | any | Pull records changed since last sync |

## Auth Middleware
- Every route except `/auth/login` requires a valid JWT in the `Authorization` header
- Middleware decodes the JWT, attaches `{ user_id, shop_id, role }` to the request
- A second middleware checks `role` against the "Role" column above; reject with 403 if not allowed
- **Every product/sale/customer/vendor/purchase/expense query must filter by `shop_id`** from the
  JWT — this is the entire multi-tenancy mechanism (see `00-shared-context.md`), never trust a
  `shop_id` passed in the request body/query string, only the one from the verified JWT

## Acceptance Criteria
- All routes deployed and reachable
- Role checks verified with both an admin and a salesman token
- Cross-tenant test: two different `shop_id`s never see each other's data
