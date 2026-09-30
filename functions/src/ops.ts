import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  applyStockChange,
  assertCanManage,
  audit,
  businessDate,
  db,
  FieldValue,
  getLowStockDefault,
  parse,
  ProductDoc,
  requireAdmin,
  requireStaff,
  summaryRef,
  CALLABLE,
} from "./shared";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-30.");

async function staffName(uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  return (snap.get("name") as string | undefined) ?? "Staff";
}

// ---------------------------------------------------------------------------
// Daily close
// ---------------------------------------------------------------------------

const closeDaySchema = z.object({
  branchId: z.string().min(1),
  date: dateSchema,
  cashCounted: z.number().nonnegative().max(1_000_000_000).optional(),
  note: z.string().trim().max(500).optional().default(""),
});

/** Manager (or admin): closes a branch's business day with an optional cash count and note. */
export const closeDay = onCall({ ...CALLABLE }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(closeDaySchema, req.data);
  assertCanManage(caller, input.branchId);
  if (input.date > businessDate()) throw new HttpsError("invalid-argument", "You can't close a day that hasn't started yet.");

  const name = await staffName(caller.uid);
  const ref = summaryRef(input.branchId, input.date);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("closed") === true) throw new HttpsError("failed-precondition", "This day is already closed.");
    const salesTotal = (snap.get("salesTotal") as number | undefined) ?? 0;

    tx.set(
      ref,
      {
        branchId: input.branchId,
        date: input.date,
        closed: true,
        closedBy: caller.uid,
        closedByName: name,
        closedAt: FieldValue.serverTimestamp(),
        closingNote: input.note,
        cashCounted: input.cashCounted ?? null,
        salesAtClose: salesTotal,
      },
      { merge: true },
    );
    audit(tx, {
      actorUid: caller.uid,
      action: "day.close",
      target: ref.id,
      branchId: input.branchId,
      details: { date: input.date, total: salesTotal, cashCounted: input.cashCounted ?? null, note: input.note },
    });
    return { ok: true, salesTotal };
  });
});

const reopenDaySchema = z.object({ branchId: z.string().min(1), date: dateSchema });

/** Admin: reopens a closed day (e.g. to let a manager fix a mistake and close again). */
export const reopenDay = onCall({ ...CALLABLE }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(reopenDaySchema, req.data);
  const ref = summaryRef(input.branchId, input.date);
  await ref.set({ closed: false, reopenedBy: caller.uid, reopenedAt: FieldValue.serverTimestamp() }, { merge: true });
  audit(null, { actorUid: caller.uid, action: "day.reopen", target: ref.id, branchId: input.branchId, details: { date: input.date } });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Stock takes
// ---------------------------------------------------------------------------

const submitStockTakeSchema = z.object({
  branchId: z.string().min(1),
  scope: z.string().trim().max(80).optional().default("All products"),
  note: z.string().trim().max(500).optional().default(""),
  lines: z
    .array(z.object({ productId: z.string().min(1), countedPieces: z.number().int().min(0).max(100_000_000) }))
    .min(1, "Count at least one product.")
    .max(2000),
});

interface TakeLine {
  productId: string;
  code: string;
  name: string;
  qtyPerBox: number;
  unitLabel: string;
  expectedPieces: number;
  countedPieces: number;
  variance: number;
  unitCost: number;
}

/**
 * Manager: submits a count sheet. Expected stock is read on the server at
 * submission time; the Admin then approves (posts the differences) or rejects.
 */
export const submitStockTake = onCall({ ...CALLABLE }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(submitStockTakeSchema, req.data);
  assertCanManage(caller, input.branchId);

  const unique = new Map(input.lines.map((l) => [l.productId, l.countedPieces]));
  const refs = [...unique.keys()].map((id) => db.collection("products").doc(id));
  const snaps: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < refs.length; i += 300) snaps.push(...(await db.getAll(...refs.slice(i, i + 300))));

  const lines: TakeLine[] = [];
  for (const s of snaps) {
    if (!s.exists) continue;
    const p = s.data() as ProductDoc;
    if (p.branchId !== input.branchId) throw new HttpsError("failed-precondition", `${p.name} belongs to another branch.`);
    const counted = unique.get(s.id)!;
    lines.push({
      productId: s.id,
      code: p.code,
      name: p.name,
      qtyPerBox: p.qtyPerBox,
      unitLabel: p.unitLabel,
      expectedPieces: p.stockPieces,
      countedPieces: counted,
      variance: counted - p.stockPieces,
      unitCost: p.qtyPerBox > 0 ? p.boxPrice / p.qtyPerBox : 0,
    });
  }
  lines.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || a.name.localeCompare(b.name));

  const withVariance = lines.filter((l) => l.variance !== 0);
  const ref = db.collection("stockTakes").doc();
  const name = await staffName(caller.uid);
  await ref.create({
    branchId: input.branchId,
    status: "submitted",
    scope: input.scope,
    note: input.note,
    lines,
    productsCounted: lines.length,
    varianceLines: withVariance.length,
    variancePieces: withVariance.reduce((s, l) => s + l.variance, 0),
    varianceValue: Math.round(withVariance.reduce((s, l) => s + l.variance * l.unitCost, 0) * 100) / 100,
    submittedBy: caller.uid,
    submittedByName: name,
    createdAt: FieldValue.serverTimestamp(),
    appliedCount: 0,
  });
  audit(null, {
    actorUid: caller.uid,
    action: "stocktake.submit",
    target: ref.id,
    branchId: input.branchId,
    details: { scope: input.scope, products: lines.length, varianceLines: withVariance.length },
  });
  return { id: ref.id, varianceLines: withVariance.length };
});

const reviewStockTakeSchema = z.object({
  id: z.string().min(1),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().default(""),
});

/**
 * Admin: approves or rejects a submitted stock take. On approval each
 * difference (counted − expected) is added to the CURRENT stock, so sales
 * made between counting and approval are not lost. Applied in chunks so
 * large counts stay within transaction limits; a retry resumes where it stopped.
 */
export const reviewStockTake = onCall({ ...CALLABLE, timeoutSeconds: 300 }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(reviewStockTakeSchema, req.data);
  const ref = db.collection("stockTakes").doc(input.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Stock take not found.");
  const status = snap.get("status") as string;
  if (status !== "submitted" && status !== "applying") throw new HttpsError("failed-precondition", "This stock take has already been reviewed.");
  const branchId = snap.get("branchId") as string;

  if (!input.approve) {
    await ref.update({ status: "rejected", reviewedBy: caller.uid, reviewNote: input.note, reviewedAt: FieldValue.serverTimestamp() });
    audit(null, { actorUid: caller.uid, action: "stocktake.reject", target: ref.id, branchId, details: { reason: input.note } });
    return { ok: true, applied: 0 };
  }

  const pending = (snap.get("lines") as TakeLine[]).filter((l) => l.variance !== 0);
  let applied = (snap.get("appliedCount") as number | undefined) ?? 0;
  await ref.update({ status: "applying" });

  const CHUNK = 100; // ≤ 3 writes per line + 1 → well under the 500-write limit
  while (applied < pending.length) {
    const chunk = pending.slice(applied, applied + CHUNK);
    await db.runTransaction(async (tx) => {
      const productSnaps = await tx.getAll(...chunk.map((l) => db.collection("products").doc(l.productId)));
      const lowStockDefault = await getLowStockDefault(tx);
      chunk.forEach((line, i) => {
        const ps = productSnaps[i];
        if (!ps.exists) return;
        const p = ps.data() as ProductDoc;
        const newStock = Math.max(0, p.stockPieces + line.variance);
        if (newStock === p.stockPieces) return;
        applyStockChange(tx, {
          productId: ps.id,
          product: p,
          newStock,
          delta: newStock - p.stockPieces,
          type: "count",
          reason: `Stock take (approved)`,
          refId: ref.id,
          byUid: caller.uid,
          lowStockDefault,
        });
      });
      tx.update(ref, { appliedCount: applied + chunk.length });
    });
    applied += chunk.length;
  }

  await ref.update({ status: "approved", reviewedBy: caller.uid, reviewNote: input.note, reviewedAt: FieldValue.serverTimestamp() });
  audit(null, {
    actorUid: caller.uid,
    action: "stocktake.approve",
    target: ref.id,
    branchId,
    details: { varianceLines: pending.length, note: input.note },
  });
  return { ok: true, applied };
});

// ---------------------------------------------------------------------------
// Bulk product import (Excel / CSV)
// ---------------------------------------------------------------------------

const money = z.number().nonnegative().max(10_000_000);
const count = z.number().int().min(0).max(100_000_000);

const importRowSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(1000).optional(),
  qtyPerBox: z.number().int().min(1).max(100_000).optional(),
  unitLabel: z.string().trim().min(1).max(12).optional(),
  boxPrice: money.optional(),
  piecePrice: money.optional(),
  minBoxes: z.number().int().min(1).max(100_000).optional(),
  minPieces: z.number().int().min(1).max(100_000).optional(),
  lowStockPieces: count.optional(),
  visible: z.boolean().optional(),
  hot: z.boolean().optional(),
  isNew: z.boolean().optional(),
  stockBoxes: count.optional(),
  stockPieces: count.optional(),
  giftName: z.string().trim().min(1).max(80).optional(),
  giftStartsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  giftEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const importSchema = z.object({
  branchId: z.string().min(1),
  rows: z.array(importRowSchema).min(1).max(2000),
});

type ImportRow = z.infer<typeof importRowSchema>;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

/**
 * Staff: creates or updates a branch's products from a spreadsheet, matched
 * on product code. Stock columns, when filled in, set stock through the
 * ledger like a stock count.
 */
export const importProducts = onCall({ ...CALLABLE, timeoutSeconds: 300 }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(importSchema, req.data);
  assertCanManage(caller, input.branchId);

  const branch = await db.collection("branches").doc(input.branchId).get();
  if (!branch.exists) throw new HttpsError("not-found", "Branch not found.");

  const existing = await db.collection("products").where("branchId", "==", input.branchId).get();
  const idByCode = new Map(existing.docs.map((d) => [String(d.get("code")).toUpperCase(), d.id]));
  const errors: { code: string; message: string }[] = [];

  // Last row wins when a code appears twice. New products need the basics.
  const rows = [...new Map(input.rows.map((r) => [r.code, r])).values()].filter((r) => {
    if (idByCode.has(r.code) || (r.qtyPerBox != null && r.boxPrice != null)) return true;
    errors.push({ code: r.code, message: "New products need pieces per box and a box price." });
    return false;
  });

  // Categories by name (created when missing).
  const catSnap = await db.collection("categories").get();
  const catByName = new Map(catSnap.docs.map((d) => [String(d.get("name")).toLowerCase(), d.id]));
  let sortOrder = catSnap.size;
  for (const name of new Set(rows.map((r) => r.category).filter((c): c is string => !!c))) {
    if (catByName.has(name.toLowerCase())) continue;
    const id = slug(name);
    await db.collection("categories").doc(id).set({ name, sortOrder: ++sortOrder }, { merge: true });
    catByName.set(name.toLowerCase(), id);
  }

  let created = 0;
  let updated = 0;
  let stockChanged = 0;

  const CHUNK = 80;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.runTransaction(async (tx) => {
      const refs = chunk.map((r) => (idByCode.has(r.code) ? db.collection("products").doc(idByCode.get(r.code)!) : null));
      const snaps = await Promise.all(refs.map((r) => (r ? tx.get(r) : Promise.resolve(null))));
      const lowStockDefault = await getLowStockDefault(tx);
      let c = 0;
      let u = 0;
      let s = 0;

      chunk.forEach((row, idx) => {
        const snap = snaps[idx];
        const isNew = !snap?.exists;
        const fields = productFields(row, isNew, catByName);

        if (isNew) {
          fields.freeGift = giftFields(row, null) ?? null;
          const ref = db.collection("products").doc();
          const product = { ...fields, branchId: input.branchId, stockPieces: 0 } as unknown as ProductDoc;
          tx.create(ref, { ...product, createdBy: caller.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
          c++;
          const target = targetStock(row, product.qtyPerBox);
          if (target != null && target > 0) {
            applyStockChange(tx, {
              productId: ref.id,
              product,
              newStock: target,
              delta: target,
              type: "receive",
              reason: "Opening stock (import)",
              refId: null,
              byUid: caller.uid,
              lowStockDefault,
            });
            s++;
          }
          return;
        }

        const current = snap!.data() as ProductDoc;
        const gift = giftFields(row, current.freeGift);
        if (gift !== undefined) fields.freeGift = gift;
        const merged = { ...current, ...fields } as ProductDoc;
        tx.update(snap!.ref, { ...fields, updatedAt: FieldValue.serverTimestamp() });
        u++;
        const target = targetStock(row, merged.qtyPerBox);
        if (target != null && target !== current.stockPieces) {
          applyStockChange(tx, {
            productId: snap!.id,
            product: merged,
            newStock: target,
            delta: target - current.stockPieces,
            type: "count",
            reason: "Stock set by import",
            refId: null,
            byUid: caller.uid,
            lowStockDefault,
          });
          s++;
        }
      });

      created += c;
      updated += u;
      stockChanged += s;
    });
  }

  audit(null, {
    actorUid: caller.uid,
    action: "product.import",
    target: input.branchId,
    branchId: input.branchId,
    details: { created, updated, stockChanged, skipped: errors.length },
  });
  return { created, updated, stockChanged, errors };
});

/** undefined = leave as is; null = remove; otherwise the new gift (keeping its photo). */
function giftFields(row: ImportRow, current: ProductDoc["freeGift"]): ProductDoc["freeGift"] | undefined {
  if (row.giftName === undefined) {
    if (!current || (row.giftStartsAt === undefined && row.giftEndsAt === undefined)) return undefined;
    return { ...current, startsAt: row.giftStartsAt ?? current.startsAt ?? null, endsAt: row.giftEndsAt ?? current.endsAt ?? null };
  }
  if (["none", "no", "-", "remove"].includes(row.giftName.toLowerCase())) return null;
  return {
    name: row.giftName,
    imageUrl: current?.imageUrl ?? null,
    startsAt: row.giftStartsAt ?? null,
    endsAt: row.giftEndsAt ?? null,
  };
}

function targetStock(row: ImportRow, qtyPerBox: number): number | null {
  if (row.stockBoxes == null && row.stockPieces == null) return null;
  return (row.stockBoxes ?? 0) * qtyPerBox + (row.stockPieces ?? 0);
}

/** Only the columns that were filled in are changed on existing products; new ones get defaults. */
function productFields(row: ImportRow, isNew: boolean, catByName: Map<string, string>): Record<string, unknown> {
  const f: Record<string, unknown> = { code: row.code, name: row.name, searchText: `${row.name} ${row.code}`.toLowerCase() };
  const put = (k: string, v: unknown, dflt?: unknown) => {
    if (v !== undefined) f[k] = v;
    else if (isNew && dflt !== undefined) f[k] = dflt;
  };
  put("categoryId", row.category ? (catByName.get(row.category.toLowerCase()) ?? null) : undefined, null);
  put("description", row.description, "");
  put("qtyPerBox", row.qtyPerBox);
  put("unitLabel", row.unitLabel, "pc");
  put("boxPrice", row.boxPrice);
  if (row.piecePrice !== undefined) {
    f.piecePrice = row.piecePrice;
    f.sellByPiece = true;
  } else if (isNew) {
    f.piecePrice = null;
    f.sellByPiece = false;
  }
  put("minBoxes", row.minBoxes, 1);
  put("minPieces", row.minPieces, 1);
  put("lowStockPieces", row.lowStockPieces, null);
  put("visible", row.visible, true);
  if (row.hot !== undefined || row.isNew !== undefined || isNew) {
    f.tags = [row.hot && "hot", row.isNew && "new"].filter(Boolean);
  }
  if (isNew) {
    f.imageUrl = null;
    f.thumbUrl = null;
  }
  return f;
}
