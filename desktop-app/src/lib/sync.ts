/**
 * Desktop Sync Engine
 * -------------------
 * Runs a background loop (every SYNC_INTERVAL_MS) that:
 *   1. Reads all unsynced local records via Tauri invoke()
 *   2. POSTs them to POST /sync/push (server assigns invoice_number, flags conflicts)
 *   3. GETs new records from GET /sync/pull?since=<last_sync_at>
 *   4. Upserts the pull response into local SQLite via apply_remote_catalog
 *
 * Also triggers immediately on window 'online' events (network reconnect).
 * Exposes reactive sync status through a tiny event-emitter pattern that
 * the React layer subscribes to.
 */

import { api, type RemoteCustomer, type RemoteProduct, type SyncedSaleEntry } from "./api";

// ── Config ───────────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 30_000; // 30 seconds
const API_URL = "https://shop-billing-worker.althafrahmanmp.workers.dev";

// ── Status type ───────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

type Listener = (state: SyncState) => void;

// ── Internal state ────────────────────────────────────────────────────────────

let _state: SyncState = {
  status: "idle",
  pendingCount: 0,
  lastSyncAt: localStorage.getItem("last_sync_at"),
  lastError: null,
};

const _listeners = new Set<Listener>();

function setState(patch: Partial<SyncState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach((fn) => fn(_state));
}

/** Subscribe to sync state changes. Returns an unsubscribe function. */
export function onSyncStateChange(fn: Listener): () => void {
  _listeners.add(fn);
  fn(_state); // emit current state immediately
  return () => _listeners.delete(fn);
}

/** Read current sync state without subscribing. */
export function getSyncState(): SyncState {
  return _state;
}

// ── Core sync tick ────────────────────────────────────────────────────────────

async function tick() {
  const jwt = localStorage.getItem("jwt");
  if (!jwt) return; // not logged in

  if (!navigator.onLine) {
    setState({ status: "offline" });
    return;
  }

  setState({ status: "syncing" });

  try {
    const headers = {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    };

    // ── 1. Push pending local records ─────────────────────────────────────────
    const pending = await api.getPendingSync();
    const hasPending =
      pending.sales.length > 0 ||
      pending.credit_payments.length > 0 ||
      pending.expenses.length > 0 ||
      pending.purchases.length > 0;

    if (hasPending) {
      const pushRes = await fetch(`${API_URL}/sync/push`, {
        method: "POST",
        headers,
        body: JSON.stringify(pending),
      });

      if (!pushRes.ok) throw new Error(`Push failed: ${pushRes.status}`);

      const pushData = (await pushRes.json()) as {
        synced: number;
        invoice_numbers: Record<string, number>;
        flagged: string[];
      };

      // Build entries array for markSalesSynced
      const entries: SyncedSaleEntry[] = pending.sales.map((sale) => ({
        id: sale.id,
        invoice_number: pushData.invoice_numbers?.[sale.id] ?? null,
      }));

      await api.markSalesSynced(entries, pushData.flagged ?? []);

      // Alert about any conflict-flagged sales
      if (pushData.flagged?.length) {
        console.warn(
          `[Sync] ${pushData.flagged.length} sale(s) were flagged for admin review (stock conflict):`,
          pushData.flagged,
        );
      }
    }

    // ── 2. Pull remote changes ─────────────────────────────────────────────────
    const since = _state.lastSyncAt ?? "1970-01-01T00:00:00Z";
    const pullRes = await fetch(
      `${API_URL}/sync/pull?since=${encodeURIComponent(since)}`,
      { headers },
    );

    if (!pullRes.ok) throw new Error(`Pull failed: ${pullRes.status}`);

    const pullData = (await pullRes.json()) as {
      as_of: string;
      products: RemoteProduct[];
      customers: RemoteCustomer[];
    };

    await api.applyRemoteCatalog(pullData.products ?? [], pullData.customers ?? []);

    // Persist last_sync_at
    const newSyncAt = pullData.as_of;
    localStorage.setItem("last_sync_at", newSyncAt);
    setState({ status: "synced", pendingCount: 0, lastSyncAt: newSyncAt, lastError: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Sync] Error:", message);
    setState({ status: "error", lastError: message });
  }
}

// ── Pending count poll (for badge accuracy between syncs) ────────────────────

async function refreshPendingCount() {
  try {
    const pending = await api.getPendingSync();
    const count =
      pending.sales.length +
      pending.credit_payments.length +
      pending.expenses.length +
      pending.purchases.length;
    if (count !== _state.pendingCount) {
      setState({ pendingCount: count });
    }
  } catch {
    // Non-fatal — DB might not be ready yet
  }
}

// ── Engine lifecycle ──────────────────────────────────────────────────────────

let _syncInterval: ReturnType<typeof setInterval> | null = null;
let _countInterval: ReturnType<typeof setInterval> | null = null;

function onReconnect() {
  console.log("[Sync] Network reconnected — triggering immediate sync");
  void tick();
}

/** Start the background sync engine. Call once after DB is initialized. */
export function startSync() {
  if (_syncInterval) return; // already running

  // Immediate first sync
  void tick();

  // Periodic syncs
  _syncInterval = setInterval(() => void tick(), SYNC_INTERVAL_MS);

  // Poll pending count more frequently for live badge
  _countInterval = setInterval(() => void refreshPendingCount(), 5_000);

  // Reconnect trigger
  window.addEventListener("online", onReconnect);

  console.log("[Sync] Engine started");
}

/** Stop the sync engine (e.g., on logout). */
export function stopSync() {
  if (_syncInterval) clearInterval(_syncInterval);
  if (_countInterval) clearInterval(_countInterval);
  _syncInterval = null;
  _countInterval = null;
  window.removeEventListener("online", onReconnect);
  setState({ status: "idle", pendingCount: 0 });
  console.log("[Sync] Engine stopped");
}

// ── React hook ────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

/** React hook — returns live sync state. Subscribes/unsubscribes automatically. */
export function useSyncStatus(): SyncState {
  const [state, setLocalState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    return onSyncStateChange(setLocalState);
  }, []);

  return state;
}
