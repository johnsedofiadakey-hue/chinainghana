# China-in-Ghana

Multi-branch ordering and shop management for China-in-Ghana. Customers browse live prices and stock at their nearest branch and order on WhatsApp. Branch managers run orders, walk-in sales and stock; the admin oversees every branch.

Full product plan: [PLAN.md](PLAN.md).

## Stack

Next.js 16 (App Router) · Tailwind CSS 4 · Firebase (Auth, Firestore, Cloud Functions v2, Storage) · Leaflet/OpenStreetMap · Zustand.

## Run it locally

Needs Node 22, the Firebase CLI (`npm i -g firebase-tools`) and Java 21 (`brew install openjdk@21`).

```bash
npm install
npm run functions:install
cp .env.example .env.local   # already points at the emulators
```

Then, in three terminals:

```bash
npm run emulators   # Firebase emulators (UI at http://127.0.0.1:4000)
npm run seed        # demo branches, products and logins (once, or to reset)
npm run dev         # the app at http://localhost:3000
```

Demo logins are listed at the top of [scripts/seed.ts](scripts/seed.ts). They exist only in the local emulators.

## Where things are

| Path | What |
|---|---|
| `/`, `/b/[slug]` | Shop: nearest branch, products, cart, WhatsApp checkout |
| `/o/[id]`, `/r/[id]` | Order status and receipt pages (shareable links) |
| `/login`, `/account/password` | Staff sign-in and password change |
| `/admin/*` | Admin: dashboard, orders, sales, products (import/export), branches, reports, stock takes, daily close, managers, activity log, settings |
| `/manager/*` | Branch manager: today, orders, sales, products (import/export), my branch, stock take, daily close, reports |
| `/console/*` | Role-neutral links used by push notifications (redirects to `/admin` or `/manager`) |
| `/super` | Developer: branch licence, unlock contact, admin login |
| `functions/src` | Cloud Functions: orders, sales, stock, branches, staff |
| `firestore.rules`, `storage.rules` | Security rules (roles come from Auth custom claims) |

## Roles

- **Developer (superadmin)** – everything, plus the branch limit and the admin login.
- **Admin** – all branches.
- **Manager** – one branch only (enforced by rules and functions, not just the UI).

All stock and money changes go through Cloud Functions, which write a stock ledger and an activity log.

## Installable app, offline and alerts

- `public/sw.js` caches the shop pages, build files and product photos, so the shop opens on a bad connection and shows `offline.html` for pages never visited. Staff pages are never cached; Firestore keeps its own offline copy of the data. In development the worker only handles push (no caching).
- Staff turn on alerts from the dashboard card or the sidebar. New orders and low/out-of-stock products are pushed by the `onOrderCreated` and `onStockAlert` functions. Needs `NEXT_PUBLIC_FIREBASE_VAPID_KEY`; push doesn't work in the local emulators.
- Icons are generated from the logo with `node scripts/icons.mjs`.
- Promo images (full flyer, square card photo, gift cut-out) are cut from the client's flyers with `node scripts/promo-images.mjs <folder>` into `public/promos/`.

## Going live

Firebase project: **`china-in-ghana`** (already set in `.firebaserc`; the emulators still use `demo-cig`).

1. Upgrade the project to the Blaze plan and set a budget alert.
2. Create the Firestore database (Firebase console → Firestore → Create database, location `europe-west1` to match the functions) and enable Storage.
3. Production web config is in `apphosting.yaml` (App Hosting) and `.env.production` (local prod builds). Add the VAPID key and reCAPTCHA Enterprise key there when created.
4. Update `functions/.env.china-in-ghana` (`SITE_URL`, `BACKUP_BUCKET`, `ENFORCE_APP_CHECK`). Create the backup bucket with a 30-day delete rule.
5. `firebase deploy --only firestore,storage,functions`
6. Firebase console → App Hosting → create a backend from the GitHub repo (`main` branch, root directory `/`). Connect the domain and register it for App Check.
7. Grant roles to Auth users: `npx tsx scripts/grant-role.ts <uid> admin` (or `superadmin`, or `manager <branchId>`). Needs `gcloud auth application-default login`. The seed script is for the emulators only.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
