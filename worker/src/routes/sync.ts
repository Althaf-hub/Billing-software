import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// POST /sync/push
// Accepts an array of offline-queued records (sales + sale_items).
// Server assigns invoice_number for each sale to avoid duplicate numbers across devices.
export async function syncPush(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  let body: {
    sales?: Array<{
      id: string;
      customer_id?: string;
      discount_amount?: number;
      total_amount: number;
      payment_mode?: string;
      device_id?: string;
      created_at?: string;
      items: Array<{ product_id: string; quantity: number; price_at_sale: number }>;
    }>;
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const sales = body.sales ?? [];
  if (sales.length === 0) return json({ synced: 0 });

  // Get current MAX invoice number once, increment per sale
  const row = await env.shop_billing_db
    .prepare('SELECT COALESCE(MAX(invoice_number), 0) AS max_inv FROM sales WHERE shop_id = ?')
    .bind(user.shop_id)
    .first<{ max_inv: number }>();

  let nextInv = (row?.max_inv ?? 0) + 1;
  const stmts: D1PreparedStatement[] = [];
  const assignedNumbers: Record<string, number> = {};

  for (const sale of sales) {
    // Skip if already synced (idempotent)
    const existing = await env.shop_billing_db
      .prepare('SELECT id FROM sales WHERE id = ?')
      .bind(sale.id)
      .first();
    if (existing) continue;

    const invoiceNum = nextInv++;
    assignedNumbers[sale.id] = invoiceNum;

    stmts.push(
      env.shop_billing_db
        .prepare(
          'INSERT INTO sales (id, shop_id, sold_by, customer_id, invoice_number, discount_amount, total_amount, payment_mode, device_id, synced, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
        )
        .bind(
          sale.id, user.shop_id, user.user_id, sale.customer_id ?? null,
          invoiceNum, sale.discount_amount ?? 0, sale.total_amount,
          sale.payment_mode ?? null, sale.device_id ?? null,
          sale.created_at ?? new Date().toISOString()
        )
    );

    for (const item of sale.items) {
      stmts.push(
        env.shop_billing_db
          .prepare('INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?)')
          .bind(crypto.randomUUID(), sale.id, item.product_id, item.quantity, item.price_at_sale)
      );
    }
  }

  if (stmts.length > 0) await env.shop_billing_db.batch(stmts);
  return json({ synced: Object.keys(assignedNumbers).length, invoice_numbers: assignedNumbers });
}

// GET /sync/pull?since=<ISO timestamp>
// Returns all records changed since the given timestamp for the requesting shop
export async function syncPull(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  const url = new URL(request.url);
  const since = url.searchParams.get('since') ?? '1970-01-01T00:00:00Z';

  const [sales, products, customers] = await Promise.all([
    env.shop_billing_db
      .prepare('SELECT * FROM sales WHERE shop_id = ? AND created_at > ?')
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
  ]);

  return json({
    as_of: new Date().toISOString(),
    sales: sales.results,
    products: products.results,
    customers: customers.results,
  });
}
