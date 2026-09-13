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

export const api = {
  getProducts: async (): Promise<Product[]> => {
    return await invoke("get_products");
  },
  
  saveSale: async (sale: SaleInput): Promise<{ id: string, warnings: string[] }> => {
    // The rust backend returns a JSON string, so we need to parse it
    const responseStr: string = await invoke("save_sale", { sale });
    return JSON.parse(responseStr);
  }
};
