/**
 * Loads the 6 flyer promo products (fridges & freezers with free gifts) into
 * ONE branch on PRODUCTION, creating an "Accra" branch first if it doesn't exist.
 * Safe to re-run: existing products (same branch + code) are left untouched.
 *
 *   npx tsx scripts/load-promos-live.ts            # Accra branch
 *   npx tsx scripts/load-promos-live.ts <branchId> # any existing branch
 *
 * Stock starts at 0 — managers enter the real counts (Products → Stock).
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "china-in-ghana";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;

const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }));

// Temporary branch details — the admin should correct address, GPS and WhatsApp in Admin → Branches.
const ACCRA = {
  name: "Accra",
  slug: "accra",
  code: "ACC",
  address: "Accra, Greater Accra",
  landmark: "",
  ghanaPostGps: "",
  lat: 5.5594,
  lng: -0.2086,
  whatsapp: "+233547738678",
  phone: "",
  hours: "Mon–Sat 8:00am – 6:00pm",
};

const CATEGORY = { id: "fridges-freezers", name: "Fridges & freezers", icon: "refrigerator", sortOrder: 4 };

const PROMO = { startsAt: "2026-10-26", endsAt: "2026-11-02" };
const features = (litres: number) => `${litres}L storage capacity · Energy efficient · Strong & durable · Keeps food fresh longer.`;
const promoImage = (code: string, kind: "" | "-flyer" | "-gift") => `/promos/${code.toLowerCase()}${kind}.webp`;

const PRODUCTS = [
  { code: "GME-400", name: "GME 400L Chest Freezer", litres: 400, price: 5500, gift: "Morgan 2-in-1 Blender" },
  { code: "SNW-500", name: "Snowsea 500L Chest Freezer", litres: 500, price: 6800, gift: "Morgan Microwave" },
  { code: "GME-300", name: "GME 300L Chest Freezer", litres: 300, price: 3200, gift: "Morgan Rice Cooker" },
  { code: "GME-200", name: "GME 200L Chest Freezer", litres: 200, price: 2400, gift: 'Morgan 18" Standing Fan' },
  { code: "BCD-139", name: "GME 139L Fridge (Bottom Freezer)", litres: 139, price: 2900, gift: "GME Double Hotplate" },
  { code: "BCD-138", name: "Bright Cool 138L Fridge", litres: 138, price: 1700, gift: "Morgan Iron" },
];

async function ensureAccraBranch(): Promise<string> {
  const existing = await db.collection("branches").where("slug", "==", ACCRA.slug).limit(1).get();
  if (!existing.empty) {
    console.log(`• Branch "${existing.docs[0].get("name")}" already exists (${existing.docs[0].id})`);
    return existing.docs[0].id;
  }

  const [license, all] = await Promise.all([db.doc("settings/license").get(), db.collection("branches").get()]);
  const limit = (license.get("branchLimit") as number | undefined) ?? 5;
  if (all.size >= limit) throw new Error(`Branch limit (${limit}) reached — can't create the Accra branch.`);

  const ref = db.collection("branches").doc();
  await db.runTransaction(async (tx) => {
    tx.create(ref, {
      ...ACCRA,
      active: true,
      sortOrder: all.size,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("counters").doc(ref.id), { lastOrderNo: 0, lastReceiptNo: 0 });
    tx.create(db.collection("auditLog").doc(), {
      actorUid: "script:load-promos-live",
      action: "branch.create",
      target: ref.id,
      branchId: ref.id,
      details: { name: ACCRA.name },
      at: FieldValue.serverTimestamp(),
    });
  });
  console.log(`✔ Created branch "${ACCRA.name}" (${ref.id})`);
  return ref.id;
}

async function main() {
  const branchId = process.argv[2] ?? (await ensureAccraBranch());
  const branch = await db.doc(`branches/${branchId}`).get();
  if (!branch.exists) throw new Error(`Branch ${branchId} not found.`);

  const { id: categoryId, ...category } = CATEGORY;
  await db.doc(`categories/${categoryId}`).set(category, { merge: true });

  let created = 0;
  for (const p of PRODUCTS) {
    const dup = await db.collection("products").where("branchId", "==", branchId).where("code", "==", p.code).limit(1).get();
    if (!dup.empty) {
      console.log(`• ${p.code} already in ${branch.get("name")} — skipped`);
      continue;
    }
    await db.collection("products").add({
      branchId,
      code: p.code,
      name: p.name,
      description: features(p.litres),
      categoryId,
      qtyPerBox: 1,
      unitLabel: "unit",
      boxPrice: p.price,
      piecePrice: null,
      sellByPiece: false,
      minBoxes: 1,
      minPieces: 1,
      stockPieces: 0,
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
    created++;
    console.log(`✔ ${p.code} ${p.name} — GH₵${p.price.toLocaleString()} + free ${p.gift}`);
  }
  console.log(`\nDone: ${created} product(s) added to ${branch.get("name")}. Stock is 0 — enter real counts in Products → Stock.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
