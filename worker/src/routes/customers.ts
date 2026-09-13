import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /customers — admin + salesman
export async function listCustomers(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  const { results } = await env.shop_billing_db
    .prepare('SELECT * FROM customers WHERE shop_id = ? ORDER BY name')
    .bind(user.shop_id)
    .all();

  return json(results);
}

// POST /customers — admin + salesman
export async function createCustomer(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  let body: { name?: string; phone?: string };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { name, phone } = body;
  if (!name) return json({ error: 'name is required' }, 400);

  const id = crypto.randomUUID();
  await env.shop_billing_db
    .prepare('INSERT INTO customers (id, shop_id, name, phone) VALUES (?, ?, ?, ?)')
    .bind(id, user.shop_id, name, phone ?? null)
    .run();

  return json({ id }, 201);
}

// POST /customers/:id/payment — admin + salesman
// Records a credit payment and reduces the customer's credit_balance
export async function recordPayment(
  request: Request,
  env: Env,
  user: JwtPayload,
  customerId: string
): Promise<Response> {
  const deny = requireRole(user, 'admin', 'salesman');
  if (deny) return deny;

  let body: { amount?: number };
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { amount } = body;
  if (!amount || amount <= 0) return json({ error: 'amount must be a positive number' }, 400);

  // Verify customer belongs to this shop
  const customer = await env.shop_billing_db
    .prepare('SELECT id, credit_balance FROM customers WHERE id = ? AND shop_id = ?')
    .bind(customerId, user.shop_id)
    .first<{ id: string; credit_balance: number }>();

  if (!customer) return json({ error: 'Customer not found' }, 404);

  const paymentId = crypto.randomUUID();

  await env.shop_billing_db.batch([
    env.shop_billing_db
      .prepare('INSERT INTO credit_payments (id, shop_id, customer_id, amount, received_by) VALUES (?, ?, ?, ?, ?)')
      .bind(paymentId, user.shop_id, customerId, amount, user.user_id),
    env.shop_billing_db
      .prepare('UPDATE customers SET credit_balance = MAX(0, credit_balance - ?) WHERE id = ? AND shop_id = ?')
      .bind(amount, customerId, user.shop_id),
  ]);

  return json({ id: paymentId, success: true }, 201);
}
