import type { ReactNode } from "react";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { Sidebar, type UserRole } from "./Sidebar";

function currentRole(): UserRole {
  const token = localStorage.getItem("jwt");
  if (!token) return "salesman";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: UserRole };
    return payload.role === "salesman" ? "salesman" : "admin";
  } catch { return "admin"; }
}

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const role = currentRole();
  const signOut = () => { localStorage.removeItem("jwt"); localStorage.removeItem("user_id"); navigate("/login"); };
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6">
          <div className="flex items-center gap-3"><Button size="icon" variant="ghost" className="lg:hidden" aria-label="Navigation"><Menu className="h-5 w-5" /></Button><div><h1 className="text-base font-semibold">{title}</h1>{subtitle && <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>}</div></div>
          <div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label="Notifications"><Bell className="h-4 w-4" /></Button><div className="mx-2 h-7 border-l" /><div className="hidden text-right sm:block"><p className="text-sm font-medium">{role === "admin" ? "Admin" : "Salesman"}</p><p className="text-xs capitalize text-muted-foreground">{role}</p></div><Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="h-4 w-4" /></Button><ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" /></div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
