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
  pad,
  parse,
  phoneSchema,
  ProductDoc,
  REGION,
  requireStaff,
  siteUrl,
  summaryRef,
  Timestamp,
  waLink,
} from "./shared";
import { receiptText } from "./sales";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ORDERS = 5;

const placeOrderSchema = z.object({
  branchId: z.string().min(1),
  items: z.array(cartItemSchema).min(1, "Your cart is empty.").max(100),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    phone: phoneSchema,
    businessName: z.string().trim().max(80).optional().default(""),
  }),
  note: z.string().trim().max(500).optional().default(""),
});

function orderMessage(args: {
  orderNo: string;
  branchName: string;
  customer: { name: string; phone: string; businessName: string };
  items: LineItem[];
  total: number;
  note: string;
  orderId: string;
}): string {
  const phoneLocal = args.customer.phone.replace(/^\+233/, "0");
  const who = [args.customer.name, phoneLocal, args.customer.businessName].filter(Boolean).join(" · ");
  const lines = args.items.map(
    (l) => `• ${l.code} ${l.name}\n   ${describeQty(l)} × ${ghs(l.unitPrice)} = ${ghs(l.lineTotal)}${l.gift ? `\n   FREE GIFT: ${l.gift}` : ""}`,
  );
  return [
    `*NEW ORDER #${args.orderNo}*`,
    `Branch: ${args.branchName}`,
    `Customer: ${who}`,
    "──────────────",
    ...lines,
    "──────────────",
    `*TOTAL: ${ghs(args.total)}*`,
    args.note ? `Note: ${args.note}` : null,
    "",
    `View order: ${siteUrl()}/o/${args.orderId}`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/**
 * Public: validates a cart against live prices/stock, saves the order and
 * returns the WhatsApp deep link to the branch. The order exists even if the
 * customer never presses Send.
 */
// Turned on at launch (ENFORCE_APP_CHECK=true in functions/.env) once the web app sends App Check tokens.
export const placeOrder = onCall({ region: REGION, enforceAppCheck: process.env.ENFORCE_APP_CHECK === "true" }, async (req) => {
  const input = parse(placeOrderSchema, req.data);

  // Merge duplicate lines (same product + unit).
  const merged = new Map<string, { productId: string; unit: "box" | "piece"; qty: number }>();
  for (const it of input.items) {
    const key = `${it.productId}:${it.unit}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, qty: prev.qty + it.qty } : { ...it });
  }
  const items = [...merged.values()];

  const result = await db.runTransaction(async (tx) => {
    const branchRef = db.collection("branches").doc(input.branchId);
    const counterRef = db.collection("counters").doc(input.branchId);
    const customerRef = db.collection("customers").doc(input.customer.phone);
    const productRefs = [...new Set(items.map((i) => i.productId))].map((id) => db.collection("products").doc(id));

    const [branchSnap, counterSnap, customerSnap, ...productSnaps] = await tx.getAll(
      branchRef,
      counterRef,
      customerRef,
      ...productRefs,
    );

    if (!branchSnap.exists || branchSnap.get("active") !== true) {
      throw new HttpsError("failed-precondition", "This branch is not taking orders right now.");
    }
    const branch = branchSnap.data() as BranchDoc;

    // Simple per-phone rate limit to stop spam.
    const now = Date.now();
    const windowStart = (customerSnap.get("rateWindowStart") as Timestamp | undefined)?.toMillis() ?? 0;
    const windowCount = (customerSnap.get("rateWindowCount") as number | undefined) ?? 0;
    const inWindow = now - windowStart < RATE_WINDOW_MS;
    if (inWindow && windowCount >= RATE_MAX_ORDERS) {
      throw new HttpsError("resource-exhausted", "Too many orders in a short time. Please wait a few minutes or chat with the branch on WhatsApp.");
    }

    const products = new Map(productSnaps.map((s) => [s.id, s]));
    const lines: LineItem[] = [];
    const piecesByProduct = new Map<string, number>();

    for (const it of items) {
      const snap = products.get(it.productId);
      if (!snap?.exists) throw new HttpsError("not-found", "A product in your cart is no longer available.");
      const p = snap.data() as ProductDoc;
      if (p.branchId !== input.branchId || !p.visible) {
        throw new HttpsError("failed-precondition", `${p.name} is not available at ${branch.name}.`);
      }
      const line = buildLine(it.productId, p, it.unit, it.qty, { enforceMinimum: true });
      const totalPieces = (piecesByProduct.get(it.productId) ?? 0) + line.pieces;
      if (totalPieces > p.stockPieces) {
        throw new HttpsError(
          "failed-precondition",
          p.stockPieces <= 0
            ? `${p.name} is out of stock at ${branch.name}.`
            : `Only ${p.stockPieces} ${p.unitLabel}(s) of ${p.name} left at ${branch.name}.`,
        );
      }
      piecesByProduct.set(it.productId, totalPieces);
      lines.push(line);
    }

    const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const nextNo = ((counterSnap.get("lastOrderNo") as number | undefined) ?? 0) + 1;
    const orderNo = `${branch.code}-${pad(nextNo)}`;
    const orderRef = db.collection("orders").doc();

    const message = orderMessage({
      orderNo,
      branchName: branch.name,
      customer: input.customer,
      items: lines,
      total,
      note: input.note,
      orderId: orderRef.id,
    });

    tx.set(counterRef, { lastOrderNo: nextNo }, { merge: true });
    tx.create(orderRef, {
      orderNo,
      branchId: input.branchId,
      branchName: branch.name,
      customer: input.customer,
      note: input.note,
      items: lines,
      itemCount: lines.length,
      total,
      status: "new",
      statusHistory: [{ status: "new", at: Timestamp.now(), by: null }],
      saleId: null,
      waMessage: message,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      customerRef,
      {
        name: input.customer.name,
        businessName: input.customer.businessName,
        phone: input.customer.phone,
        orderCount: FieldValue.increment(1),
        lastOrderAt: FieldValue.serverTimestamp(),
        branchesUsed: FieldValue.arrayUnion(input.branchId),
        rateWindowStart: inWindow ? Timestamp.fromMillis(windowStart) : Timestamp.now(),
        rateWindowCount: inWindow ? windowCount + 1 : 1,
      },
      { merge: true },
    );
    tx.set(
      summaryRef(input.branchId),
      { branchId: input.branchId, date: summaryRef(input.branchId).id.split("_")[1], ordersNew: FieldValue.increment(1) },
      { merge: true },
    );

    return { orderId: orderRef.id, orderNo, total, message, whatsappUrl: waLink(branch.whatsapp, message) };
  });

  return result;
});

const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(["confirmed", "completed", "cancelled"]),
  reason: z.string().trim().max(300).optional().default(""),
});

const ALLOWED: Record<string, string[]> = {
  new: ["confirmed", "completed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * Staff: moves an order through new → confirmed → completed / cancelled.
 * Completing deducts stock and creates a sale with a receipt.
 */
export const updateOrderStatus = onCall({ region: REGION }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(updateOrderStatusSchema, req.data);

  return db.runTransaction(async (tx) => {
    const orderRef = db.collection("orders").doc(input.orderId);
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found.");
    const order = orderSnap.data()!;
    assertCanManage(caller, order.branchId);

    if (!ALLOWED[order.status]?.includes(input.status)) {
      throw new HttpsError("failed-precondition", `An order that is ${order.status} can't be marked ${input.status}.`);
    }
    if (input.status === "cancelled" && !input.reason) {
      throw new HttpsError("invalid-argument", "Give a reason for cancelling.");
    }

    const historyEntry = { status: input.status, at: Timestamp.now(), by: caller.uid, reason: input.reason || null };
    const sRef = summaryRef(order.branchId);
    const date = sRef.id.split("_")[1];

    if (input.status !== "completed") {
      tx.update(orderRef, {
        status: input.status,
        statusHistory: FieldValue.arrayUnion(historyEntry),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (input.status === "cancelled") {
        tx.set(sRef, { branchId: order.branchId, date, ordersCancelled: FieldValue.increment(1) }, { merge: true });
      }
      return { ok: true };
    }

    // ---- Completing: re-read products, check stock, deduct, create sale ----
    const items = order.items as LineItem[];
    const productIds = [...new Set(items.map((l) => l.productId))];
    const counterRef = db.collection("counters").doc(order.branchId);
    const [counterSnap, ...productSnaps] = await tx.getAll(
      counterRef,
      ...productIds.map((id) => db.collection("products").doc(id)),
    );
    const lowStockDefault = await getLowStockDefault(tx);

    const needed = new Map<string, number>();
    for (const l of items) needed.set(l.productId, (needed.get(l.productId) ?? 0) + l.pieces);

    for (const snap of productSnaps) {
      if (!snap.exists) throw new HttpsError("not-found", "A product on this order was removed.");
      const p = snap.data() as ProductDoc;
      const need = needed.get(snap.id)!;
      if (p.stockPieces < need) {
        throw new HttpsError(
          "failed-precondition",
          `Not enough stock for ${p.name}: need ${need}, have ${p.stockPieces} ${p.unitLabel}(s). Receive or adjust stock first.`,
        );
      }
    }

    const nextReceipt = ((counterSnap.get("lastReceiptNo") as number | undefined) ?? 0) + 1;
    const branchCode = String(order.orderNo).split("-")[0];
    const receiptNo = `${branchCode}-R-${pad(nextReceipt)}`;
    const saleRef = db.collection("sales").doc();

    for (const snap of productSnaps) {
      const p = snap.data() as ProductDoc;
      const need = needed.get(snap.id)!;
      applyStockChange(tx, {
        productId: snap.id,
        product: p,
        newStock: p.stockPieces - need,
        delta: -need,
        type: "order",
        reason: `Order ${order.orderNo}`,
        refId: saleRef.id,
        byUid: caller.uid,
        lowStockDefault,
      });
    }

    const piecesSold = items.reduce((s, l) => s + l.pieces, 0);
    tx.set(counterRef, { lastReceiptNo: nextReceipt }, { merge: true });
    tx.create(saleRef, {
      receiptNo,
      branchId: order.branchId,
      branchName: order.branchName,
      source: "order",
      orderId: orderRef.id,
      orderNo: order.orderNo,
      customer: { name: order.customer.name, phone: order.customer.phone },
      items,
      total: order.total,
      piecesSold,
      voided: false,
      voidReason: null,
      byUid: caller.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(orderRef, {
      status: "completed",
      saleId: saleRef.id,
      receiptNo,
      statusHistory: FieldValue.arrayUnion(historyEntry),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      sRef,
      {
        branchId: order.branchId,
        date,
        salesTotal: FieldValue.increment(order.total),
        salesCount: FieldValue.increment(1),
        orderTotal: FieldValue.increment(order.total),
        ordersCompleted: FieldValue.increment(1),
        piecesSold: FieldValue.increment(piecesSold),
      },
      { merge: true },
    );
    audit(tx, { actorUid: caller.uid, action: "order.complete", target: orderRef.id, branchId: order.branchId, details: { orderNo: order.orderNo, receiptNo } });

    const text = receiptText({
      receiptNo,
      branchName: order.branchName,
      items,
      total: order.total,
      saleId: saleRef.id,
      date: new Date(),
    });
    return { ok: true, saleId: saleRef.id, receiptNo, receiptWhatsappUrl: waLink(order.customer.phone, text) };
  });
});
