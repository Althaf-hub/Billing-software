import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /products — admin + salesman
export async function listProducts(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  const { results } = await env.shop_billing_db
    .prepare('SELECT * FROM products WHERE shop_id = ? ORDER BY name')
    .bind(user.shop_id)
    .all();

  return json(results);
}

// POST /products — admin only
export async function createProduct(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { name?: string; barcode?: string; price?: number; stock_qty?: number; low_stock_threshold?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, barcode, price, stock_qty = 0, low_stock_threshold = 5 } = body;
  if (!name || price === undefined) return json({ error: 'name and price are required' }, 400);

  const id = crypto.randomUUID();
  await env.shop_billing_db
    .prepare(
      'INSERT INTO products (id, shop_id, name, barcode, price, stock_qty, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, user.shop_id, name, barcode ?? null, price, stock_qty, low_stock_threshold)
    .run();

  return json({ id }, 201);
}

// PUT /products/:id — admin only
export async function updateProduct(
  request: Request,
  env: Env,
  user: JwtPayload,
  productId: string
): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { name?: string; barcode?: string; price?: number; stock_qty?: number; low_stock_threshold?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, barcode, price, stock_qty, low_stock_threshold } = body;

  // Build dynamic SET clause — only update provided fields
  const fields: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (barcode !== undefined) { fields.push('barcode = ?'); values.push(barcode); }
  if (price !== undefined) { fields.push('price = ?'); values.push(price); }
  if (stock_qty !== undefined) { fields.push('stock_qty = ?'); values.push(stock_qty); }
  if (low_stock_threshold !== undefined) { fields.push('low_stock_threshold = ?'); values.push(low_stock_threshold); }

  if (fields.length === 0) return json({ error: 'No fields to update' }, 400);

  fields.push("updated_at = datetime('now')");
  values.push(productId, user.shop_id);

  const result = await env.shop_billing_db
    .prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ? AND shop_id = ?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return json({ error: 'Product not found' }, 404);
  return json({ success: true });
}

// DELETE /products/:id — admin only
export async function deleteProduct(
  request: Request,
  env: Env,
  user: JwtPayload,
  productId: string
): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const result = await env.shop_billing_db
    .prepare('DELETE FROM products WHERE id = ? AND shop_id = ?')
    .bind(productId, user.shop_id)
    .run();

  if (result.meta.changes === 0) return json({ error: 'Product not found' }, 404);
  return json({ success: true });
}
