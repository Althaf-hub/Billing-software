import { verifyJwt } from './auth';
import type { Env, JwtPayload } from './types';

// ── Helper: JSON response shorthand ──────────────────────────────────────────
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Auth middleware ───────────────────────────────────────────────────────────
// Decodes the JWT and attaches the payload to request.user.
// Returns a 401 Response if the token is missing or invalid.
export async function authMiddleware(
  request: Request,
  env: Env
): Promise<JwtPayload | Response> {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return json({ error: 'Invalid or expired token' }, 401);

  return payload;
}

// ── Role guard ────────────────────────────────────────────────────────────────
// Returns a 403 Response if the user's role is not in the allowed list.
export function requireRole(
  user: JwtPayload,
  ...allowed: Array<'admin' | 'salesman'>
): Response | null {
  if (!allowed.includes(user.role)) {
    return json({ error: 'Forbidden: insufficient role' }, 403);
  }
  return null;
}
