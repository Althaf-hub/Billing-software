import { json, requireRole } from '../middleware';
import type { Env, JwtPayload } from '../types';

// GET /reports/daily — admin only
// Returns today's total revenue, breakdown by payment_mode, item count, top products
export async function dailyReport(request: Request, env: Env, user: JwtPayload): Promise<Response> {
  const deny = requireRole(user, 'admin');
  if (deny) return deny;

  const [totals, byMode, topProducts, expenses] = await Promise.all([
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

  const [daily, summary, expenseSummary] = await Promise.all([
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
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS total_expenses
        FROM expenses WHERE shop_id = ? AND strftime('%Y-%m', created_at) = ?`)
      .bind(user.shop_id, month)
      .first(),
  ]);

  return json({
    month,
    summary,
    daily_breakdown: daily.results,
    expenses: expenseSummary,
  });
}
