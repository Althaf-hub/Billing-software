import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DataTable, type DataTableColumn } from "../components/ui/data-table";
import { StatCard } from "../components/ui/stat-card";
import { useToast } from "../components/ui/toast";

const API_URL = "https://shop-billing-worker.althafrahmanmp.workers.dev";
type Row = Record<string, unknown>;
type ReportId = "daily" | "monthly" | "stock" | "credit" | "expenses";

const reportOptions: Array<{ id: ReportId; label: string }> = [
  { id: "daily", label: "Daily sales" }, { id: "monthly", label: "Monthly sales" },
  { id: "stock", label: "Stock" }, { id: "credit", label: "Customer credit" }, { id: "expenses", label: "Expenses" },
];

function text(value: unknown) { return value === null || value === undefined ? "-" : String(value); }
function money(value: unknown) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value ?? 0)); }
function csvCell(value: unknown) { const source = text(value); return /[",\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source; }
function escapeHtml(value: unknown) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

export default function Reports() {
  const { toast } = useToast();
  const [report, setReport] = useState<ReportId>("daily");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Row>({});
  const [sales, setSales] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const request = useCallback(async (path: string) => {
    const token = localStorage.getItem("jwt");
    const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    const responseData = await response.json() as Row;
    if (!response.ok) throw new Error(text(responseData.error) || "Unable to load report");
    return responseData;
  }, []);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const suffix = report === "monthly" || report === "expenses" ? `?month=${month}` : "";
      setData(await request(`/reports/${report}${suffix}`));
    } catch (error) { toast(error instanceof Error ? error.message : "Unable to load report", "error"); setData({}); }
    finally { setIsLoading(false); }
  }, [month, report, request, toast]);

  useEffect(() => { void loadReport(); }, [loadReport]);
  useEffect(() => { request("/sales").then((result) => setSales(Array.isArray(result) ? result as Row[] : [])).catch(() => setSales([])); }, [request]);

  const rows = useMemo<Row[]>(() => {
    if (Array.isArray(data.rows)) return data.rows as Row[];
    if (report === "daily") return Array.isArray(data.top_products) ? data.top_products as Row[] : [];
    if (report === "monthly") return Array.isArray(data.daily_breakdown) ? data.daily_breakdown as Row[] : [];
    return [];
  }, [data, report]);
  const columns = useMemo<DataTableColumn<Row>[]>(() => {
    const keys = rows[0] ? Object.keys(rows[0]) : report === "stock" ? ["name", "stock_qty", "low_stock_threshold", "qty_sold", "movement"] : report === "credit" ? ["name", "phone", "credit_balance"] : report === "expenses" ? ["label", "amount", "created_at"] : report === "monthly" ? ["day", "bills", "gross", "discounts", "net"] : ["name", "qty_sold", "revenue"];
    return keys.map((key) => ({ header: key.replace(/_/g, " "), cell: (row) => key.includes("amount") || key === "revenue" || key === "gross" || key === "net" || key === "credit_balance" ? money(row[key]) : text(row[key]) }));
  }, [report, rows]);
  const summary = (data.summary ?? data) as Row;

  const exportCsv = () => {
    if (!rows.length) { toast("There is no report data to export.", "error"); return; }
    const keys = Object.keys(rows[0]);
    const csv = `\uFEFF${keys.join(",")}\n${rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${report}-report-${month}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const printInvoice = async (saleId: string) => {
    try {
      const invoice = await request(`/sales/${saleId}/invoice`);
      const sale = invoice.sale as Row; const shop = (invoice.shop ?? {}) as Row; const items = (invoice.items ?? []) as Row[];
      const itemRows = items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${money(item.price_at_sale)}</td><td>${money(item.line_total)}</td></tr>`).join("");
      const html = `<!doctype html><html><head><title>Invoice ${escapeHtml(sale.invoice_number ?? sale.id)}</title><style>body{font-family:Inter,Arial,sans-serif;color:#172033;margin:42px}.header{display:flex;justify-content:space-between;border-bottom:2px solid #4f46e5;padding-bottom:18px}h1{margin:0;font-size:25px}.muted{color:#64748b;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:28px}th{text-align:left;background:#eef2ff;color:#3730a3}th,td{padding:11px;border-bottom:1px solid #e2e8f0}th:last-child,td:last-child{text-align:right}.total{margin-top:24px;text-align:right;font-size:20px;font-weight:700}@media print{body{margin:24px}}</style></head><body><div class="header"><div><h1>${escapeHtml(shop.name ?? "Billwise")}</h1><p class="muted">Invoice #${escapeHtml(sale.invoice_number ?? sale.id)}</p></div><div class="muted">${escapeHtml(sale.created_at)}<br>Payment: ${escapeHtml(sale.payment_mode)}</div></div><p class="muted">Customer: ${escapeHtml(sale.customer_name ?? "Walk-in customer")} ${sale.customer_phone ? `(${escapeHtml(sale.customer_phone)})` : ""}<br>Sold by: ${escapeHtml(sale.sold_by_name)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><p class="total">Total: ${money(sale.total_amount)}</p><p class="muted">Thank you for shopping with us.</p><script>window.onload=()=>window.print()</script></body></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { toast(error instanceof Error ? error.message : "Unable to create invoice", "error"); }
  };

  const salesColumns: DataTableColumn<Row>[] = [
    { header: "Invoice", cell: (sale) => `#${text(sale.invoice_number ?? sale.id)}` },
    { header: "Date", cell: (sale) => text(sale.created_at) },
    { header: "Total", cell: (sale) => money(sale.total_amount) },
    { header: "", cell: (sale) => <Button size="sm" variant="outline" onClick={() => void printInvoice(text(sale.id))}><FileText className="mr-2 h-4 w-4" />Invoice PDF</Button> },
  ];

  return <AppShell title="Reports" subtitle="Read-only business insights and exports"><div className="h-full overflow-auto p-4 sm:p-6"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{reportOptions.map((option) => <Button key={option.id} variant={report === option.id ? "default" : "outline"} size="sm" onClick={() => setReport(option.id)}>{option.label}</Button>)}</div><div className="flex gap-2"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-9 rounded-md border bg-card px-3 text-sm" /><Button variant="outline" size="icon" aria-label="Refresh report" onClick={() => void loadReport()}><RefreshCw className="h-4 w-4" /></Button><Button size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />CSV</Button></div></div><div className="mb-6 grid gap-4 md:grid-cols-3"><StatCard label="Revenue" value={money(summary.net_revenue ?? summary.gross_revenue ?? 0)} icon={<FileText className="h-4 w-4" />} /><StatCard label="Bills" value={text(summary.total_bills ?? rows.length)} icon={<FileText className="h-4 w-4" />} /><StatCard label={report === "credit" ? "Outstanding credit" : report === "expenses" ? "Expenses" : "Discounts"} value={money(summary.total_outstanding ?? summary.total ?? summary.total_discounts ?? 0)} icon={<FileText className="h-4 w-4" />} /></div><Card><CardHeader><CardTitle>{reportOptions.find((option) => option.id === report)?.label}</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={columns} rows={rows} getRowKey={(row) => text(row.id ?? row.name ?? row.day ?? row.label)} emptyTitle="No report data yet" emptyDescription="Sales, stock, credit, and expenses appear here as records are synced." isLoading={isLoading} /></CardContent></Card><Card className="mt-6"><CardHeader><CardTitle>Recent sales - invoice export</CardTitle></CardHeader><CardContent className="p-0"><DataTable columns={salesColumns} rows={sales.slice(0, 10)} getRowKey={(sale) => text(sale.id)} emptyTitle="No sales available" emptyDescription="Create and sync a sale before exporting its invoice." /></CardContent></Card></div></AppShell>;
}
