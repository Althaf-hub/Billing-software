import { BarChart3, Boxes, CircleDollarSign, LayoutDashboard, PackagePlus, ReceiptText, Settings, ShoppingCart, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

export type UserRole = "admin" | "salesman";

const items = [
  { label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { label: "Billing", icon: ShoppingCart, to: "/" },
  { label: "Products", icon: Boxes, adminOnly: true },
  { label: "Customers", icon: Users, to: "/customers" },
  { label: "Reports", icon: BarChart3, to: "/reports", adminOnly: true },
  { label: "Procurement", icon: PackagePlus, to: "/procurement", adminOnly: true },
  { label: "Staff", icon: ReceiptText, adminOnly: true },
  { label: "Settings", icon: Settings, adminOnly: true },
];

export function Sidebar({ role }: { role: UserRole }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">B</span>
        <div><p className="text-sm font-semibold">Billwise</p><p className="text-xs text-muted-foreground">Retail POS</p></div>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
        {items.filter((item) => role === "admin" || !item.adminOnly).map((item) => {
          const Icon = item.icon;
          if (!item.to) return <div key={item.label} className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground" title={`${item.label} screen is being added in its feature module`}><Icon className="h-4 w-4" />{item.label}</div>;
          return <NavLink key={item.label} to={item.to} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}><Icon className="h-4 w-4" />{item.label}</NavLink>;
        })}
      </nav>
      <p className="border-t px-5 py-4 text-xs text-muted-foreground">Offline-first billing</p>
    </aside>
  );
}
