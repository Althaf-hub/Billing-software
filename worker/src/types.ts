// Shared Cloudflare Worker environment bindings type
export interface Env {
  shop_billing_db: D1Database;
  JWT_SECRET: string; // set via: wrangler secret put JWT_SECRET
}

// Decoded JWT payload attached to every authenticated request
export interface JwtPayload {
  user_id: string;
  shop_id: string;
  role: 'admin' | 'salesman';
  exp: number;
}

// Extend the request with auth context after middleware runs
export interface AuthedRequest extends Request {
  user: JwtPayload;
}
