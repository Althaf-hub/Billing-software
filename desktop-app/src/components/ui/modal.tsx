import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, description, children, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" role="presentation" onMouseDown={onClose}>
      <section className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><h2 id="modal-title" className="text-lg font-semibold">{title}</h2>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div><Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button></div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}
