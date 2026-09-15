# Module 6 — Sync Service

> Read `00-shared-context.md` first. Connects `03-local-db-rust.md` (or its React Native
> equivalent in `05-mobile-app.md`) to `02-cloud-api.md`.

## Task
Build the background sync logic, ideally as one shared JS/TS module usable by both the desktop
(via Tauri) and mobile app, so the logic isn't duplicated.

## Logic
1. Every local write (new sale, stock update, customer/credit change, purchase, expense) saves
   to local SQLite **first**, immediately, with `synced = 0`.
2. A background task runs every N seconds, and also on network-reconnect:
   - `POST /sync/push` — sends all locally unsynced records
   - `GET /sync/pull?since=<last_sync_time>` — fetches anything new from other devices for this
     `shop_id`
3. **Conflict rule**: stock quantity conflicts (two devices selling the last unit while both
   offline) are resolved by the server recalculating stock from the full sale history on push,
   and rejecting a sale only if it would take stock negative — flagged to the admin for manual
   review rather than silently failing.
4. **Invoice numbering**: assigned by the server on `/sync/push`, never by the client — this
   keeps numbers unique even when two devices create sales offline at the same time.
5. UI-facing sync status: expose a simple "synced" / "pending (n)" state that `04-desktop-ui.md`
   and `05-mobile-app.md` both display.

## Acceptance Criteria
- Two devices, both offline, each sell the last unit of the same product → on sync, one sale
  succeeds, the other is flagged for admin review (not silently dropped, not double-sold)
- No duplicate `invoice_number` values ever appear across devices
- Sync resumes correctly after being offline for an extended period (test: disconnect for 10+
  minutes, create several sales, reconnect)
