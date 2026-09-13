import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /vendors — admin only
export async function listVendors(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const { results } = await env.shop_billing_db
    .prepare('SELECT * FROM vendors WHERE shop_id = ? ORDER BY name')
    .bind(user.shop_id)
    .all();

  return json(results);
}

// POST /vendors — admin only
export async function createVendor(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { name?: string; phone?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, phone } = body;
  if (!name) return json({ error: 'name is required' }, 400);

  const id = crypto.randomUUID();
  await env.shop_billing_db
    .prepare('INSERT INTO vendors (id, shop_id, name, phone) VALUES (?, ?, ?, ?)')
    .bind(id, user.shop_id, name, phone ?? null)
    .run();

  return json({ id }, 201);
}
