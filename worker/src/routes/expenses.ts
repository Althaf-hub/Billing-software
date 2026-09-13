import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /expenses — admin only
export async function listExpenses(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const url = new URL(request.url);
  const since = url.searchParams.get('since'); // optional ISO date filter

  let query = 'SELECT * FROM expenses WHERE shop_id = ?';
  const bindings: unknown[] = [user.shop_id];

  if (since) {
    query += ' AND created_at >= ?';
    bindings.push(since);
  }

  query += ' ORDER BY created_at DESC';

  const { results } = await env.shop_billing_db.prepare(query).bind(...bindings).all();
  return json(results);
}

// POST /expenses — admin only
export async function createExpense(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { label?: string; amount?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { label, amount } = body;
  if (!label || amount === undefined || amount <= 0) {
    return json({ error: 'label and a positive amount are required' }, 400);
  }

  const id = crypto.randomUUID();
  await env.shop_billing_db
    .prepare('INSERT INTO expenses (id, shop_id, label, amount) VALUES (?, ?, ?, ?)')
    .bind(id, user.shop_id, label, amount)
    .run();

  return json({ id }, 201);
}
