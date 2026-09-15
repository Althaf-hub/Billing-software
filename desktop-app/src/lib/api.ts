import { invoke } from "@tauri-apps/api/core";

export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  stock_qty: number;
  low_stock_threshold: number;
  synced: number;
}

export interface SaleItemInput {
  product_id: string;
  quantity: number;
  price_at_sale: number;
}

export interface SaleInput {
  sold_by: string;
  customer_id: string | null;
  discount_amount: number;
  total_amount: number;
  payment_mode: string | null;
  device_id: string | null;
  items: SaleItemInput[];
}

// ── Sync-related types ────────────────────────────────────────────────────────

export interface PendingSyncPayload {
  sales: Array<SaleInput & { id: string; created_at: string; items: SaleItemInput[] }>;
  credit_payments: Array<{
    id: string;
    customer_id: string;
    amount: number;
    received_by: string | null;
    created_at: string;
  }>;
  expenses: Array<{ id: string; label: string; amount: number; created_at: string }>;
  purchases: Array<{
    id: string;
    vendor_id: string | null;
    total_amount: number;
    is_return: number;
    created_by: string | null;
    created_at: string;
    items: Array<{ product_id: string; quantity: number; cost_price: number }>;
  }>;
}

export interface SyncedSaleEntry {
  id: string;
  invoice_number: number | null;
}

export interface RemoteProduct {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  stock_qty: number;
  low_stock_threshold: number | null;
  updated_at: string | null;
}

export interface RemoteCustomer {
  id: string;
  name: string;
  phone: string | null;
  credit_balance: number | null;
  created_at: string | null;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  getProducts: async (): Promise<Product[]> => {
    return await invoke("get_products");
  },

  saveSale: async (sale: SaleInput): Promise<{ id: string; warnings: string[] }> => {
    // The rust backend returns a JSON string, so we need to parse it
    const responseStr: string = await invoke("save_sale", { sale });
    return JSON.parse(responseStr);
  },

  /** Returns all locally unsynced records (sales with items, credit payments, expenses, purchases). */
  getPendingSync: async (): Promise<PendingSyncPayload> => {
    const raw: string = await invoke("get_pending_sync");
    return JSON.parse(raw);
  },

  /** Batch-updates local sales with server-assigned invoice numbers and sets synced=1. */
  markSalesSynced: async (
    entries: SyncedSaleEntry[],
    flaggedIds: string[],
  ): Promise<void> => {
    await invoke("mark_sales_synced", { entries, flaggedIds });
  },

  /** Upserts product and customer records received from the server pull. */
  applyRemoteCatalog: async (
    products: RemoteProduct[],
    customers: RemoteCustomer[],
  ): Promise<void> => {
    await invoke("apply_remote_catalog", { products, customers });
  },
};
