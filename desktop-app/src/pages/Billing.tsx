import { useState, useEffect, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Search, ShoppingCart, Plus, Minus, X, CreditCard, Banknote, Smartphone, User, ArrowRight, Share2, AlertCircle, RefreshCw, WifiOff, CheckCircle2, Clock, Package } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { api, Product, type Customer } from "../lib/api";
import { useSyncStatus } from "../lib/sync";
import { AppShell } from "../components/layout/AppShell";
import { DataTable, type DataTableColumn } from "../components/ui/data-table";
import { StatCard } from "../components/ui/stat-card";
import { useToast } from "../components/ui/toast";

type CartItem = Product & {
  cartQuantity: number;
  itemDiscount: number;
};

// ── Sync status badge ─────────────────────────────────────────────────────────
import type { SyncStatus } from "../lib/sync";

function SyncBadge({ status, pendingCount }: { status: SyncStatus; pendingCount: number }) {
  if (status === "syncing") {
    return (
      <p className="text-sm text-blue-500 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        Syncing…
      </p>
    );
  }
  if (status === "offline") {
    return (
      <p className="text-sm text-red-400 flex items-center gap-1.5">
        <WifiOff className="w-3.5 h-3.5" />
        Offline — data saved locally
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className="text-sm text-destructive flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5" />
        Sync error — will retry
      </p>
    );
  }
  if (pendingCount > 0) {
    return (
      <p className="text-sm text-amber-500 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        Pending ({pendingCount} record{pendingCount !== 1 ? "s" : ""})
      </p>
    );
  }
  return (
    <p className="text-sm text-green-500 flex items-center gap-1.5">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Synced ✓
    </p>
  );
}

export default function Billing() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "credit">("cash");
  const [isProcessing, setIsProcessing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const sync = useSyncStatus();
  const { toast } = useToast();
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load products from local DB on mount
    loadProducts();
    api.getCustomers().then(setCustomers).catch(() => setCustomers([]));
    // Focus search on mount for barcode scanners
    searchInputRef.current?.focus();
  }, []);

  const loadProducts = async () => {
    try {
      // If we don't have rust backend running (dev mode in browser), we'd need mock data.
      // But we assume this runs in Tauri context.
      const data = await api.getProducts();
      setProducts(data || []);
    } catch (e) {
      console.warn("Failed to load products from DB, probably running in browser.", e);
      // Fallback mock for UI design testing
      setProducts([
        { id: "1", name: "Lays Classic Chips", barcode: "8901015144009", price: 20, stock_qty: 50, low_stock_threshold: 10, synced: 1 },
        { id: "2", name: "Parle-G Biscuit", barcode: "8901719110116", price: 10, stock_qty: 80, low_stock_threshold: 15, synced: 1 },
      ]);
    }
  };

  // Keyboard shortcut listener to always refocus the search bar (useful for barcode scanners)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If pressing a letter/number and no input is focused, focus search
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!search) return [];
    return products.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) || 
      (p.barcode && p.barcode.includes(search))
    );
  }, [search, products]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearch("");
    }
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
        );
      }
      return [...prev, { ...product, cartQuantity: 1, itemDiscount: 0 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.cartQuantity + delta;
        return newQ > 0 ? { ...item, cartQuantity: newQ } : item;
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.cartQuantity), 0);
  const totalDiscount = cart.reduce((acc, item) => acc + item.itemDiscount, 0);
  const total = subtotal - totalDiscount;
  const customerPhone = customers.find((customer) => customer.id === customerId)?.phone ?? "";

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    const customer = customers.find((item) => item.id === customerId);
    if (paymentMode === "credit" && !customer) {
      toast("Select a customer before recording a credit sale.", "error");
      return;
    }
    if (paymentMode === "credit" && customer && customer.credit_balance + total > customer.credit_limit) toast(`${customer.name} will exceed their ₹${customer.credit_limit.toFixed(0)} credit limit.`, "error");

    setIsProcessing(true);
    setWarnings([]);

    try {
      const saleInput = {
        sold_by: localStorage.getItem("user_id") || "user-admin-001",
        customer_id: customerId || null,
        discount_amount: totalDiscount,
        total_amount: total,
        payment_mode: paymentMode,
        device_id: "POS-1",
        items: cart.map(item => ({
          product_id: item.id,
          quantity: item.cartQuantity,
          price_at_sale: item.price
        }))
      };

      const res = await api.saveSale(saleInput);
      
      if (res.warnings && res.warnings.length > 0) {
        setWarnings(res.warnings);
      } else {
        toast("Sale saved locally and queued for sync.");
      }
      
      setCart([]);
      setPaymentMode("cash");
      setCustomerId("");
      loadProducts(); // refresh stock
    } catch (err: any) {
      console.error(err);
      toast(`Failed to complete sale: ${String(err)}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const upiId = "shop@upi";
  const upiString = `upi://pay?pa=${upiId}&pn=Shop&am=${total}&cu=INR`;

  const generateWhatsAppLink = () => {
    const text = `*Receipt from Shop*\n\n` +
      cart.map(i => `${i.name} x${i.cartQuantity} - ₹${i.price * i.cartQuantity}`).join('\n') +
      `\n\n*Total: ₹${total}*`;
    return `https://wa.me/${customerPhone}?text=${encodeURIComponent(text)}`;
  };

  const cartColumns: DataTableColumn<CartItem>[] = [
    { header: "Product", cell: (item) => <div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">₹{item.price.toFixed(2)} each</p></div> },
    { header: "Quantity", className: "w-36", cell: (item) => <div className="flex w-fit items-center gap-1 rounded-lg border bg-muted/30 p-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}><Minus className="h-3.5 w-3.5" /></Button><span className="w-6 text-center text-sm font-medium">{item.cartQuantity}</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}><Plus className="h-3.5 w-3.5" /></Button></div> },
    { header: "Total", className: "w-28 text-right", cell: (item) => <div className="flex items-center justify-end gap-1"><span className="font-semibold">₹{(item.price * item.cartQuantity).toFixed(2)}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.name}`}><X className="h-4 w-4" /></Button></div> },
  ];

  return (
    <AppShell title="Billing" subtitle="Create a sale even when you are offline">
    <div className="flex h-full min-h-0 gap-4 overflow-hidden p-4">
      
      {/* LEFT PANEL: Cart & Search */}
      <div className="flex-1 flex flex-col gap-4 max-w-3xl border-r border-border/50 pr-4">
        
        {/* Search Header */}
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
          <div className="bg-primary/20 p-3 rounded-lg text-primary">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold tracking-tight">Point of Sale</h2>
            <SyncBadge status={sync.status} pendingCount={sync.pendingCount} />
          </div>
          <div className="hidden w-44 xl:block"><StatCard label="Order total" value={`₹${total.toFixed(2)}`} detail={`${cart.length} line item${cart.length === 1 ? "" : "s"}`} icon={<Package className="h-4 w-4" />} /></div>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <Input 
            ref={searchInputRef}
            placeholder="Scan barcode or search products... (Press Enter to add)"
            className="w-full pl-10 h-14 text-lg bg-card shadow-sm border-primary/20 focus-visible:ring-primary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && filteredProducts.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border rounded-lg shadow-xl z-50 max-h-60 overflow-auto divide-y divide-border/50">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-4 py-3 hover:bg-accent/50 flex justify-between items-center transition-colors"
                  onClick={() => { addToCart(p); setSearch(""); searchInputRef.current?.focus(); }}
                >
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.barcode} • Stock: {p.stock_qty}</div>
                  </div>
                  <div className="font-medium text-primary">₹{p.price}</div>
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Cart Table */}
        <Card className="flex-1 overflow-hidden flex flex-col shadow-sm">
          <CardHeader className="py-4 border-b bg-muted/20">
            <CardTitle className="text-lg flex justify-between">
              <span>Current Order</span>
              <span className="text-muted-foreground font-normal text-sm">{cart.length} items</span>
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-auto p-0">
            <DataTable columns={cartColumns} rows={cart} getRowKey={(item) => item.id} emptyTitle="Cart is empty" emptyDescription="Scan or search for a product to begin." />
          </div>
        </Card>
      </div>

      {/* RIGHT PANEL: Summary & Checkout */}
      <div className="w-[400px] flex flex-col gap-4">
        
        <Card className="flex-1 flex flex-col shadow-sm border-t-4 border-t-primary">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Checkout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 flex-1 overflow-auto">
            
            {/* Customer Info */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-xl border">
              <Label className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" /> Customer Details
              </Label>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Walk-in customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · Due ₹{customer.credit_balance.toFixed(2)}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Choose a customer for credit sales. Add a new one in Customers.</p>
            </div>

            {/* Payment Modes */}
            <div className="space-y-3">
              <Label className="text-muted-foreground">Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button"
                  variant={paymentMode === "cash" ? "default" : "outline"}
                  className="h-12 flex gap-2 justify-start px-4"
                  onClick={() => setPaymentMode("cash")}
                >
                  <Banknote className="w-5 h-5" /> Cash
                </Button>
                <Button 
                  type="button"
                  variant={paymentMode === "upi" ? "default" : "outline"}
                  className="h-12 flex gap-2 justify-start px-4"
                  onClick={() => setPaymentMode("upi")}
                >
                  <Smartphone className="w-5 h-5" /> UPI
                </Button>
                <Button 
                  type="button"
                  variant={paymentMode === "card" ? "default" : "outline"}
                  className="h-12 flex gap-2 justify-start px-4"
                  onClick={() => setPaymentMode("card")}
                >
                  <CreditCard className="w-5 h-5" /> Card
                </Button>
                <Button 
                  type="button"
                  variant={paymentMode === "credit" ? "default" : "outline"}
                  className="h-12 flex gap-2 justify-start px-4"
                  onClick={() => setPaymentMode("credit")}
                >
                  <User className="w-5 h-5" /> Credit
                </Button>
              </div>
            </div>

            {/* UPI QR Display */}
            {paymentMode === "upi" && total > 0 && (
              <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl border-2 border-dashed border-muted animate-in fade-in zoom-in duration-300">
                <QRCodeSVG value={upiString} size={160} />
                <p className="mt-4 font-medium text-black">Scan to pay ₹{total}</p>
                <p className="text-xs text-black/60 mt-1">{upiId}</p>
              </div>
            )}

            {/* Warnings Display */}
            {warnings.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-sm flex flex-col gap-2 animate-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-5 h-5" />
                  Warnings (Sale Completed)
                </div>
                <ul className="list-disc pl-5">
                  {warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            
          </CardContent>

          {/* Totals & Submit */}
          <div className="p-6 bg-muted/20 border-t mt-auto">
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-destructive">
                <span>Discount</span>
                <span>- ₹{totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-2xl font-bold pt-4 border-t mt-2">
                <span>Total</span>
                <span className="text-primary">₹{total.toFixed(2)}</span>
              </div>
            </div>

            <Button 
              className="w-full h-16 text-lg font-bold shadow-xl shadow-primary/20 rounded-xl"
              onClick={handleCompleteSale}
              disabled={cart.length === 0 || isProcessing}
            >
              {isProcessing ? "Processing..." : (
                <span className="flex items-center gap-2">
                  Complete Sale <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>

            {/* Post-sale Actions */}
            {warnings.length > 0 && customers.find((customer) => customer.id === customerId)?.phone && (
              <Button 
                variant="outline" 
                className="w-full mt-3 h-12 flex gap-2 border-green-500/30 text-green-500 hover:bg-green-500 hover:text-white"
                onClick={() => window.open(generateWhatsAppLink(), "_blank")}
              >
                <Share2 className="w-4 h-4" /> Share Receipt on WhatsApp
              </Button>
            )}
          </div>
        </Card>

      </div>
    </div>
    </AppShell>
  );
}
