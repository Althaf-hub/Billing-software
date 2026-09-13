import bcrypt from 'bcryptjs';
import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// POST /users — admin only — add a staff login
export async function createUser(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  let body: { name?: string; username?: string; password?: string; role?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, username, password, role = 'salesman' } = body;
  if (!name || !username || !password) {
    return json({ error: 'name, username and password are required' }, 400);
  }
  if (!['admin', 'salesman'].includes(role)) {
    return json({ error: 'role must be admin or salesman' }, 400);
  }

  // Check username uniqueness
  const existing = await env.shop_billing_db
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first();
  if (existing) return json({ error: 'Username already exists' }, 409);

  const password_hash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();

  await env.shop_billing_db
    .prepare('INSERT INTO users (id, shop_id, name, username, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, user.shop_id, name, username, password_hash, role)
    .run();

  return json({ id }, 201);
}

// DELETE /users/:id — admin only — remove a staff login
export async function deleteUser(
  request: Request,
  env: Env,
  user: JwtPayload,
  targetId: string
): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  // Prevent self-deletion
  if (targetId === user.user_id) {
    return json({ error: 'Cannot delete your own account' }, 400);
  }

  const result = await env.shop_billing_db
    .prepare('DELETE FROM users WHERE id = ? AND shop_id = ?')
    .bind(targetId, user.shop_id)
    .run();

  if (result.meta.changes === 0) return json({ error: 'User not found' }, 404);
  return json({ success: true });
}
