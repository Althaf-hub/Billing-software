# Module 4 — Desktop UI (React inside Tauri)

> Read `00-shared-context.md` first. Depends on `03-local-db-rust.md` for local data,
> calls into `02-cloud-api.md` routes for anything cloud-facing (via `06-sync-service.md`).
> Build in two passes — billing screen first, admin screens after `09` and `10` are done
> (see Build Order in `00-shared-context.md`).

## Pass 1 — Billing Screen (build first)
- Login screen (username/password → JWT stored locally)
- Billing screen:
  - Product picker (list or barcode scan-to-add — barcode input acts like a keyboard, just
    focus a text field and listen for scanner input followed by Enter)
  - Quantity per item, discount field
  - Customer field (optional — required only if payment mode is "credit")
  - Payment mode: cash / UPI / card / credit
  - UPI QR code shown on the bill (generate as a QR image from a formatted UPI string —
    no payment gateway needed, this is just a static QR, not a live payment integration)
  - "Share on WhatsApp" button — opens `wa.me/<phone>?text=<encoded bill summary>` (free,
    see `12-known-gotchas.md`, point 9 — do NOT integrate the paid WhatsApp Business API)
  - Auto-calculated total, "Complete Sale" → calls `save_sale` (Module 3)
  - Sync status indicator: "synced" / "pending (n)"

## Pass 2 — Admin Screens (build after Modules 9 and 10)
- Product management (add/edit/delete, barcode, low-stock threshold)
- Staff management (add/remove salesman logins)
- Dashboard: today's total sales, top product, payment-mode split, low-stock alerts
- Role-aware sidebar — salesman sees only Billing + Customers; admin sees everything

## Acceptance Criteria
- A salesman-role login never sees admin-only sidebar items or can reach admin routes directly
  by URL/navigation (client-side hiding is not sufficient — the API also rejects it per
  `02-cloud-api.md`)
- Billing screen fully usable with the app offline (airplane mode test)
