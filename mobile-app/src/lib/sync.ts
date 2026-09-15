import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { applyRemoteCatalog, getMeta, getPendingSales, getSaleItems, markSalesSynced, setMeta } from './db';
import { useAuthStore } from './store';

const API_URL = 'https://shop-billing-worker.althafrahmanmp.workers.dev';

async function deviceId() {
  const existing = await SecureStore.getItemAsync('device_id');
  if (existing) return existing;
  const id = `mobile-${uuidv4()}`;
  await SecureStore.setItemAsync('device_id', id);
  return id;
}

export async function syncNow() {
  const { jwt } = useAuthStore.getState();
  const network = await Network.getNetworkStateAsync();
  if (!jwt || !network.isConnected || !network.isInternetReachable) return { status: 'offline' as const, synced: 0 };

  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  const pending = await getPendingSales();
  if (pending.length) {
    const sales = await Promise.all(pending.map(async (sale) => ({
      ...sale,
      device_id: sale.device_id ?? await deviceId(),
      items: await getSaleItems(sale.id),
    })));
    const push = await fetch(`${API_URL}/sync/push`, { method: 'POST', headers, body: JSON.stringify({ sales }) });
    if (!push.ok) throw new Error('Unable to upload offline sales.');
    const result = await push.json() as { invoice_numbers: Record<string, number> };
    await markSalesSynced(pending.map((sale) => sale.id), result.invoice_numbers ?? {});
  }

  const since = await getMeta('last_sync_at') ?? '1970-01-01T00:00:00Z';
  const pull = await fetch(`${API_URL}/sync/pull?since=${encodeURIComponent(since)}`, { headers });
  if (!pull.ok) throw new Error('Unable to refresh shop data.');
  const remote = await pull.json() as { as_of: string; products: any[]; customers: any[] };
  await applyRemoteCatalog(remote.products ?? [], remote.customers ?? []);
  await setMeta('last_sync_at', remote.as_of);
  return { status: 'synced' as const, synced: pending.length };
}
