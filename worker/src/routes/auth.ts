import bcrypt from 'bcryptjs';
import { signJwt } from '../auth';
import { json } from '../middleware';
import type { Env } from '../types';

// POST /auth/login
// Body: { username, password }
// Returns: { token }
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { username, password } = body;
  if (!username || !password) {
    return json({ error: 'username and password are required' }, 400);
  }

  const row = await env.shop_billing_db
    .prepare('SELECT id, shop_id, role, password_hash FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: string; shop_id: string; role: string; password_hash: string }>();

  if (!row) return json({ error: 'Invalid credentials' }, 401);

  const passwordMatch = await bcrypt.compare(password, row.password_hash);
  if (!passwordMatch) return json({ error: 'Invalid credentials' }, 401);

  const token = await signJwt(
    { user_id: row.id, shop_id: row.shop_id, role: row.role },
    env.JWT_SECRET
  );

  return json({ token });
}
