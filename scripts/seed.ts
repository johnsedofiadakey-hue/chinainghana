/**
 * Seeds the LOCAL EMULATORS with demo data.
 *
 *   npm run emulators      (terminal 1)
 *   npm run seed           (terminal 2)
 *
 * Demo logins (local emulators only — never use these in production):
 *   developer      / Cig-Dev-2026!      → Super Admin (/super)
 *   admin          / Cig-Admin-2026!    → Admin (/admin)
 *   accra.manager  / Cig-Accra-2026!    → Manager, Accra Central (/manager)
 *   kumasi.manager / Cig-Kumasi-2026!   → Manager, Kumasi Adum (/manager)
 */
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const app = initializeApp({ projectId: "demo-cig" });
const auth = getAuth(app);
const db = getFirestore(app);

const STAFF_DOMAIN = "cig.staff";
const SUPPORT_WHATSAPP = "+233547738678";

async function upsertUser(opts: {
  username: string;
  password: string;
  name: string;
  role: "superadmin" | "admin" | "manager";
  branchId?: string;
  branchName?: string;
}) {
  const email = `${opts.username}@${STAFF_DOMAIN}`;
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
    await auth.updateUser(uid, { password: opts.password, displayName: opts.name, disabled: false });
  } catch {
    uid = (await auth.createUser({ email, password: opts.password, displayName: opts.name })).uid;
  }
  const claims: Record<string, string> = { role: opts.role };
  if (opts.branchId) claims.branchId = opts.branchId;
  await auth.setCustomUserClaims(uid, claims);
  await db.collection("users").doc(uid).set({
    name: opts.name,
    username: opts.username,
    phone: "",
    role: opts.role,
    branchId: opts.branchId ?? null,
    branchName: opts.branchName ?? null,
    active: true,
    mustChangePassword: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return uid;
}

async function main() {
  // ---- Settings ----
  await db.doc("settings/app").set({
    businessName: "China-in-Ghana",
    tagline: "Quality home appliances at wholesale prices",
    noticeText: "Wholesale prices. Stock and prices may change — confirm with the branch on WhatsApp.",
    defaultLowStockPieces: 12,
  });
  await db.doc("settings/license").set({
    branchLimit: 5,
    unlockPriceGHS: 1700,
    supportWhatsApp: SUPPORT_WHATSAPP,
  });

  // ---- Categories ----
  const categories = [
    { id: "kitchen", name: "Kitchen appliances", icon: "chef-hat", sortOrder: 1 },
    { id: "home", name: "Home & living", icon: "sofa", sortOrder: 2 },
    { id: "electronics", name: "Electronics", icon: "plug", sortOrder: 3 },
    { id: "fridges-freezers", name: "Fridges & freezers", icon: "refrigerator", sortOrder: 4 },
  ];
  for (const c of categories) {
    const { id, ...data } = c;
    await db.doc(`categories/${id}`).set(data);
  }

  // ---- Branches ----
  const branches = [
    {
      id: "accra-central",
      name: "Accra Central",
      slug: "accra-central",
      code: "ACC",
      address: "Kojo Thompson Road, Adabraka, Accra",
      landmark: "Near Kwame Nkrumah Circle",
      ghanaPostGps: "GA-051-2345",
      lat: 5.5594,
      lng: -0.2086,
      hours: "Mon–Sat 8:00am – 6:00pm",
    },
    {
      id: "kumasi-adum",
      name: "Kumasi Adum",
      slug: "kumasi-adum",
      code: "KUM",
      address: "Prempeh II Street, Adum, Kumasi",
      landmark: "Opposite Kejetia Market",
      ghanaPostGps: "AK-039-5678",
      lat: 6.6924,
      lng: -1.6244,
      hours: "Mon–Sat 8:00am – 6:00pm",
    },
  ];
  for (const [i, b] of branches.entries()) {
    const { id, ...data } = b;
    await db.doc(`branches/${id}`).set({
      ...data,
      whatsapp: SUPPORT_WHATSAPP, // demo: orders arrive on the developer's WhatsApp
      phone: "",
      active: true,
      sortOrder: i,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db.doc(`counters/${id}`).set({ lastOrderNo: 0, lastReceiptNo: 0 });
  }

  // ---- Products (2 placeholders, stocked independently per branch) ----
  const catalog = [
    {
      code: "BD-2901",
      name: "2.5L 2-in-1 Blender",
      description: "Glass jar blender with grinder attachment. 3 speeds + pulse, 600W.",
      categoryId: "kitchen",
      qtyPerBox: 6,
      unitLabel: "pc",
      sellByPiece: true,
      minBoxes: 1,
      minPieces: 2,
      imageUrl: "/placeholders/blender.svg",
      tags: ["hot"],
    },
    {
      code: "FK-0302",
      name: "1.8L Stainless Steel Kettle",
      description: "Cordless electric kettle, auto shut-off, boil-dry protection, 1500W.",
      categoryId: "kitchen",
      qtyPerBox: 12,
      unitLabel: "pc",
      sellByPiece: true,
      minBoxes: 1,
      minPieces: 3,
      imageUrl: "/placeholders/kettle.svg",
      tags: ["new"],
    },
  ];

  // Different prices & stock per branch to show they're independent.
  const perBranch: Record<string, Record<string, { boxPrice: number; piecePrice: number; stockPieces: number }>> = {
    "accra-central": {
      "BD-2901": { boxPrice: 960, piecePrice: 170, stockPieces: 6 * 25 + 3 },
      "FK-0302": { boxPrice: 936, piecePrice: 85, stockPieces: 12 * 8 },
    },
    "kumasi-adum": {
      "BD-2901": { boxPrice: 990, piecePrice: 175, stockPieces: 6 * 1 + 2 },
      "FK-0302": { boxPrice: 950, piecePrice: 86, stockPieces: 0 },
    },
  };

  for (const b of branches) {
    for (const p of catalog) {
      const id = `${b.id}_${p.code}`;
      const bp = perBranch[b.id][p.code];
      await db.doc(`products/${id}`).set({
        ...p,
        branchId: b.id,
        boxPrice: bp.boxPrice,
        piecePrice: bp.piecePrice,
        stockPieces: bp.stockPieces,
        lowStockPieces: null,
        thumbUrl: p.imageUrl,
        visible: true,
        searchText: `${p.name} ${p.code}`.toLowerCase(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // ---- Promo products from the client's flyers (26 Oct – 2 Nov): sold singly, each with a free gift ----
  const PROMO = { startsAt: "2026-10-26", endsAt: "2026-11-02" };
  const features = (litres: number) => `${litres}L storage capacity · Energy efficient · Strong & durable · Keeps food fresh longer.`;
  const promos = [
    { code: "GME-400", name: "GME 400L Chest Freezer", litres: 400, price: 5500, gift: "Morgan 2-in-1 Blender" },
    { code: "SNW-500", name: "Snowsea 500L Chest Freezer", litres: 500, price: 6800, gift: "Morgan Microwave" },
    { code: "GME-300", name: "GME 300L Chest Freezer", litres: 300, price: 3200, gift: "Morgan Rice Cooker" },
    { code: "GME-200", name: "GME 200L Chest Freezer", litres: 200, price: 2400, gift: 'Morgan 18" Standing Fan' },
    { code: "BCD-139", name: "GME 139L Fridge (Bottom Freezer)", litres: 139, price: 2900, gift: "GME Double Hotplate" },
    { code: "BCD-138", name: "Bright Cool 138L Fridge", litres: 138, price: 1700, gift: "Morgan Iron" },
  ];
  // Images come from the client's flyers: node scripts/promo-images.mjs <folder>
  const promoImage = (code: string, kind: "" | "-flyer" | "-gift") => `/promos/${code.toLowerCase()}${kind}.webp`;
  for (const b of branches) {
    for (const [i, p] of promos.entries()) {
      await db.doc(`products/${b.id}_${p.code}`).set({
        branchId: b.id,
        code: p.code,
        name: p.name,
        description: features(p.litres),
        categoryId: "fridges-freezers",
        qtyPerBox: 1,
        unitLabel: "unit",
        boxPrice: p.price,
        piecePrice: null,
        sellByPiece: false,
        minBoxes: 1,
        minPieces: 1,
        stockPieces: b.id === "accra-central" ? 6 - (i % 3) : 3, // demo stock: placeholder until the client gives real counts
        lowStockPieces: 2,
        imageUrl: promoImage(p.code, "-flyer"),
        thumbUrl: promoImage(p.code, ""),
        tags: ["hot"],
        freeGift: { name: p.gift, imageUrl: promoImage(p.code, "-gift"), ...PROMO },
        visible: true,
        searchText: `${p.name} ${p.code} ${p.gift}`.toLowerCase(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // ---- Staff ----
  await upsertUser({ username: "developer", password: "Cig-Dev-2026!", name: "Developer", role: "superadmin" });
  await upsertUser({ username: "admin", password: "Cig-Admin-2026!", name: "Owner (Admin)", role: "admin" });
  await upsertUser({
    username: "accra.manager",
    password: "Cig-Accra-2026!",
    name: "Accra Manager",
    role: "manager",
    branchId: "accra-central",
    branchName: "Accra Central",
  });
  await upsertUser({
    username: "kumasi.manager",
    password: "Cig-Kumasi-2026!",
    name: "Kumasi Manager",
    role: "manager",
    branchId: "kumasi-adum",
    branchName: "Kumasi Adum",
  });

  console.log("✔ Seeded settings, 4 categories, 2 branches, 8 products per branch (6 promo items with free gifts) and 4 staff accounts.");
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
