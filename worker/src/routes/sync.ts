import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaleItem {
  product_id: string;
  quantity: number;
  price_at_sale: number;
}

interface PushSale {
  id: string;
  customer_id?: string | null;
  discount_amount?: number;
  total_amount: number;
  payment_mode?: string | null;
  device_id?: string | null;
  created_at?: string;
  items: SaleItem[];
}

interface PushCreditPayment {
  id: string;
  customer_id: string;
  amount: number;
  received_by?: string | null;
  created_at?: string;
}

interface PushExpense {
  id: string;
  label: string;
  amount: number;
  created_at?: string;
}

interface PushCustomer {
  id: string;
  name: string;
  phone?: string | null;
  credit_balance?: number;
  created_at?: string;
}

interface PushVendor {
  id: string;
  name: string;
  phone?: string | null;
  created_at?: string;
}

interface PushPurchaseItem {
  product_id: string;
  quantity: number;
  cost_price: number;
}

interface PushPurchase {
  id: string;
  vendor_id?: string | null;
  total_amount: number;
  is_return?: number;
  created_by?: string | null;
  created_at?: string;
  items: PushPurchaseItem[];
}

interface PushBody {
  sales?: PushSale[];
  credit_payments?: PushCreditPayment[];
  expenses?: PushExpense[];
  customers?: PushCustomer[];
  vendors?: PushVendor[];
  purchases?: PushPurchase[];
}

// ─── POST /sync/push ──────────────────────────────────────────────────────────
// Accepts an array of offline-queued records for all entity types.
// Server assigns invoice_number for sales (keeps numbers unique across devices).
// Conflict rule: a sale that would take any product's stock negative is flagged
// for admin review rather than silently dropped or double-committed.
export async function syncPush(
  request: Request,
  env: Env,
  user: JwtPayload,
): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  let body: PushBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const now = new Date().toISOString();
  const assignedInvoiceNumbers: Record<string, number> = {};
  const flaggedSaleIds: string[] = [];
  const stmts: D1PreparedStatement[] = [];

  // ── 1. Customers (upsert before sales, so FK constraints are satisfied) ───
  for (const customer of body.customers ?? []) {
    stmts.push(
      env.shop_billing_db
        .prepare(
          `INSERT INTO customers (id, shop_id, name, phone, credit_balance, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             phone = excluded.phone,
             credit_balance = excluded.credit_balance`,
        )
        .bind(
          customer.id,
          user.shop_id,
          customer.name,
          customer.phone ?? null,
          customer.credit_balance ?? 0,
          customer.created_at ?? now,
        ),
    );
  }

  // ── 2. Vendors (upsert before purchases) ──────────────────────────────────
  for (const vendor of body.vendors ?? []) {
    stmts.push(
      env.shop_billing_db
        .prepare(
          `INSERT INTO vendors (id, shop_id, name, phone, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(vendor.id, user.shop_id, vendor.name, vendor.phone ?? null, vendor.created_at ?? now),
    );
  }

  // Flush customers/vendors first so FK refs in sales/purchases are valid
  if (stmts.length > 0) {
    await env.shop_billing_db.batch(stmts);
    stmts.length = 0;
  }

  // ── 3. Sales (with conflict resolution) ───────────────────────────────────
  const sales = body.sales ?? [];
  if (sales.length > 0) {
    // Get current MAX invoice_number once; increment per new sale
    const row = await env.shop_billing_db
      .prepare(
        'SELECT COALESCE(MAX(invoice_number), 0) AS max_inv FROM sales WHERE shop_id = ?',
      )
      .bind(user.shop_id)
      .first<{ max_inv: number }>();

    let nextInv = (row?.max_inv ?? 0) + 1;

    for (const sale of sales) {
      // Idempotency: skip if already in DB
      const existing = await env.shop_billing_db
        .prepare('SELECT id FROM sales WHERE id = ?')
        .bind(sale.id)
        .first();
      if (existing) continue;

      const invoiceNum = nextInv++;
      assignedInvoiceNumbers[sale.id] = invoiceNum;

      // ── Conflict check: would this sale push any product to negative stock? ──
      // Recalculate stock from full sale history (all committed sales + this one)
      let isConflict = false;
      for (const item of sale.items) {
        // Sum all *synced* sale quantities for this product in this shop
        const stockRow = await env.shop_billing_db
          .prepare(
            `SELECT
               p.stock_qty AS catalog_qty,
               COALESCE(SUM(si.quantity), 0) AS already_sold
             FROM products p
             LEFT JOIN sale_items si ON si.product_id = p.id
             LEFT JOIN sales s ON s.id = si.sale_id
               AND s.shop_id = ? AND s.conflict_flagged = 0
             WHERE p.id = ? AND p.shop_id = ?
             GROUP BY p.id`,
          )
          .bind(user.shop_id, item.product_id, user.shop_id)
          .first<{ catalog_qty: number; already_sold: number }>();

        if (!stockRow) continue; // product not found on server — let it through

        // Effective available stock = catalog qty (already accounts for prior syncs via product table)
        // We compare the new quantity against what the catalog says minus any already-sold since last catalog update.
        // Simpler and correct: the products table stock_qty IS the current truth on the server side
        // (updated each time a sale syncs). So just check: stock_qty - this_item_quantity < 0
        const available = (stockRow.catalog_qty ?? 0);
        if (available - item.quantity < 0) {
          isConflict = true;
          break;
        }
      }

      if (isConflict) {
        flaggedSaleIds.push(sale.id);
      }

      // Always insert the sale — conflicts are flagged, not dropped
      stmts.push(
        env.shop_billing_db
          .prepare(
            `INSERT INTO sales
               (id, shop_id, sold_by, customer_id, invoice_number,
                discount_amount, total_amount, payment_mode,
                device_id, synced, conflict_flagged, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(
            sale.id,
            user.shop_id,
            user.user_id,
            sale.customer_id ?? null,
            invoiceNum,
            sale.discount_amount ?? 0,
            sale.total_amount,
            sale.payment_mode ?? null,
            sale.device_id ?? null,
            isConflict ? 1 : 0,
            sale.created_at ?? now,
          ),
      );

      for (const item of sale.items) {
        stmts.push(
          env.shop_billing_db
            .prepare(
              'INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?)',
            )
            .bind(crypto.randomUUID(), sale.id, item.product_id, item.quantity, item.price_at_sale),
        );

        // Only deduct stock for clean (non-flagged) sales
        if (!isConflict) {
          stmts.push(
            env.shop_billing_db
              .prepare(
                `UPDATE products
                 SET stock_qty = stock_qty - ?, updated_at = ?
                 WHERE id = ? AND shop_id = ?`,
              )
              .bind(item.quantity, now, item.product_id, user.shop_id),
          );
        }
      }
    }
  }

  // ── 4. Credit payments ────────────────────────────────────────────────────
  for (const payment of body.credit_payments ?? []) {
    const exists = await env.shop_billing_db
      .prepare('SELECT id FROM credit_payments WHERE id = ?')
      .bind(payment.id)
      .first();
    if (exists) continue;

    stmts.push(
      env.shop_billing_db
        .prepare(
          `INSERT INTO credit_payments (id, shop_id, customer_id, amount, received_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          payment.id,
          user.shop_id,
          payment.customer_id,
          payment.amount,
          payment.received_by ?? null,
          payment.created_at ?? now,
        ),
    );
    // Adjust customer credit balance on server
    stmts.push(
      env.shop_billing_db
        .prepare(
          'UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ? AND shop_id = ?',
        )
        .bind(payment.amount, payment.customer_id, user.shop_id),
    );
  }

  // ── 5. Expenses ───────────────────────────────────────────────────────────
  for (const expense of body.expenses ?? []) {
    const exists = await env.shop_billing_db
      .prepare('SELECT id FROM expenses WHERE id = ?')
      .bind(expense.id)
      .first();
    if (exists) continue;

    stmts.push(
      env.shop_billing_db
        .prepare(
          `INSERT INTO expenses (id, shop_id, label, amount, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(expense.id, user.shop_id, expense.label, expense.amount, expense.created_at ?? now),
    );
  }

  // ── 6. Purchases ──────────────────────────────────────────────────────────
  for (const purchase of body.purchases ?? []) {
    const exists = await env.shop_billing_db
      .prepare('SELECT id FROM purchases WHERE id = ?')
      .bind(purchase.id)
      .first();
    if (exists) continue;

    stmts.push(
      env.shop_billing_db
        .prepare(
          `INSERT INTO purchases (id, shop_id, vendor_id, total_amount, is_return, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          purchase.id,
          user.shop_id,
          purchase.vendor_id ?? null,
          purchase.total_amount,
          purchase.is_return ?? 0,
          purchase.created_by ?? null,
          purchase.created_at ?? now,
        ),
    );

    for (const item of purchase.items) {
      stmts.push(
        env.shop_billing_db
          .prepare(
            'INSERT INTO purchase_items (id, purchase_id, product_id, quantity, cost_price) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(crypto.randomUUID(), purchase.id, item.product_id, item.quantity, item.cost_price),
      );
      // Adjust stock for purchases (+) and purchase returns (-)
      const delta = (purchase.is_return ?? 0) ? -item.quantity : item.quantity;
      stmts.push(
        env.shop_billing_db
          .prepare(
            'UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ? AND shop_id = ?',
          )
          .bind(delta, now, item.product_id, user.shop_id),
      );
    }
  }

  if (stmts.length > 0) await env.shop_billing_db.batch(stmts);

  return json({
    synced: Object.keys(assignedInvoiceNumbers).length,
    invoice_numbers: assignedInvoiceNumbers,
    flagged: flaggedSaleIds,
  });
}

// ─── GET /sync/pull?since=<ISO timestamp> ────────────────────────────────────
// Returns all records changed/created since the given timestamp for the
// requesting shop_id — used by devices to catch up after going offline.
export async function syncPull(
  request: Request,
  env: Env,
  user: JwtPayload,
): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? '1970-01-01T00:00:00Z';

  const [sales, products, customers, creditPayments, expenses, vendors, purchases] =
    await Promise.all([
      env.shop_billing_db
        .prepare(
          `SELECT s.*, GROUP_CONCAT(
             si.product_id || ':' || si.quantity || ':' || si.price_at_sale
           ) AS items_raw
           FROM sales s
           LEFT JOIN sale_items si ON si.sale_id = s.id
           WHERE s.shop_id = ? AND s.created_at > ?
           GROUP BY s.id`,
        )
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare('SELECT * FROM products WHERE shop_id = ? AND updated_at > ?')
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare('SELECT * FROM customers WHERE shop_id = ? AND created_at > ?')
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare('SELECT * FROM credit_payments WHERE shop_id = ? AND created_at > ?')
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare('SELECT * FROM expenses WHERE shop_id = ? AND created_at > ?')
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare('SELECT * FROM vendors WHERE shop_id = ? AND created_at > ?')
        .bind(user.shop_id, since)
        .all(),
      env.shop_billing_db
        .prepare(
          `SELECT p.*, GROUP_CONCAT(
             pi.product_id || ':' || pi.quantity || ':' || pi.cost_price
           ) AS items_raw
           FROM purchases p
           LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
           WHERE p.shop_id = ? AND p.created_at > ?
           GROUP BY p.id`,
        )
        .bind(user.shop_id, since)
        .all(),
    ]);

  return json({
    as_of: new Date().toISOString(),
    sales: sales.results,
    products: products.results,
    customers: customers.results,
    credit_payments: creditPayments.results,
    expenses: expenses.results,
    vendors: vendors.results,
    purchases: purchases.results,
  });
}
