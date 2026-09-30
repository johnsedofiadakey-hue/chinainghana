# China-in-Ghana — Multi-Branch Ordering Platform

> Reference studied: `morgan.dzncm.com/price8146988` (single-page PHP price list, WhatsApp ordering)
> Stack: **Firebase** (Auth, Firestore, Cloud Functions, Storage, App Hosting, FCM, App Check) + **Next.js**
> Firebase project & billing: **owned by the developer (Super Admin)**

---

## 1. Goals

1. Customers open one link, the site finds their **nearest branch** via GPS, and shows **that branch's products, prices and stock**. They order through **WhatsApp**.
2. Each of the **5 branches is fully independent**: its own products, prices and stock.
3. The **Admin** (client) sees and manages everything across all branches, including daily sales.
4. **Branch Managers** fully run their own branch: products, prices, images, stock, stock taking, sales records and orders.
5. **Branch cap of 5.** A 6th branch triggers a one-time **GH₵1,700** unlock message, shown only when she tries to add it.
6. **No payment integration.** Orders, delivery vs pickup, and payment are all arranged on WhatsApp.
7. Prices are **public**. Anyone can browse.
8. English only.

---

## 2. Roles & Permissions

| Capability | Super Admin (developer) | Admin (client) | Branch Manager |
|---|---|---|---|
| Set branch limit / unlock 6th branch, support contact | ✅ | ❌ | ❌ |
| Business settings (name, notice text, default low-stock level) | ✅ | ✅ | ❌ |
| Create / edit / deactivate branches (≤ limit), set branch WhatsApp numbers | ✅ | ✅ | ❌ |
| Create / suspend managers, reset passwords | ✅ | ✅ | ❌ |
| Branch WhatsApp number & opening hours | ✅ | ✅ | ✅ own branch |
| Products: add / edit / images / hide | all | all branches | own branch |
| Prices (box & piece) | all | all branches | own branch |
| Stock: receive / adjust / stock take | all | all branches | own branch |
| Low-stock alert levels | all | all branches | own branch |
| Online orders (status workflow) | all | all branches | own branch |
| Sales records (walk-in + completed orders), WhatsApp receipts | all | all branches | own branch |
| Void a sale (reason required, Admin notified) | ✅ | ✅ | ✅ own branch |
| Daily close | — | view all | submit own |
| Dashboard & reports | all | all branches | own branch |
| Audit log | ✅ | ✅ | ❌ |

- There are no staff below managers. Each branch has one or more manager accounts.
- Enforcement uses **Firebase Auth custom claims** (`role`, `branchId`) in Security Rules and Cloud Functions. Nothing depends on hiding things in the UI alone.
- **Manager login:** the Admin creates a **username + temporary password**, stored internally as `username@cig.staff`. The manager must change the password on first login. Accounts are created by a Cloud Function, so the Admin is never signed out.

---

## 3. System Architecture

```
┌──────────────────────── Next.js (Firebase App Hosting) ────────────────────────┐
│  /                 Storefront (public, mobile-first, PWA)                       │
│  /b/[branchSlug]   Branch catalog (shareable link per branch)                   │
│  /p/[productId]    Product page (shareable, WhatsApp preview card)              │
│  /o/[orderNo]      Order confirmation + "Resend on WhatsApp"                    │
│  /admin/*          Admin portal                                                  │
│  /manager/*        Branch Manager portal                                         │
│  /super/*          Super Admin panel (developer only)                            │
└──────────────┬──────────────────────────────┬──────────────────────────────────┘
               │ Firestore SDK (realtime)     │ Callable Functions
┌──────────────▼──────────────┐   ┌───────────▼──────────────────────────────────┐
│ Firestore + Security Rules  │   │ Cloud Functions v2 (TypeScript)               │
│ Storage (product images)    │   │  placeOrder      validate, number, save order │
│ Auth (custom claims)        │   │  createBranch    enforces branch limit        │
│ FCM (push to staff)         │   │  createStaff / setStaffStatus / resetPassword │
│ App Check (anti-spam)       │   │  completeOrder / recordSale / voidSale        │
└─────────────────────────────┘   │  adjustStock / approveStockTake               │
                                  │  onOrderCreated  → push to manager + admin    │
                                  │  onStockChange   → low-stock alert            │
                                  │  onSaleWrite     → daily summary roll-up      │
                                  │  nightlyBackup   → scheduled Firestore export │
                                  │  Resize Images extension → WebP thumbnails    │
                                  └───────────────────────────────────────────────┘
```

**Blaze plan is required** for Functions and App Hosting. Expected cost at this scale is **about $0–10/month**. Set a budget alert.

---

## 4. Data Model (Firestore)

Products are **per branch**, because branches can carry different products at different prices. The same item at two branches is two product documents that share a `code`. The storefront uses that shared code to say "also available at X".

**Stock is stored in pieces** (one integer, no rounding errors). It's always displayed as boxes + pieces, e.g. `14 boxes + 5 pcs`, using `qtyPerBox`.

```
settings/app                          (public read subset; admin write)
  businessName: "China-in-Ghana", noticeText, defaultLowStockPieces,
  currency: "GHS", orderPrefix

settings/license                      (read: admin; write: SUPER ADMIN ONLY)
  branchLimit: 5, unlockPriceGHS: 1700, supportWhatsApp

users/{uid}
  name, username, phone, role: superadmin|admin|manager,
  branchId?, active, mustChangePassword, createdAt, lastLoginAt

branches/{branchId}
  name, slug, code ("ACC"), address, landmark, ghanaPostGps?,
  location: GeoPoint, geohash,
  whatsapp (E.164, e.g. +233241234567)   ← REQUIRED: orders go here
  phone?, openingHours{mon..sun}, active, sortOrder, createdAt

categories/{categoryId}               name, icon, sortOrder   (shared across branches)

products/{productId}                  ← belongs to ONE branch
  branchId, code, name, description?, categoryId,
  qtyPerBox, unitLabel ("pc","set","pair"),
  boxPrice, piecePrice?, sellByPiece: bool, minOrderPieces?,
  stockPieces, lowStockPieces (alert level; falls back to settings default),
  images[] {path, thumbPath}, tags["hot","new"], visible,
  searchKeywords[], createdBy, updatedAt

stockMovements/{id}                   ← append-only ledger
  branchId, productId, type: receive|sale|order|adjust|count|void,
  qtyPieces (+/-), balanceAfter, reason, refId, byUid, createdAt

orders/{orderId}                      ← online orders from customers
  orderNo ("ACC-000123"), branchId, customer{name, phone, businessName?},
  note?, items[]{productId, code, name, unit: box|piece, qty, unitPrice, lineTotal, thumb},
  total, status: new|confirmed|completed|cancelled,
  statusHistory[], handledBy, saleId?, createdAt

sales/{saleId}                        ← walk-in sales + completed online orders
  receiptNo ("ACC-R-000045"), branchId, source: walkin|order, orderId?,
  customer?{name, phone}, items[], total,
  voided, voidReason, voidedBy, byUid, createdAt

stockTakes/{id}
  branchId, status: draft|submitted|approved|rejected,
  lines[]{productId, expectedPieces, countedPieces, variance}, submittedBy, approvedBy

dailySummaries/{branchId_YYYY-MM-DD}  ← maintained by functions (cheap dashboard reads)
  salesTotal, salesCount, walkinTotal, orderTotal, ordersNew, ordersCompleted,
  piecesSold, voidCount, closed, closedBy, closingNote

alerts/{id}                           branchId, type: low_stock|out_of_stock, productId, resolved
customers/{phone}                     name, businessName, orderCount, lastOrderAt, branchesUsed[]
counters/{branchId}                   lastOrderNo, lastReceiptNo   (transactional)
auditLog/{id}                         actorUid, action, target, before, after, at
```

**Stock rules**
- A **walk-in sale** deducts stock immediately.
- An **online order** deducts stock when the manager marks it **Completed**, which also creates a sale record. There is no reservation while the customer is still chatting on WhatsApp.
- Every change writes a `stockMovements` row in the same transaction.
- Nothing is hard-deleted. Sales are voided (stock goes back, a reason is recorded, the Admin is notified). Products are hidden. Branches and staff are deactivated.
- **Low-stock trigger:** when `stockPieces` drops to or below `lowStockPieces`, an alert is created. The branch manager and Admin get a push notification and a dashboard badge. At 0 the product shows "Out of stock" on the storefront, and a manager can choose to hide it.

---

## 5. Features

### 5.1 Customer Storefront (public)

- **Nearest branch:** a friendly prompt → `navigator.geolocation` → distances computed **on the device** → nearest branch selected, other branches listed with km.
  - If permission is denied, a manual branch picker. The choice is remembered on the device. "Change branch" is always in the header.
  - "Get directions" (Google Maps deep link) and "Chat with branch" (WhatsApp).
  - **Customer location is never stored or sent to the server.**
- **Product cards** (not a wide table): photo, name, code, pack size, box price and piece price, stock badge (In stock / Low / Out). A list view toggle is available on desktop.
- **Box / piece toggle** on items sold both ways, with a quantity stepper. Minimum order is enforced.
- **Categories, instant search** (name/code) and filters (in stock, hot, new).
- **Out of stock here?** "Also at Kaneshie · 4.2 km" (matched on product code), with a one-tap switch.
- **Sticky cart bar** with count and total in GH₵. The cart is saved on the device, per branch.
- **Checkout sheet:** name, phone (Ghana format validated), business name (optional), note. Delivery, pickup and payment are discussed on WhatsApp.
- **Image tools for resellers:** full view, download, share to WhatsApp.
- Lazy WebP images, cached catalog for offline browsing, installable PWA, WhatsApp link-preview cards.
- Admin-editable notice banner (e.g. "Prices may change without notice").

### 5.2 Admin Portal

- **Dashboard (realtime, all branches):** today's sales per branch, orders waiting, low-stock alerts, pending stock takes, recent voids, and branches not yet closed for the day. Date range with 7- and 30-day trends.
- **Branches:** add, edit, deactivate.
  - **WhatsApp number field (required)**, validated Ghana number with a "Test" button that opens `wa.me`.
  - **GPS coordinates (required)** via a map pin (Leaflet + OpenStreetMap), "use my current location", or a pasted Google Maps link. Must fall inside Ghana.
  - Address, landmark, GhanaPost GPS, opening hours.
- **Managers:** create (name, phone, username, temp password, branch), suspend, reset password, reassign.
- **Products:** branch switcher, full editing on any branch, **copy product(s) to other branches**, and bulk **Excel/CSV import and export** per branch.
- **Stock:** per-branch view, low and out of stock filters, adjust with reason.
- **Orders & Sales:** all branches, filter by branch, status and date. Voids are listed with reasons.
- **Stock takes:** review variances → approve (posts adjustments) or reject.
- **Reports:** sales by branch, product and day; best sellers; slow movers; stock value. CSV and PDF export.
- **Settings:** business name, notice text, default low-stock level. Audit log.

### 5.3 Branch Manager Portal (mobile-first, works offline)

- **Today:** own branch sales, orders to handle, low-stock alerts.
- **Orders:** realtime. New → Confirmed → Completed (deducts stock, creates the sale) or Cancelled with a reason. A button opens the WhatsApp chat with the customer.
- **Record walk-in sale:** search products, box or piece quantities, optional customer, **WhatsApp receipt** (formatted text sent via `wa.me` to the customer's number, plus a receipt link `/r/[receiptNo]`).
- **Products & prices:** add or edit products and images for their own branch, set prices and low-stock levels, bulk import.
- **Receive stock:** add boxes and/or pieces with a supplier or reference note.
- **Stock take:** count sheet (all products or one category), works offline, submit → Admin approves.
- **Daily close:** summary of the day's sales, note, submit.
- Push notifications for new orders and low stock. Offline persistence for flaky networks.

### 5.4 Super Admin Panel (developer)

- Raise or lower `branchLimit`, set the support WhatsApp number shown in the unlock popup.
- View system health (function errors, order volume), and create or restore the Admin account.

---

## 6. WhatsApp Ordering Flow (free `wa.me` links, no paid API)

```
Customer taps "Send order on WhatsApp"
  1. Cloud Function placeOrder(branchId, cart, customer)
       • re-reads prices/stock server-side, enforces minimums, rejects hidden items
       • issues order number (transactional): ACC-000123
       • saves order (status: new) → push notification to branch manager + Admin
       • returns formatted message
  2. Browser opens https://wa.me/<branch whatsapp>?text=<message>
     (customer presses Send; the order is already saved even if they don't)
```

```
🧾 NEW ORDER #ACC-000123
Branch: Accra Central
Customer: Ama Mensah · 024 123 4567 · Ama's Enterprise
─────────────
BD-2901 2.5L 2-in-1 Blender     3 box × GH₵960  = GH₵2,880
FK-0302 1.8L SS Kettle          5 pc  × GH₵78   = GH₵390
─────────────
TOTAL: GH₵3,270
Note: Please deliver to Madina
View order: https://<domain>/o/ACC-000123
```

**WhatsApp receipt (walk-in or completed order)**

```
✅ RECEIPT #ACC-R-000045 · China-in-Ghana, Accra Central
30 Sep 2026, 14:32
BD-2901 Blender   3 box  GH₵2,880
TOTAL: GH₵2,880
Thank you for shopping with us!
https://<domain>/r/ACC-R-000045
```

---

## 7. Branch Limit & 6th-Branch Unlock

- `settings/license.branchLimit = 5` can be **written by the Super Admin only** (Security Rules).
- The UI shows **no counter, no plan badge and no pricing**. It's just a normal "Add Branch" button.
- The `createBranch` function counts all branches, **active and deactivated**, in a transaction. If `count >= branchLimit` it rejects with `LIMIT_REACHED`.
- **Only then** does a popup appear:
  > **Add more branches**
  > Your current setup supports 5 branches. Adding another branch is a one-time fee of **GH₵1,700**.
  > **[Contact us on WhatsApp to unlock]** → opens a chat with `supportWhatsApp`, with a prefilled message.
- After payment, the Super Admin raises the limit in `/super`, and she can add the branch right away.
- Branches can't be hard-deleted, so she can't delete and re-add to get around the limit.

---

## 8. Security, Privacy & Reliability

- Public users can read visible products, active branches and settings. Customers, sales, orders, staff and the audit log are not readable. Managers are scoped to their own `branchId`. All money and stock writes go through Cloud Functions.
- **App Check** + rate limiting on `placeOrder` (per phone number and device) to block spam orders.
- All rendered text is escaped. Uploads are image-only and size-limited.
- **Nightly Firestore backup** to Cloud Storage with 30-day retention.
- Privacy note: location is used only on the device; name and phone are used only to process orders.
- Tests: Emulator Suite (rules + functions), Vitest, Playwright end-to-end tests for the order flow.

---

## 9. Brand & Design

**Name:** China-in-Ghana · **no logo yet.** A clean wordmark with a simple icon will be designed as part of Phase 0.

**Palette:** navy as the trusted base, with bright retail accents that feel like a busy appliance shop.

| Token | Hex | Use |
|---|---|---|
| Navy 900 | `#0B1B3F` | Headers, primary text on light, brand base |
| Navy 700 | `#16306E` | Primary buttons, links, active states |
| Navy 50  | `#EEF2FB` | Tinted surfaces, table stripes |
| Sunset Orange | `#FF6B1A` | Main CTA ("Send order on WhatsApp", Add to cart), prices |
| Sunshine Yellow | `#FFC83D` | "Hot" / deal badges, highlights |
| Fresh Teal | `#10B5A5` | In-stock badges, success, category chips |
| Alert Red | `#E5484D` | Out of stock, errors, voids |
| WhatsApp Green | `#25D366` | WhatsApp buttons only |
| Surface | `#F7F8FB` / `#FFFFFF` | Page / cards |

- Fonts: **Satoshi** (headings, prices) + **Inter** (body, UI).
- Clean, minimal and lively. Large touch targets. Designed for 360px Android phones first. Light and dark mode.
- Currency always **GH₵** with thousands separators.

---

## 10. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| UI | Tailwind CSS + shadcn/ui (Radix) |
| Hosting | Firebase App Hosting |
| Auth | Firebase Auth + custom claims |
| Database | Cloud Firestore (offline persistence) |
| Server logic | Cloud Functions v2 (TypeScript) |
| Files | Cloud Storage + Resize Images extension |
| Push | Firebase Cloud Messaging |
| Abuse protection | App Check |
| Maps | Leaflet + OpenStreetMap (branch picker), Google Maps deep links (directions) |
| Spreadsheets | SheetJS |
| PDF reports | `@react-pdf/renderer` |
| State / forms | Zustand (cart), React Hook Form + Zod (validation shared with functions) |
| Testing | Vitest, Firebase Emulator Suite, Playwright |

---

## 11. Delivery Phases

| Phase | Scope | Outcome |
|---|---|---|
| **0. Foundation** | Firebase project, Next.js scaffold, brand/wordmark, design system, auth + roles, Security Rules skeleton, emulators, Super Admin bootstrap | Logged-in shells per role |
| **1. Branches & Products** | Branches (WhatsApp number, GPS picker, limit + unlock popup), managers, categories, per-branch products, images, import/export, copy-to-branch | Real data can be loaded |
| **2. Storefront & Ordering** | Nearest branch, product cards, box/piece cart, search/filters, cross-branch availability, `placeOrder`, WhatsApp hand-off, order page, link previews | Customers can order |
| **3. Manager Operations** | Order workflow, walk-in sales, WhatsApp receipts, receive stock, stock take, low-stock alerts, daily close, push notifications, offline | Branches run day-to-day |
| **4. Admin Oversight** | Realtime dashboard, daily summaries, reports & exports, stock-take approval, audit log | Admin manages all branches |
| **5. Hardening & Launch** | App Check, rate limits, backups, rules tests, end-to-end tests, performance, PWA, domain, staff guide | Production launch |

---

## 12. Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | Where orders go | Each branch's WhatsApp number (field on branch; Admin sets it) |
| 2 | Pricing/products | Per branch; products and prices can differ |
| 3 | Public prices | Yes |
| 4 | Delivery/pickup | Arranged on WhatsApp; not captured in the app |
| 5 | Payments | None in the app; WhatsApp only |
| 6 | Receipts | WhatsApp receipts |
| 7 | Manager powers | Full control of own branch (products, prices, stock, sales) |
| 8 | Staff below managers | Not needed |
| 9 | Inter-branch transfers | Not needed |
| 10 | Units | Boxes and pieces |
| 11 | Low-stock alerts | Yes, per product with a global default |
| 12 | Firebase ownership | Developer owns project & billing |
| 13 | Brand | China-in-Ghana, navy + bright accents, wordmark to be designed |
| 14 | Language | English only |
| 15 | Unlock contact | **Pending**: support WhatsApp number shown in the 6th-branch popup (editable in `/super`) |
