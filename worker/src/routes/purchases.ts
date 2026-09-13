import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

interface PurchaseItem {
  product_id: string;
  quantity: number;
  cost_price: number;
}

// POST /purchases — admin only — stock IN
export async function createPurchase(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { vendor_id?: string; total_amount?: number; items?: PurchaseItem[] };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { vendor_id, total_amount, items } = body;
  if (total_amount === undefined || !items || items.length === 0) {
    return json({ error: 'total_amount and items[] are required' }, 400);
  }

  const purchaseId = crypto.randomUUID();
  const stmts = [
    env.shop_billing_db
      .prepare('INSERT INTO purchases (id, shop_id, vendor_id, total_amount, is_return, created_by) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(purchaseId, user.shop_id, vendor_id ?? null, total_amount, user.user_id),
  ];

  for (const item of items) {
    stmts.push(
      env.shop_billing_db
        .prepare('INSERT INTO purchase_items (id, purchase_id, product_id, quantity, cost_price) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), purchaseId, item.product_id, item.quantity, item.cost_price)
    );
    // Increment stock
    stmts.push(
      env.shop_billing_db
        .prepare("UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ? AND shop_id = ?")
        .bind(item.quantity, item.product_id, user.shop_id)
    );
  }

  await env.shop_billing_db.batch(stmts);
  return json({ id: purchaseId }, 201);
}

// POST /purchases/:id/return — admin only — stock OUT (purchase return)
export async function returnPurchase(
  request: Request,
  env: Env,
  user: JwtPayload,
  purchaseId: string
): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  // Load original purchase items to reverse stock
  const { results: originalItems } = await env.shop_billing_db
    .prepare(`SELECT pi.product_id, pi.quantity, pi.cost_price, p.total_amount
              FROM purchase_items pi
              JOIN purchases p ON p.id = pi.purchase_id
              WHERE pi.purchase_id = ? AND p.shop_id = ?`)
    .bind(purchaseId, user.shop_id)
    .all<{ product_id: string; quantity: number; cost_price: number; total_amount: number }>();

  if (originalItems.length === 0) return json({ error: 'Purchase not found' }, 404);

  const totalAmount = originalItems[0].total_amount;
  const returnId = crypto.randomUUID();

  const stmts = [
    env.shop_billing_db
      .prepare('INSERT INTO purchases (id, shop_id, vendor_id, total_amount, is_return, created_by) SELECT ?, shop_id, vendor_id, ?, 1, ? FROM purchases WHERE id = ?')
      .bind(returnId, totalAmount, user.user_id, purchaseId),
  ];

  for (const item of originalItems) {
    stmts.push(
      env.shop_billing_db
        .prepare('INSERT INTO purchase_items (id, purchase_id, product_id, quantity, cost_price) VALUES (?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), returnId, item.product_id, item.quantity, item.cost_price)
    );
    // Reverse stock
    stmts.push(
      env.shop_billing_db
        .prepare("UPDATE products SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ? AND shop_id = ?")
        .bind(item.quantity, item.product_id, user.shop_id)
    );
  }

  await env.shop_billing_db.batch(stmts);
  return json({ id: returnId }, 201);
}
