# Module 5 — Mobile App (React Native)

> Read `00-shared-context.md` first. Build last — reuse UI/logic patterns already proven in
> `04-desktop-ui.md` rather than redesigning from scratch.

## Task
A simplified, salesman-focused version of the desktop billing screen, installable as an APK
(no Play Store required — side-loadable, common practice for shop-billing apps in India).

## Screens
- Login
- Billing screen (product picker, phone-camera barcode scan, quantity, discount, payment mode
  incl. credit, UPI QR display, WhatsApp share button — same `wa.me` approach as desktop)
- Customer list + credit balance (same as desktop's customer feature from `09-customer-credit.md`)
- Own sales history (today / this week)
- Sync status indicator

## What NOT to include on mobile
- Admin screens (products, staff, reports, procurement) — mobile is salesman-focused; an admin
  who needs those screens uses the desktop app

## Local Storage
- Same local SQLite approach as `03-local-db-rust.md`, but via a React Native SQLite library
  (not Tauri/Rust — mobile doesn't use Tauri) — the schema and sync behavior are identical,
  only the storage binding differs

## Acceptance Criteria
- Installable APK, works fully offline
- Syncs against the same Cloudflare Workers API from `02-cloud-api.md`
- A sale made offline on mobile appears on the desktop app once both are back online
