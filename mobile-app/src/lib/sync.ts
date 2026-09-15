/**
 * Mobile Sync Engine
 * ------------------
 * Runs a background loop (every SYNC_INTERVAL_MS) that:
 *   1. Reads all unsynced local records (sales+items, credit_payments, expenses, purchases)
 *   2. POSTs them to POST /sync/push (server assigns invoice_number, flags conflicts)
 *   3. GETs new records from GET /sync/pull?since=<last_sync_at>
 *   4. Upserts pull response into local SQLite
 *
 * Also triggers immediately when the device regains internet (NetInfo reconnect).
 * Sync state is written to useSyncStore so any screen can display it.
 */

import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import {
  applyRemoteCatalog,
  getMeta,
  getPendingCreditPayments,
  getPendingExpenses,
  getPendingPurchases,
  getPendingSales,
  getPendingSyncCount,
  getSaleItems,
  markSalesSynced,
  setMeta,
} from './db';
import { useAuthStore, useSyncStore } from './store';

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL = 'https://shop-billing-worker.althafrahmanmp.workers.dev';
const SYNC_INTERVAL_MS = 30_000; // 30 seconds

// ── Device ID (persisted across sessions) ─────────────────────────────────────

async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync('device_id');
  if (existing) return existing;
  const id = `mobile-${uuidv4()}`;
  await SecureStore.setItemAsync('device_id', id);
  return id;
}

// ── Core sync tick ────────────────────────────────────────────────────────────

export async function syncNow(): Promise<{ status: 'synced' | 'offline' | 'error'; synced: number }> {
  const { jwt } = useAuthStore.getState();
  const { setSyncStatus, setPendingCount, setLastSyncAt } = useSyncStore.getState();

  const network = await Network.getNetworkStateAsync();
  if (!jwt || !network.isConnected || !network.isInternetReachable) {
    setSyncStatus('offline');
    // Refresh pending count so badge stays accurate even when offline
    const pending = await getPendingSyncCount();
    setPendingCount(pending);
    return { status: 'offline', synced: 0 };
  }

  setSyncStatus('syncing');

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    };

    // ── 1. Gather pending records ─────────────────────────────────────────────
    const [pendingSales, creditPayments, expenses, purchases] = await Promise.all([
      getPendingSales(),
      getPendingCreditPayments(),
      getPendingExpenses(),
      getPendingPurchases(),
    ]);

    const devId = await deviceId();
    const salesWithItems = await Promise.all(
      pendingSales.map(async (sale) => ({
        ...sale,
        device_id: sale.device_id ?? devId,
        items: await getSaleItems(sale.id),
      })),
    );

    // ── 2. Push ───────────────────────────────────────────────────────────────
    if (salesWithItems.length || creditPayments.length || expenses.length || purchases.length) {
      const pushRes = await fetch(`${API_URL}/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sales: salesWithItems,
          credit_payments: creditPayments,
          expenses,
          purchases,
        }),
      });

      if (!pushRes.ok) throw new Error(`Push failed: ${pushRes.status}`);

      const pushData = (await pushRes.json()) as {
        synced: number;
        invoice_numbers: Record<string, number>;
        flagged: string[];
      };

      await markSalesSynced(
        pendingSales.map((s) => s.id),
        pushData.invoice_numbers ?? {},
        pushData.flagged ?? [],
      );

      // Log conflict-flagged sales for the admin
      if (pushData.flagged?.length) {
        console.warn(
          `[Sync] ${pushData.flagged.length} sale(s) flagged for admin review (stock conflict):`,
          pushData.flagged,
        );
      }
    }

    // ── 3. Pull ───────────────────────────────────────────────────────────────
    const since = (await getMeta('last_sync_at')) ?? '1970-01-01T00:00:00Z';
    const pullRes = await fetch(
      `${API_URL}/sync/pull?since=${encodeURIComponent(since)}`,
      { headers },
    );

    if (!pullRes.ok) throw new Error(`Pull failed: ${pullRes.status}`);

    const remote = (await pullRes.json()) as {
      as_of: string;
      products: any[];
      customers: any[];
    };

    await applyRemoteCatalog(remote.products ?? [], remote.customers ?? []);
    await setMeta('last_sync_at', remote.as_of);

    setSyncStatus('synced');
    setPendingCount(0);
    setLastSyncAt(remote.as_of);

    return { status: 'synced', synced: salesWithItems.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync] Error:', message);
    setSyncStatus('error');
    // Refresh pending count so badge shows correct number
    const count = await getPendingSyncCount();
    setPendingCount(count);
    return { status: 'error', synced: 0 };
  }
}

// ── Engine lifecycle ──────────────────────────────────────────────────────────

let _syncIntervalId: ReturnType<typeof setInterval> | null = null;
let _countIntervalId: ReturnType<typeof setInterval> | null = null;

/** Start the background sync engine. Call once after the user is logged in. */
export function startSyncEngine() {
  if (_syncIntervalId) return; // already running

  // Trigger immediately
  void syncNow();

  // Periodic sync every 30 s
  _syncIntervalId = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);

  // Poll pending count every 5 s (so badge refreshes even between full syncs)
  _countIntervalId = setInterval(async () => {
    const count = await getPendingSyncCount();
    useSyncStore.getState().setPendingCount(count);
  }, 5_000);

  console.log('[Sync] Mobile engine started');
}

/** Stop the sync engine (call on logout). */
export function stopSyncEngine() {
  if (_syncIntervalId) clearInterval(_syncIntervalId);
  if (_countIntervalId) clearInterval(_countIntervalId);
  _syncIntervalId = null;
  _countIntervalId = null;
  useSyncStore.getState().setSyncStatus('idle');
  console.log('[Sync] Mobile engine stopped');
}
