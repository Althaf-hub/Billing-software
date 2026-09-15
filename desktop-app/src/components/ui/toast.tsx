import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { Button } from "./button";

type ToastType = "success" | "error";
type ToastMessage = { id: number; message: string; type: ToastType };
type ToastContextValue = { toast: (message: string, type?: ToastType) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now();
    setMessages((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setMessages((current) => current.filter((item) => item.id !== id)), 4500);
  }, []);
  return <ToastContext.Provider value={{ toast }}>{children}<div className="pointer-events-none fixed right-5 bottom-5 z-50 flex w-80 flex-col gap-2">{messages.map((item) => <div key={item.id} className={`pointer-events-auto flex items-center gap-3 rounded-xl border bg-card p-3 shadow-lg ${item.type === "error" ? "border-destructive/30" : "border-primary/20"}`}><span className={item.type === "error" ? "text-destructive" : "text-emerald-600"}>{item.type === "error" ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}</span><p className="flex-1 text-sm font-medium">{item.message}</p><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMessages((current) => current.filter((message) => message.id !== item.id))}><X className="h-4 w-4" /></Button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
