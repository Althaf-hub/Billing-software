# Module 4 — Desktop UI (Billing Screen) Implementation Plan

This plan covers **Pass 1** of the Desktop UI, focusing on the Login and Billing screens. The goal is to create a highly professional, visually impressive Point of Sale (POS) interface with excellent UX.

## Proposed Changes

We will use React, Tailwind CSS, `react-router-dom`, `lucide-react` (icons), and `qrcode.react` (for the UPI QR code). 

### 1. Setup & Dependencies
- Install and configure **Tailwind CSS**.
- Install **shadcn/ui** core dependencies and configure the project to use a sleek, modern dark theme with an indigo/violet accent.
- Install routing and utility libraries.

### 2. Architecture & State Management
- **Routing**: `react-router-dom` to handle `/login` and `/` (Billing).
- **State**: React Context or simple Zustand store to hold the `jwt` token, `shop_id`, and `role` after login.
- **Tauri Bridge**: Create `src/lib/db.ts` containing strongly-typed wrappers around `invoke` to call our Rust database layer (`get_products`, `save_sale`, etc.).

### 3. Screen 1: Professional Login Screen
- A modern, glassmorphism-inspired or clean dark mode login card.
- Validates credentials by making a cloud API call to `/auth/login` (via `fetch` to the deployed worker).
- On success, saves the JWT to local storage and navigates to the Billing screen.

### 4. Screen 2: The Billing Point of Sale (POS)
The billing screen needs to be highly efficient for rapid offline use.

- **Layout**: Two-column layout. 
  - **Left (70%)**: Cart / Current Order. 
    - Auto-focused search/barcode input at the top.
    - Table/list of currently scanned items with quick + / - buttons and discount inputs.
  - **Right (30%)**: Order Summary & Checkout.
    - Subtotal, Total Discount, Grand Total.
    - Customer selection (with a toggle for adding a new customer).
    - Payment Mode selector (beautiful toggle buttons for Cash / UPI / Card / Credit).
    - Big, prominent "Complete Sale" button.
- **UPI QR Code**: If UPI is selected, a static QR code is rendered on screen for the customer to scan using `qrcode.react`.
- **WhatsApp Integration**: After sale completion, a button appears to share the receipt via WhatsApp (`wa.me` link).
- **Offline First**: All product fetching and sale saving will happen via Tauri `invoke` calls to the local SQLite DB we built in Module 3.

## User Review Required

> [!IMPORTANT]
> **Tailwind & shadcn/ui Setup**: I will run the automated setup commands for Tailwind and shadcn/ui. This will modify your `tailwind.config.js` and add a `components` folder.

## Open Questions

> [!WARNING]
> 1. **UPI Details**: I will use a placeholder UPI ID (`shop@upi`) for the QR code generation. You can change this later in the code. Is that okay?
> 2. **Cloud API URL**: I will use the live worker URL from Module 2 (`https://shop-billing-worker.althafrahmanmp.workers.dev`) for the login request. Let me know if you need to use a local development URL instead.

## Verification Plan

### Automated Tests
- Run `npm run build` to ensure the React + Tauri app compiles successfully with the new UI code.

### Manual Verification
- You will be asked to run `npm run tauri dev` (after installing Rust).
- Test logging in using the `admin` / `Test@1234` credentials.
- Test adding items to the cart and completing a sale to verify the Rust `save_sale` command works end-to-end.
