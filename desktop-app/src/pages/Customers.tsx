import { useEffect, useState } from "react";
import { Plus, ReceiptText } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { api, type Customer } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DataTable, type DataTableColumn } from "../components/ui/data-table";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { useToast } from "../components/ui/toast";

const money = (value: number) => `₹${value.toFixed(2)}`;
type Statement = Awaited<ReturnType<typeof api.getCustomerStatement>>;

export default function Customers() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [limit, setLimit] = useState("5000"); const [payment, setPayment] = useState("");
  const load = async () => { try { setCustomers(await api.getCustomers()); } catch { toast("Could not load local customers.", "error"); } };
  useEffect(() => { void load(); }, []);
  const showStatement = async (id: string) => { try { setStatement(await api.getCustomerStatement(id)); setPayment(""); } catch { toast("Could not load customer statement.", "error"); } };
  const add = async () => { if (!name.trim()) return; try { await api.saveCustomer(name.trim(), phone.trim() || null, Number(limit) || 5000); setAddOpen(false); setName(""); setPhone(""); await load(); toast("Customer added."); } catch { toast("Could not add customer.", "error"); } };
  const collect = async () => { if (!statement) return; try { await api.recordCreditPayment(statement.customer.id, Number(payment), localStorage.getItem("user_id")); await showStatement(statement.customer.id); await load(); toast("Payment recorded locally."); } catch (error) { toast(error instanceof Error ? error.message : "Payment could not be recorded.", "error"); } };
  const columns: DataTableColumn<Customer>[] = [
    { header: "Customer", cell: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.phone ?? "No phone"}</p></div> },
    { header: "Outstanding", cell: (row) => <span className={row.credit_balance > 0 ? "font-semibold text-destructive" : "text-emerald-600"}>{money(row.credit_balance)}</span> },
    { header: "Credit limit", cell: (row) => money(row.credit_limit) },
    { header: "", cell: (row) => <Button size="sm" variant="outline" onClick={() => void showStatement(row.id)}><ReceiptText className="mr-2 h-4 w-4" />Statement</Button> },
  ];
  return <AppShell title="Customers" subtitle="Credit balances and payment statements">
    <div className="h-full overflow-auto p-4 sm:p-6"><div className="mb-5 flex justify-end"><Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Add customer</Button></div><Card><CardHeader><CardTitle>Customer balances</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={customers} getRowKey={(row) => row.id} emptyTitle="No customers yet" emptyDescription="Add a customer before recording a credit sale." /></CardContent></Card></div>
    <Modal open={addOpen} title="Add customer" onClose={() => setAddOpen(false)}><div className="space-y-3"><Input placeholder="Customer name" value={name} onChange={(event) => setName(event.target.value)} /><Input placeholder="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} /><Input type="number" placeholder="Credit limit" value={limit} onChange={(event) => setLimit(event.target.value)} /><Button className="w-full" onClick={() => void add()}>Save customer</Button></div></Modal>
    <Modal open={Boolean(statement)} title={statement ? `${statement.customer.name}'s statement` : "Statement"} onClose={() => setStatement(null)}><div className="space-y-4"><p className="rounded-lg bg-muted p-3 text-sm">Outstanding: <strong>{statement && money(statement.customer.credit_balance)}</strong> · Limit: {statement && money(statement.customer.credit_limit)}</p><div className="max-h-52 overflow-auto">{statement?.entries.map((entry, index) => <div className="flex justify-between border-b py-2 text-sm" key={`${entry.reference}-${index}`}><span>{entry.type === "sale" ? "Credit sale" : "Payment"}<br /><small className="text-muted-foreground">{entry.created_at}</small></span><span className={entry.amount >= 0 ? "text-destructive" : "text-emerald-600"}>{entry.amount >= 0 ? "+" : ""}{money(entry.amount)}<br /><small>Due {money(entry.running_balance)}</small></span></div>)}</div><div className="flex gap-2"><Input type="number" min="0" placeholder="Payment received" value={payment} onChange={(event) => setPayment(event.target.value)} /><Button disabled={!payment || !statement || Number(payment) > statement.customer.credit_balance} onClick={() => void collect()}>Record payment</Button></div></div></Modal>
  </AppShell>;
}
