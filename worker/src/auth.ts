import { sign, verify } from '@tsndr/cloudflare-worker-jwt';

const EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

export async function signJwt(
  payload: { user_id: string; shop_id: string; role: string },
  secret: string
): Promise<string> {
  return sign(
    { ...payload, exp: Math.floor(Date.now() / 1000) + EXPIRY_SECONDS },
    secret
  );
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<{ user_id: string; shop_id: string; role: 'admin' | 'salesman'; exp: number } | null> {
  try {
    // v3: verify() returns JwtData { header, payload } or undefined
    const data = await verify<{ user_id: string; shop_id: string; role: 'admin' | 'salesman'; exp: number }>(
      token,
      secret
    );
    if (!data) return null;
    return data.payload as { user_id: string; shop_id: string; role: 'admin' | 'salesman'; exp: number };
  } catch {
    return null;
  }
}
