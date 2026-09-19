import { useEffect, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { api, type Product } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DataTable, type DataTableColumn } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { useToast } from "../components/ui/toast";
import { Plus, RotateCcw, Package, ReceiptText, Boxes } from "lucide-react";

const money = (value: number) => `Rs.${value.toFixed(2)}`;
const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

type Vendor = Awaited<ReturnType<typeof api.getVendors>>[0];
type Purchase = Awaited<ReturnType<typeof api.getPurchases>>[0];
type Expense = Awaited<ReturnType<typeof api.getExpenses>>[0];

type SubTab = "vendors" | "purchases" | "expenses";
type LineItem = { product_id: string; product_name: string; quantity: string; cost_price: string };

export default function Procurement() {
  const { toast } = useToast();
  const [tab, setTab] = useState<SubTab>("vendors");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Vendor State
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");

  // Expense State
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // Purchase State
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseIsReturn, setPurchaseIsReturn] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[]>([{ product_id: "", product_name: "", quantity: "1", cost_price: "" }]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [editingLineIdx, setEditingLineIdx] = useState(0);

  const load = async () => {
    try {
      const [v, p, e, pr] = await Promise.all([api.getVendors(), api.getPurchases(), api.getExpenses(), api.getProducts()]);
      setVendors(v);
      setPurchases(p);
      setExpenses(e);
      setProducts(pr);
    } catch {
      toast("Could not load data.", "error");
    }
  };

  useEffect(() => { void load(); }, []);

  // Handlers
  const handleAddVendor = async () => {
    if (!vendorName.trim()) return;
    try {
      await api.saveVendor(vendorName.trim(), vendorPhone.trim() || null);
      setAddVendorOpen(false); setVendorName(""); setVendorPhone("");
      await load(); toast("Vendor added.");
    } catch { toast("Could not add vendor.", "error"); }
  };

  const handleAddExpense = async () => {
    if (!expenseLabel.trim() || !Number(expenseAmount)) return;
    try {
      await api.saveExpense(expenseLabel.trim(), Number(expenseAmount));
      setAddExpenseOpen(false); setExpenseLabel(""); setExpenseAmount("");
      await load(); toast("Expense recorded.");
    } catch { toast("Could not record expense.", "error"); }
  };

  const openNewPurchase = (asReturn = false) => {
    setPurchaseIsReturn(asReturn);
    setSelectedVendorId("");
    setLineItems([{ product_id: "", product_name: "", quantity: "1", cost_price: "" }]);
    setPurchaseOpen(true);
  };

  const addLine = () => setLineItems((prev) => [...prev, { product_id: "", product_name: "", quantity: "1", cost_price: "" }]);
  const removeLine = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: keyof LineItem, value: string) => setLineItems((prev) => prev.map((line, i) => i === idx ? { ...line, [field]: value } : line));

  const selectProduct = (product: Product) => {
    updateLine(editingLineIdx, "product_id", product.id);
    updateLine(editingLineIdx, "product_name", product.name);
    setProductPickerOpen(false);
  };

  const handleSavePurchase = async () => {
    const valid = lineItems.filter((l) => l.product_id && Number(l.quantity) > 0 && Number(l.cost_price) >= 0);
    if (!valid.length) return toast("Add at least one product.", "error");
    try {
      await api.savePurchase(
        selectedVendorId || null,
        valid.reduce((s, l) => s + Number(l.quantity) * Number(l.cost_price), 0),
        localStorage.getItem("user_id"),
        valid.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity), cost_price: Number(l.cost_price) })),
        purchaseIsReturn
      );
      setPurchaseOpen(false);
      await load();
      toast(purchaseIsReturn ? "Return recorded." : "Purchase recorded.");
    } catch { toast("Could not record purchase.", "error"); }
  };

  // Columns
  const vendorCols: DataTableColumn<Vendor>[] = [
    { header: "Name", cell: (r) => <p className="font-medium">{r.name}</p> },
    { header: "Phone", cell: (r) => <p className="text-muted-foreground">{r.phone || "N/A"}</p> },
  ];

  const purchaseCols: DataTableColumn<Purchase>[] = [
    { header: "Date", cell: (r) => <p>{fmtDate(r.created_at)}</p> },
    { header: "Vendor", cell: (r) => <div className="flex items-center gap-2"><span className="font-medium">{r.vendor_name || "Walk-in vendor"}</span>{r.is_return === 1 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Return</span>}</div> },
    { header: "Amount", cell: (r) => <span className={r.is_return === 1 ? "font-bold text-destructive" : "font-bold"}>{r.is_return === 1 ? "-" : "+"}{money(r.total_amount)}</span> },
  ];

  const expenseCols: DataTableColumn<Expense>[] = [
    { header: "Date", cell: (r) => <p>{fmtDate(r.created_at)}</p> },
    { header: "Label", cell: (r) => <p className="font-medium">{r.label}</p> },
    { header: "Amount", cell: (r) => <span className="font-bold">{money(r.amount)}</span> },
  ];

  const productCols: DataTableColumn<Product>[] = [
    { header: "Product", cell: (r) => <p className="font-medium">{r.name}</p> },
    { header: "Stock", cell: (r) => <p className="text-muted-foreground">{r.stock_qty}</p> },
    { header: "", cell: (r) => <Button size="sm" onClick={() => selectProduct(r)}>Select</Button> }
  ];

  return (
    <AppShell title="Procurement" subtitle="Vendors, Purchases, and Expenses">
      <div className="h-full overflow-auto p-4 sm:p-6 flex flex-col gap-4">
        
        {/* Tabs */}
        <div className="flex gap-2">
          <Button variant={tab === "vendors" ? "default" : "outline"} onClick={() => setTab("vendors")}><Boxes className="mr-2 h-4 w-4" />Vendors</Button>
          <Button variant={tab === "purchases" ? "default" : "outline"} onClick={() => setTab("purchases")}><Package className="mr-2 h-4 w-4" />Purchases</Button>
          <Button variant={tab === "expenses" ? "default" : "outline"} onClick={() => setTab("expenses")}><ReceiptText className="mr-2 h-4 w-4" />Expenses</Button>
        </div>

        {tab === "vendors" && (
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Vendors</CardTitle>
              <Button onClick={() => setAddVendorOpen(true)}><Plus className="mr-2 h-4 w-4" />Add vendor</Button>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <DataTable columns={vendorCols} rows={vendors} getRowKey={(r) => r.id} emptyTitle="No vendors yet" emptyDescription="Add a vendor to get started." />
            </CardContent>
          </Card>
        )}

        {tab === "purchases" && (
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Purchases</CardTitle>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={() => openNewPurchase(true)}><RotateCcw className="mr-2 h-4 w-4" />Record return</Button>
                <Button onClick={() => openNewPurchase(false)}><Plus className="mr-2 h-4 w-4" />Record purchase</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <DataTable columns={purchaseCols} rows={purchases} getRowKey={(r) => r.id} emptyTitle="No purchases yet" emptyDescription="Record a purchase to add stock." />
            </CardContent>
          </Card>
        )}

        {tab === "expenses" && (
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Expenses</CardTitle>
              <Button onClick={() => setAddExpenseOpen(true)}><Plus className="mr-2 h-4 w-4" />Add expense</Button>
            </CardHeader>
            <CardContent className="p-0 flex-1">
              <DataTable columns={expenseCols} rows={expenses} getRowKey={(r) => r.id} emptyTitle="No expenses yet" emptyDescription="Record expenses here." />
            </CardContent>
          </Card>
        )}

      </div>

      {/* Add Vendor Modal */}
      <Modal open={addVendorOpen} title="Add vendor" onClose={() => setAddVendorOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          <Input placeholder="Phone number (optional)" value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} />
          <Button className="w-full" onClick={() => void handleAddVendor()} disabled={!vendorName.trim()}>Save vendor</Button>
        </div>
      </Modal>

      {/* Add Expense Modal */}
      <Modal open={addExpenseOpen} title="Add expense" onClose={() => setAddExpenseOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Label (e.g. Rent, Electricity)" value={expenseLabel} onChange={(e) => setExpenseLabel(e.target.value)} />
          <Input type="number" placeholder="Amount (Rs.)" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
          <Button className="w-full" onClick={() => void handleAddExpense()} disabled={!expenseLabel.trim() || !Number(expenseAmount)}>Save expense</Button>
        </div>
      </Modal>

      {/* Record Purchase Modal */}
      <Modal open={purchaseOpen} title={purchaseIsReturn ? "Record Return" : "Record Purchase"} onClose={() => setPurchaseOpen(false)}>
        <div className="space-y-4 max-h-[70vh] overflow-auto">
          <div className="space-y-1">
            <label className="text-sm font-medium">Vendor (Optional)</label>
            <select className="w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)}>
              <option value="">Walk-in vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Products *</label>
            {lineItems.map((line, idx) => (
              <div key={idx} className="flex flex-col gap-2 p-3 border rounded-lg bg-muted/30">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 justify-start" onClick={() => { setEditingLineIdx(idx); setProductPickerOpen(true); }}>
                    {line.product_name || "Pick product"}
                  </Button>
                  {lineItems.length > 1 && <Button variant="ghost" className="text-destructive p-2" onClick={() => removeLine(idx)}>Remove</Button>}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Qty</label>
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Cost Price</label>
                    <Input type="number" placeholder="0.00" value={line.cost_price} onChange={(e) => updateLine(idx, "cost_price", e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addLine}><Plus className="mr-2 h-3 w-3" />Add another product</Button>
          </div>

          <div className="flex justify-between items-center py-2 border-t">
            <span className="font-medium text-muted-foreground">Total</span>
            <span className="text-xl font-bold">{money(lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0), 0))}</span>
          </div>

          <Button className="w-full" variant={purchaseIsReturn ? "destructive" : "default"} onClick={() => void handleSavePurchase()}>
            {purchaseIsReturn ? "Save Return" : "Save Purchase"}
          </Button>
        </div>
      </Modal>

      {/* Product Picker Modal */}
      <Modal open={productPickerOpen} title="Select Product" onClose={() => setProductPickerOpen(false)}>
        <div className="max-h-[60vh] overflow-auto border rounded-lg">
           <DataTable columns={productCols} rows={products} getRowKey={(r) => r.id} emptyTitle="No products" emptyDescription="No products available." />
        </div>
      </Modal>

    </AppShell>
  );
}
