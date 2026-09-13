import { useState, useEffect, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Search, ShoppingCart, Plus, Minus, X, CreditCard, Banknote, Smartphone, User, ArrowRight, Share2, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { api, Product } from "../lib/api";

type CartItem = Product & {
  cartQuantity: number;
  itemDiscount: number;
};

export default function Billing() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "credit">("cash");
  const [isProcessing, setIsProcessing] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load products from local DB on mount
    loadProducts();
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

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    if (paymentMode === "credit" && !customerPhone) {
      alert("Customer phone is required for credit sales.");
      return;
    }

    setIsProcessing(true);
    setWarnings([]);

    try {
      const saleInput = {
        sold_by: localStorage.getItem("user_id") || "user-admin-001",
        customer_id: null, // We should lookup or create customer, simplified here
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
        alert("Sale completed successfully!");
      }
      
      setCart([]);
      setPaymentMode("cash");
      setCustomerPhone("");
      loadProducts(); // refresh stock
    } catch (err: any) {
      console.error(err);
      alert("Failed to complete sale: " + err);
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

  return (
    <div className="flex h-screen bg-background overflow-hidden p-4 gap-4">
      
      {/* LEFT PANEL: Cart & Search */}
      <div className="flex-1 flex flex-col gap-4 max-w-3xl border-r border-border/50 pr-4">
        
        {/* Search Header */}
        <div className="flex items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
          <div className="bg-primary/20 p-3 rounded-lg text-primary">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Point of Sale</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Local Database Active
            </p>
          </div>
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
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-60">
                <ShoppingCart className="w-16 h-16 mb-2" />
                <p className="text-lg">Cart is empty</p>
                <p className="text-sm">Scan items to begin</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {cart.map((item, idx) => (
                  <div key={item.id + idx} className="p-4 flex items-center gap-4 hover:bg-muted/10 transition-colors">
                    <div className="flex-1">
                      <h3 className="font-semibold text-base">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">₹{item.price} per item</p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-1 border">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={() => updateQuantity(item.id, -1)}>
                        <Minus className="w-4 h-4" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.cartQuantity}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-background" onClick={() => updateQuantity(item.id, 1)}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="w-24 text-right font-bold text-lg">
                      ₹{item.price * item.cartQuantity}
                    </div>
                    
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => removeItem(item.id)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
              <Input 
                placeholder="Phone number (required for credit)" 
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="bg-background"
              />
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
            {warnings.length > 0 && customerPhone && (
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
  );
}
