/**
 * Creates the PRODUCTION settings documents if they don't exist yet.
 * Safe to re-run: existing documents are left untouched.
 *
 *   npx tsx scripts/init-settings.ts
 *
 * Uses your Google Application Default Credentials (gcloud auth application-default login).
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "china-in-ghana";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;

const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }));

const DEFAULTS: Record<string, Record<string, unknown>> = {
  "settings/app": {
    businessName: "China-in-Ghana",
    tagline: "Quality home appliances at wholesale prices",
    noticeText: "Wholesale prices. Stock and prices may change — confirm with the branch on WhatsApp.",
    defaultLowStockPieces: 12,
  },
  "settings/license": {
    branchLimit: 5,
    unlockPriceGHS: 1700,
    supportWhatsApp: "+233547738678",
  },
};

async function main() {
  for (const [path, data] of Object.entries(DEFAULTS)) {
    const ref = db.doc(path);
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return false;
      tx.create(ref, data);
      return true;
    });
    console.log(created ? `✔ Created ${path}` : `• ${path} already exists — left unchanged`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
