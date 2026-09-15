import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /reports/daily — admin only
// Returns today's total revenue, breakdown by payment_mode, item count, top products
export async function dailyReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const [totals, byMode, topProducts, staff, expenses] = await Promise.all([
    env.shop_billing_db
      .prepare(`SELECT
          COUNT(*) AS total_bills,
          COALESCE(SUM(total_amount), 0) AS gross_revenue,
          COALESCE(SUM(discount_amount), 0) AS total_discounts,
          COALESCE(SUM(total_amount - discount_amount), 0) AS net_revenue
        FROM sales
        WHERE shop_id = ? AND date(created_at) = date('now')`)
      .bind(user.shop_id)
      .first(),

    env.shop_billing_db
      .prepare(`SELECT payment_mode, COUNT(*) AS count, SUM(total_amount) AS total
        FROM sales
        WHERE shop_id = ? AND date(created_at) = date('now')
        GROUP BY payment_mode`)
      .bind(user.shop_id)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT p.name, SUM(si.quantity) AS qty_sold, SUM(si.quantity * si.price_at_sale) AS revenue
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        JOIN sales s ON s.id = si.sale_id
        WHERE s.shop_id = ? AND date(s.created_at) = date('now')
        GROUP BY p.id ORDER BY qty_sold DESC LIMIT 5`)
      .bind(user.shop_id)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT u.name, COUNT(s.id) AS bills, COALESCE(SUM(s.total_amount), 0) AS total
        FROM sales s JOIN users u ON u.id = s.sold_by
        WHERE s.shop_id = ? AND date(s.created_at) = date('now')
        GROUP BY s.sold_by ORDER BY total DESC`)
      .bind(user.shop_id)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS total_expenses
        FROM expenses WHERE shop_id = ? AND date(created_at) = date('now')`)
      .bind(user.shop_id)
      .first(),
  ]);

  return json({
    date: new Date().toISOString().split('T')[0],
    summary: totals,
    by_payment_mode: byMode.results,
    top_products: topProducts.results,
    staff_breakdown: staff.results,
    expenses: expenses,
  });
}

// GET /reports/monthly — admin only
// Returns per-day totals for current calendar month
export async function monthlyReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7); // YYYY-MM

  const [daily, summary, byMode, staff, expenseSummary] = await Promise.all([
    env.shop_billing_db
      .prepare(`SELECT date(created_at) AS day,
          COUNT(*) AS bills,
          SUM(total_amount) AS gross,
          SUM(discount_amount) AS discounts,
          SUM(total_amount - discount_amount) AS net
        FROM sales
        WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?
        GROUP BY day ORDER BY day`)
      .bind(user.shop_id, month)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT COUNT(*) AS total_bills,
          COALESCE(SUM(total_amount), 0) AS gross_revenue,
          COALESCE(SUM(discount_amount), 0) AS total_discounts,
          COALESCE(SUM(total_amount - discount_amount), 0) AS net_revenue
        FROM sales
        WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?`)
      .bind(user.shop_id, month)
      .first(),

    env.shop_billing_db
      .prepare(`SELECT payment_mode, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS total
        FROM sales WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?
        GROUP BY payment_mode`)
      .bind(user.shop_id, month)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT u.name, COUNT(s.id) AS bills, COALESCE(SUM(s.total_amount), 0) AS total
        FROM sales s JOIN users u ON u.id = s.sold_by
        WHERE s.shop_id = ? AND strftime('%Y-%m', s.created_at) = ?
        GROUP BY s.sold_by ORDER BY total DESC`)
      .bind(user.shop_id, month)
      .all(),

    env.shop_billing_db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS total_expenses
        FROM expenses WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?`)
      .bind(user.shop_id, month)
      .first(),
  ]);

  return json({
    month,
    summary,
    daily_breakdown: daily.results,
    by_payment_mode: byMode.results,
    staff_breakdown: staff.results,
    expenses: expenseSummary,
  });
}

// GET /reports/stock — current quantities with movement and low-stock flags.
export async function stockReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;
  const { results } = await env.shop_billing_db.prepare(`
    SELECT p.id, p.name, p.stock_qty, p.low_stock_threshold,
      COALESCE(SUM(si.quantity), 0) AS qty_sold,
      CASE WHEN p.stock_qty <= p.low_stock_threshold THEN 1 ELSE 0 END AS low_stock,
      CASE WHEN COALESCE(SUM(si.quantity), 0) = 0 THEN 'dead'
           WHEN COALESCE(SUM(si.quantity), 0) >= 10 THEN 'fast' ELSE 'regular' END AS movement
    FROM products p
    LEFT JOIN sale_items si ON si.product_id = p.id
    LEFT JOIN sales s ON s.id = si.sale_id AND s.shop_id = p.shop_id
    WHERE p.shop_id = ?
    GROUP BY p.id
    ORDER BY low_stock DESC, qty_sold DESC, p.name ASC`).bind(user.shop_id).all();
  return json({ rows: results });
}

// GET /reports/credit — customers with money outstanding.
export async function creditReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;
  const { results } = await env.shop_billing_db.prepare(`
    SELECT name, phone, credit_balance FROM customers
    WHERE shop_id = ? AND credit_balance > 0
    ORDER BY credit_balance DESC, name ASC`).bind(user.shop_id).all();
  const total = (results as Array<{ credit_balance: number }>).reduce((sum, row) => sum + Number(row.credit_balance ?? 0), 0);
  return json({ total_outstanding: total, rows: results });
}

// GET /reports/expenses?month=YYYY-MM — expense list and total for a calendar month.
export async function expenseReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;
  const month = new URL(request.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const { results } = await env.shop_billing_db.prepare(`
    SELECT label, amount, created_at FROM expenses
    WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?
    ORDER BY created_at DESC`).bind(user.shop_id, month).all();
  const total = (results as Array<{ amount: number }>).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  return json({ month, total, rows: results });
}
