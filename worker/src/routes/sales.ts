import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

interface SaleItem {
  product_id: string;
  quantity: number;
  price_at_sale: number;
}

// POST /sales — admin + salesman
// invoice_number is server-assigned (MAX + 1 for shop) to avoid offline duplicates
export async function createSale(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  let body: {
    customer_id?: string;
    discount_amount?: number;
    total_amount?: number;
    payment_mode?: string;
    device_id?: string;
    items?: SaleItem[];
  };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { customer_id, discount_amount = 0, total_amount, payment_mode, device_id, items } = body;
  if (total_amount === undefined || !items || items.length === 0) {
    return json({ error: 'total_amount and items[] are required' }, 400);
  }

  // Server-assign invoice_number: MAX(invoice_number) + 1 per shop
  const row = await env.shop_billing_db
    .prepare('SELECT COALESCE(MAX(invoice_number), 0) + 1 AS next_inv FROM sales WHERE shop_id = ?')
    .bind(user.shop_id)
    .first<{ next_inv: number }>();
  const invoice_number = row?.next_inv ?? 1;

  const saleId = crypto.randomUUID();

  // Insert sale + all items in a batch (atomic)
  const stmts = [
    env.shop_billing_db
      .prepare(
        'INSERT INTO sales (id, shop_id, sold_by, customer_id, invoice_number, discount_amount, total_amount, payment_mode, device_id, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
      )
      .bind(saleId, user.shop_id, user.user_id, customer_id ?? null, invoice_number, discount_amount, total_amount, payment_mode ?? null, device_id ?? null),
  ];

  for (const item of items) {
    stmts.push(
      env.shop_billing_db
        .prepare('INSERT INTO sale_items (id, sale_id, product_id, quantity, price_at_sale) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), saleId, item.product_id, item.quantity, item.price_at_sale)
    );
    // Decrement stock
    stmts.push(
      env.shop_billing_db
        .prepare('UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime(\'now\') WHERE id = ? AND shop_id = ?')
        .bind(item.quantity, item.product_id, user.shop_id)
    );
  }

  // Credit balance: if payment_mode is 'credit', add to customer's credit_balance
  if (payment_mode === 'credit' && customer_id) {
    stmts.push(
      env.shop_billing_db
        .prepare('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ? AND shop_id = ?')
        .bind(total_amount - discount_amount, customer_id, user.shop_id)
    );
  }

  await env.shop_billing_db.batch(stmts);
  return json({ id: saleId, invoice_number }, 201);
}

// GET /sales — admin gets all, salesman gets own
export async function listSales(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  const url = new URL(request.url);
  const mine = url.searchParams.get('mine') === 'true';

  let query: string;
  let bindings: unknown[];

  if (user.role === 'salesman' || mine) {
    query = `SELECT s.*, u.name as sold_by_name FROM sales s
             JOIN users u ON u.id = s.sold_by
             WHERE s.shop_id = ? AND s.sold_by = ?
             ORDER BY s.created_at DESC`;
    bindings = [user.shop_id, user.user_id];
  } else {
    query = `SELECT s.*, u.name as sold_by_name FROM sales s
             JOIN users u ON u.id = s.sold_by
             WHERE s.shop_id = ?
             ORDER BY s.created_at DESC`;
    bindings = [user.shop_id];
  }

  const { results } = await env.shop_billing_db
    .prepare(query)
    .bind(...bindings)
    .all();

  return json(results);
}
