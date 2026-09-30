import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { audit, db, FieldValue, parse, phoneSchema, REGION, requireAdmin } from "./shared";

// Ghana bounding box (with a small margin).
const GH_BOUNDS = { minLat: 4.5, maxLat: 11.3, minLng: -3.4, maxLng: 1.3 };

const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(120).optional().default(""),
  ghanaPostGps: z.string().trim().max(20).optional().default(""),
  lat: z.number().min(GH_BOUNDS.minLat).max(GH_BOUNDS.maxLat),
  lng: z.number().min(GH_BOUNDS.minLng).max(GH_BOUNDS.maxLng),
  whatsapp: phoneSchema,
  phone: z.string().trim().max(30).optional().default(""),
  hours: z.string().trim().max(120).optional().default(""),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function baseCode(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters.slice(0, 3) || "BRN").padEnd(3, "X");
}

/**
 * Creates a branch. Counts ALL branches (active + deactivated) against the
 * licence limit. When the limit is reached it fails with details the UI uses
 * to show the one-time unlock message.
 */
export const createBranch = onCall({ region: REGION }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(createBranchSchema, req.data);

  return db.runTransaction(async (tx) => {
    const licenseSnap = await tx.get(db.collection("settings").doc("license"));
    const branchLimit = (licenseSnap.get("branchLimit") as number | undefined) ?? 5;
    const branches = await tx.get(db.collection("branches"));

    if (branches.size >= branchLimit) {
      throw new HttpsError("failed-precondition", "LIMIT_REACHED", {
        reason: "LIMIT_REACHED",
        limit: branchLimit,
        unlockPriceGHS: (licenseSnap.get("unlockPriceGHS") as number | undefined) ?? 1700,
        supportWhatsApp: (licenseSnap.get("supportWhatsApp") as string | undefined) ?? null,
      });
    }

    const existingSlugs = new Set(branches.docs.map((d) => d.get("slug") as string));
    const existingCodes = new Set(branches.docs.map((d) => d.get("code") as string));

    let slug = slugify(input.name) || "branch";
    for (let i = 2; existingSlugs.has(slug); i++) slug = `${slugify(input.name)}-${i}`;

    let code = baseCode(input.name);
    for (let i = 2; existingCodes.has(code); i++) code = `${baseCode(input.name).slice(0, 2)}${i}`;

    const ref = db.collection("branches").doc();
    tx.create(ref, {
      ...input,
      slug,
      code,
      active: true,
      sortOrder: branches.size,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection("counters").doc(ref.id), { lastOrderNo: 0, lastReceiptNo: 0 });
    audit(tx, { actorUid: caller.uid, action: "branch.create", target: ref.id, branchId: ref.id, details: { name: input.name } });

    return { branchId: ref.id, slug, code };
  });
});
