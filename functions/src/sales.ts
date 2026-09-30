import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  applyStockChange,
  assertCanManage,
  audit,
  BranchDoc,
  buildLine,
  cartItemSchema,
  db,
  describeQty,
  FieldValue,
  getLowStockDefault,
  ghs,
  LineItem,
  normalizeGhanaPhone,
  pad,
  parse,
  ProductDoc,
  REGION,
  requireStaff,
  siteUrl,
  summaryRef,
  waLink,
} from "./shared";

export function receiptText(args: {
  receiptNo: string;
  branchName: string;
  items: LineItem[];
  total: number;
  saleId: string;
  date: Date;
}): string {
  const when = args.date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  });
  const lines = args.items.map((l) => `• ${l.code} ${l.name}\n   ${describeQty(l)} × ${ghs(l.unitPrice)} = ${ghs(l.lineTotal)}${l.gift ? `\n   🎁 FREE: ${l.gift}` : ""}`);
  return [
    `✅ *RECEIPT #${args.receiptNo}*`,
    `China-in-Ghana · ${args.branchName}`,
    when,
    "──────────────",
    ...lines,
    "──────────────",
    `*TOTAL: ${ghs(args.total)}*`,
    "",
    "Thank you for shopping with us!",
    `${siteUrl()}/r/${args.saleId}`,
  ].join("\n");
}

const recordSaleSchema = z.object({
  branchId: z.string().min(1),
  items: z
    .array(cartItemSchema.extend({ unitPrice: z.number().nonnegative().max(10_000_000).nullable().optional() }))
    .min(1, "Add at least one product.")
    .max(200),
  customer: z
    .object({
      name: z.string().trim().max(80).optional().default(""),
      phone: z.string().trim().max(30).optional().default(""),
    })
    .optional()
    .default({ name: "", phone: "" }),
});

/** Staff: records a walk-in sale, deducts stock and returns a WhatsApp receipt link. */
export const recordSale = onCall({ region: REGION }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(recordSaleSchema, req.data);
  assertCanManage(caller, input.branchId);

  const customerPhone = input.customer.phone ? normalizeGhanaPhone(input.customer.phone) : null;
  if (input.customer.phone && !customerPhone) throw new HttpsError("invalid-argument", "Enter a valid Ghana phone number for the receipt.");

  return db.runTransaction(async (tx) => {
    const branchRef = db.collection("branches").doc(input.branchId);
    const counterRef = db.collection("counters").doc(input.branchId);
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const [branchSnap, counterSnap, ...productSnaps] = await tx.getAll(
      branchRef,
      counterRef,
      ...productIds.map((id) => db.collection("products").doc(id)),
    );
    const lowStockDefault = await getLowStockDefault(tx);

    if (!branchSnap.exists) throw new HttpsError("not-found", "Branch not found.");
    const branch = branchSnap.data() as BranchDoc;
    const products = new Map(productSnaps.map((s) => [s.id, s]));

    const lines: LineItem[] = [];
    const needed = new Map<string, number>();
    for (const it of input.items) {
      const snap = products.get(it.productId);
      if (!snap?.exists) throw new HttpsError("not-found", "Product not found.");
      const p = snap.data() as ProductDoc;
      if (p.branchId !== input.branchId) throw new HttpsError("failed-precondition", `${p.name} belongs to another branch.`);
      const line = buildLine(it.productId, p, it.unit, it.qty, { enforceMinimum: false, priceOverride: it.unitPrice ?? null });
      needed.set(it.productId, (needed.get(it.productId) ?? 0) + line.pieces);
      lines.push(line);
    }

    for (const [productId, need] of needed) {
      const p = products.get(productId)!.data() as ProductDoc;
      if (p.stockPieces < need) {
        throw new HttpsError("failed-precondition", `Not enough stock for ${p.name}: need ${need}, have ${p.stockPieces} ${p.unitLabel}(s).`);
      }
    }

    const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const piecesSold = lines.reduce((s, l) => s + l.pieces, 0);
    const nextReceipt = ((counterSnap.get("lastReceiptNo") as number | undefined) ?? 0) + 1;
    const receiptNo = `${branch.code}-R-${pad(nextReceipt)}`;
    const saleRef = db.collection("sales").doc();

    for (const [productId, need] of needed) {
      const p = products.get(productId)!.data() as ProductDoc;
      applyStockChange(tx, {
        productId,
        product: p,
        newStock: p.stockPieces - need,
        delta: -need,
        type: "sale",
        reason: `Sale ${receiptNo}`,
        refId: saleRef.id,
        byUid: caller.uid,
        lowStockDefault,
      });
    }

    tx.set(counterRef, { lastReceiptNo: nextReceipt }, { merge: true });
    tx.create(saleRef, {
      receiptNo,
      branchId: input.branchId,
      branchName: branch.name,
      source: "walkin",
      orderId: null,
      orderNo: null,
      customer: { name: input.customer.name, phone: customerPhone ?? "" },
      items: lines,
      total,
      piecesSold,
      voided: false,
      voidReason: null,
      byUid: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    const sRef = summaryRef(input.branchId);
    tx.set(
      sRef,
      {
        branchId: input.branchId,
        date: sRef.id.split("_")[1],
        salesTotal: FieldValue.increment(total),
        salesCount: FieldValue.increment(1),
        walkinTotal: FieldValue.increment(total),
        piecesSold: FieldValue.increment(piecesSold),
      },
      { merge: true },
    );

    const text = receiptText({ receiptNo, branchName: branch.name, items: lines, total, saleId: saleRef.id, date: new Date() });
    return {
      saleId: saleRef.id,
      receiptNo,
      total,
      receiptText: text,
      receiptWhatsappUrl: customerPhone ? waLink(customerPhone, text) : null,
    };
  });
});

const voidSaleSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().trim().min(3, "Give a reason for voiding.").max(300),
});

/** Staff: voids a sale, returns the stock, and logs it for the Admin. */
export const voidSale = onCall({ region: REGION }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(voidSaleSchema, req.data);

  return db.runTransaction(async (tx) => {
    const saleRef = db.collection("sales").doc(input.saleId);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new HttpsError("not-found", "Sale not found.");
    const sale = saleSnap.data()!;
    assertCanManage(caller, sale.branchId);
    if (sale.voided) throw new HttpsError("failed-precondition", "This sale is already voided.");

    const items = sale.items as LineItem[];
    const returned = new Map<string, number>();
    for (const l of items) returned.set(l.productId, (returned.get(l.productId) ?? 0) + l.pieces);
    const productSnaps = await tx.getAll(...[...returned.keys()].map((id) => db.collection("products").doc(id)));
    const lowStockDefault = await getLowStockDefault(tx);

    for (const snap of productSnaps) {
      if (!snap.exists) continue;
      const p = snap.data() as ProductDoc;
      const qty = returned.get(snap.id)!;
      applyStockChange(tx, {
        productId: snap.id,
        product: p,
        newStock: p.stockPieces + qty,
        delta: qty,
        type: "void",
        reason: `Void ${sale.receiptNo}: ${input.reason}`,
        refId: saleRef.id,
        byUid: caller.uid,
        lowStockDefault,
      });
    }

    tx.update(saleRef, {
      voided: true,
      voidReason: input.reason,
      voidedBy: caller.uid,
      voidedAt: FieldValue.serverTimestamp(),
    });

    // Adjust the summary of the day the sale was made.
    const saleDate = (sale.createdAt?.toDate?.() as Date | undefined) ?? new Date();
    const sRef = summaryRef(sale.branchId, saleDate.toISOString().slice(0, 10));
    tx.set(
      sRef,
      {
        branchId: sale.branchId,
        date: sRef.id.split("_")[1],
        salesTotal: FieldValue.increment(-sale.total),
        salesCount: FieldValue.increment(-1),
        [sale.source === "order" ? "orderTotal" : "walkinTotal"]: FieldValue.increment(-sale.total),
        piecesSold: FieldValue.increment(-(sale.piecesSold ?? 0)),
        voidCount: FieldValue.increment(1),
        voidTotal: FieldValue.increment(sale.total),
      },
      { merge: true },
    );
    audit(tx, {
      actorUid: caller.uid,
      action: "sale.void",
      target: saleRef.id,
      branchId: sale.branchId,
      details: { receiptNo: sale.receiptNo, total: sale.total, reason: input.reason },
    });

    return { ok: true };
  });
});
