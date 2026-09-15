import { AutoRouter, cors } from 'itty-router';
import type { Env } from './types';
import { authMiddleware, json } from './middleware';

// Route handlers
import { handleLogin } from './routes/auth';
import { listProducts, createProduct, updateProduct, deleteProduct } from './routes/products';
import { createSale, listSales, getSaleInvoice } from './routes/sales';
import { dailyReport, monthlyReport, stockReport, creditReport, expenseReport } from './routes/reports';
import { createUser, deleteUser } from './routes/users';
import { listCustomers, createCustomer, recordPayment, customerStatement } from './routes/customers';
import { listVendors, createVendor } from './routes/vendors';
import { createPurchase, returnPurchase } from './routes/purchases';
import { listExpenses, createExpense } from './routes/expenses';
import { syncPush, syncPull } from './routes/sync';

const { preflight, corsify } = cors();

const router = AutoRouter({
  before: [preflight],
  finally: [corsify],
});

// ── Public route ──────────────────────────────────────────────────────────────
router.post('/auth/login', (req: Request, env: Env) => handleLogin(req, env));

// ── All other routes require auth ─────────────────────────────────────────────
// Helper: run auth then delegate to handler
function withAuth<T extends unknown[]>(
  handler: (req: Request, env: Env, user: ReturnType<typeof Object.create>, ...args: T) => Promise<Response>
) {
  return async (req: Request, env: Env, ctx: ExecutionContext, ...args: T): Promise<Response> => {
    const userOrError = await authMiddleware(req, env);
    if (userOrError instanceof Response) return userOrError;
    return handler(req, env, userOrError, ...args);
  };
}

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products',        withAuth(listProducts));
router.post('/products',       withAuth(createProduct));
router.put('/products/:id',    withAuth((req, env, user, { params }) => updateProduct(req, env, user, params.id)));
router.delete('/products/:id', withAuth((req, env, user, { params }) => deleteProduct(req, env, user, params.id)));

// ── Sales ─────────────────────────────────────────────────────────────────────
router.post('/sales', withAuth(createSale));
router.get('/sales',  withAuth(listSales));
router.get('/sales/:id/invoice', withAuth((req, env, user, { params }) => getSaleInvoice(req, env, user, params.id)));

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/daily',   withAuth(dailyReport));
router.get('/reports/monthly', withAuth(monthlyReport));
router.get('/reports/stock',   withAuth(stockReport));
router.get('/reports/credit',  withAuth(creditReport));
router.get('/reports/expenses', withAuth(expenseReport));

// ── Staff ─────────────────────────────────────────────────────────────────────
router.post('/users',        withAuth(createUser));
router.delete('/users/:id',  withAuth((req, env, user, { params }) => deleteUser(req, env, user, params.id)));

// ── Customers ─────────────────────────────────────────────────────────────────
router.get('/customers',                    withAuth(listCustomers));
router.post('/customers',                   withAuth(createCustomer));
router.post('/customers/:id/payment',       withAuth((req, env, user, { params }) => recordPayment(req, env, user, params.id)));
router.get('/customers/:id/statement',      withAuth((req, env, user, { params }) => customerStatement(req, env, user, params.id)));

// ── Vendors ───────────────────────────────────────────────────────────────────
router.get('/vendors',  withAuth(listVendors));
router.post('/vendors', withAuth(createVendor));

// ── Purchases ─────────────────────────────────────────────────────────────────
router.post('/purchases',             withAuth(createPurchase));
router.post('/purchases/:id/return',  withAuth((req, env, user, { params }) => returnPurchase(req, env, user, params.id)));

// ── Expenses ──────────────────────────────────────────────────────────────────
router.get('/expenses',  withAuth(listExpenses));
router.post('/expenses', withAuth(createExpense));

// ── Sync ──────────────────────────────────────────────────────────────────────
router.post('/sync/push', withAuth(syncPush));
router.get('/sync/pull',  withAuth(syncPull));

// ── 404 fallback ──────────────────────────────────────────────────────────────
router.all('*', () => json({ error: 'Not found' }, 404));

// ── Worker entry point ────────────────────────────────────────────────────────
export default {
  fetch: router.fetch,
} satisfies ExportedHandler<Env>;
