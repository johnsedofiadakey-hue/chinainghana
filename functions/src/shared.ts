import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, Transaction } from "firebase-admin/firestore";
import { CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

if (!getApps().length) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export { FieldValue, Timestamp };

export const REGION = "europe-west1";

/**
 * Options for every callable. `invoker: "public"` lets browsers reach the function at all
 * (Cloud Run IAM); each function still checks the caller's sign-in and role itself.
 * Declared explicitly so every deploy re-applies it, not just the first create.
 */
export const CALLABLE = { region: REGION, invoker: "public" } as const;
export const STAFF_EMAIL_DOMAIN = "cig.staff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role = "superadmin" | "admin" | "manager";
export type Unit = "box" | "piece";

export interface ProductDoc {
  branchId: string;
  code: string;
  name: string;
  qtyPerBox: number;
  unitLabel: string;
  boxPrice: number;
  piecePrice: number | null;
  sellByPiece: boolean;
  minBoxes: number;
  minPieces: number;
  stockPieces: number;
  lowStockPieces: number | null;
  imageUrl: string | null;
  thumbUrl: string | null;
  visible: boolean;
  freeGift?: { name: string; imageUrl?: string | null; startsAt?: string | null; endsAt?: string | null } | null;
}

export interface BranchDoc {
  name: string;
  slug: string;
  code: string;
  whatsapp: string;
  active: boolean;
}

export interface LineItem {
  productId: string;
  code: string;
  name: string;
  unit: Unit;
  unitLabel: string;
  qty: number;
  pieces: number;
  unitPrice: number;
  lineTotal: number;
  thumb: string | null;
  gift: string | null;
}

// ---------------------------------------------------------------------------
// Auth guards
// ---------------------------------------------------------------------------

export interface Caller {
  uid: string;
  role: Role;
  branchId: string | null;
}

export function requireStaff(req: CallableRequest): Caller {
  const token = req.auth?.token;
  const role = token?.role as Role | undefined;
  if (!req.auth || !role || !["superadmin", "admin", "manager"].includes(role)) {
    throw new HttpsError("permission-denied", "Staff sign-in required.");
  }
  return { uid: req.auth.uid, role, branchId: (token?.branchId as string | undefined) ?? null };
}

export function requireAdmin(req: CallableRequest): Caller {
  const caller = requireStaff(req);
  if (caller.role !== "admin" && caller.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
  return caller;
}

export function requireSuper(req: CallableRequest): Caller {
  const caller = requireStaff(req);
  if (caller.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
  return caller;
}

export function assertCanManage(caller: Caller, branchId: string): void {
  if (caller.role === "admin" || caller.role === "superadmin") return;
  if (caller.role === "manager" && caller.branchId === branchId) return;
  throw new HttpsError("permission-denied", "You can only manage your own branch.");
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The callable SDK sends `undefined` fields as `null`; treat them as missing. */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, dropNulls(v)]),
    );
  }
  return value;
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(dropNulls(data));
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    throw new HttpsError("invalid-argument", path ? `${path}: ${first.message}` : first?.message ?? "Invalid input.");
  }
  return result.data;
}

/** Normalises Ghana phone numbers to E.164 (+233XXXXXXXXX). Returns null if invalid. */
export function normalizeGhanaPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local: string | null = null;
  if (/^\+233\d{9}$/.test(digits)) local = digits.slice(4);
  else if (/^233\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^0\d{9}$/.test(digits)) local = digits.slice(1);
  else if (/^\d{9}$/.test(digits)) local = digits;
  if (!local || !/^[2-5]\d{8}$/.test(local)) return null;
  return `+233${local}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const p = normalizeGhanaPhone(v);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Ghana phone number." });
      return z.NEVER;
    }
    return p;
  });

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function ghs(amount: number): string {
  return `GH₵${amount.toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function waLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Ghana is UTC+0 year-round, so the UTC date is the local business date. */
export function businessDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function summaryRef(branchId: string, date = businessDate()) {
  return db.collection("dailySummaries").doc(`${branchId}_${date}`);
}

export function siteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Line items & stock
// ---------------------------------------------------------------------------

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  unit: z.enum(["box", "piece"]),
  qty: z.number().int().positive().max(100000),
});

/** Builds a priced line item from a product doc, enforcing unit rules & minimums. */
export function buildLine(
  productId: string,
  p: ProductDoc,
  unit: Unit,
  qty: number,
  opts: { enforceMinimum: boolean; priceOverride?: number | null },
): LineItem {
  if (unit === "piece" && (!p.sellByPiece || p.piecePrice == null)) {
    throw new HttpsError("failed-precondition", `${p.name} is sold by the box only.`);
  }
  if (opts.enforceMinimum) {
    if (unit === "box" && qty < (p.minBoxes || 1)) {
      throw new HttpsError("failed-precondition", `Minimum order for ${p.name} is ${p.minBoxes} box(es).`);
    }
    if (unit === "piece" && qty < (p.minPieces || 1)) {
      throw new HttpsError("failed-precondition", `Minimum order for ${p.name} is ${p.minPieces} ${p.unitLabel}(s).`);
    }
  }
  const basePrice = unit === "box" ? p.boxPrice : (p.piecePrice as number);
  // One free gift per box (per unit for single items) while the promo runs.
  const gift = unit === "box" && giftActive(p.freeGift) ? `${qty > 1 ? `${qty} × ` : ""}${p.freeGift!.name}` : null;
  const unitPrice = opts.priceOverride != null ? opts.priceOverride : basePrice;
  const pieces = unit === "box" ? qty * p.qtyPerBox : qty;
  return {
    productId,
    code: p.code,
    name: p.name,
    unit,
    unitLabel: p.unitLabel,
    qty,
    pieces,
    unitPrice,
    lineTotal: Math.round(unitPrice * qty * 100) / 100,
    thumb: p.thumbUrl ?? p.imageUrl ?? null,
    gift,
  };
}

/** Promo dates are Ghana business dates (YYYY-MM-DD), inclusive. */
export function giftActive(g: ProductDoc["freeGift"], today = businessDate()): boolean {
  if (!g?.name) return false;
  if (g.endsAt && today > g.endsAt) return false;
  if (g.startsAt && today < g.startsAt) return false;
  return true;
}

export function describeQty(line: Pick<LineItem, "unit" | "qty" | "unitLabel" | "pieces">): string {
  // Single items (1 per box, e.g. fridges) read as "2 units", not "2 boxes".
  if (line.unit === "box" && line.pieces !== line.qty) return `${line.qty} box${line.qty === 1 ? "" : "es"}`;
  return `${line.qty} ${line.unitLabel}${line.qty === 1 ? "" : "s"}`;
}

/**
 * Applies a stock change inside a transaction: writes the ledger row and
 * raises / resolves low-stock alerts. Caller must have already read `product`
 * in the same transaction and must perform no reads after calling this.
 */
export function applyStockChange(
  tx: Transaction,
  args: {
    productId: string;
    product: ProductDoc;
    newStock: number;
    delta: number;
    type: "receive" | "adjust" | "count" | "sale" | "order" | "void";
    reason: string | null;
    refId: string | null;
    byUid: string;
    lowStockDefault: number;
  },
): void {
  const { productId, product, newStock, delta } = args;
  const productRef = db.collection("products").doc(productId);
  tx.update(productRef, { stockPieces: newStock, updatedAt: FieldValue.serverTimestamp() });

  tx.create(db.collection("stockMovements").doc(), {
    branchId: product.branchId,
    productId,
    productName: product.name,
    code: product.code,
    type: args.type,
    qtyPieces: delta,
    balanceAfter: newStock,
    reason: args.reason,
    refId: args.refId,
    byUid: args.byUid,
    createdAt: FieldValue.serverTimestamp(),
  });

  const threshold = product.lowStockPieces ?? args.lowStockDefault;
  const alertRef = db.collection("alerts").doc(`${productId}_stock`);
  const wasLow = product.stockPieces <= threshold;
  const isLow = newStock <= threshold;
  if (isLow) {
    tx.set(alertRef, {
      branchId: product.branchId,
      productId,
      productName: product.name,
      code: product.code,
      type: newStock <= 0 ? "out_of_stock" : "low_stock",
      stockPieces: newStock,
      threshold,
      resolved: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else if (wasLow) {
    tx.set(alertRef, { resolved: true, stockPieces: newStock, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

export async function getLowStockDefault(tx?: Transaction): Promise<number> {
  const ref = db.collection("settings").doc("app");
  const snap = tx ? await tx.get(ref) : await ref.get();
  const v = snap.get("defaultLowStockPieces");
  return typeof v === "number" ? v : 10;
}

export function audit(
  tx: Transaction | null,
  entry: { actorUid: string; action: string; target: string; branchId?: string | null; details?: Record<string, unknown> },
): void {
  const ref = db.collection("auditLog").doc();
  const data = { ...entry, branchId: entry.branchId ?? null, at: FieldValue.serverTimestamp() };
  if (tx) tx.create(ref, data);
  else void ref.create(data);
}

export function pad(n: number, width = 6): string {
  return String(n).padStart(width, "0");
}
