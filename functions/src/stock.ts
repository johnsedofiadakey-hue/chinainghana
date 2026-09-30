import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { applyStockChange, assertCanManage, audit, db, getLowStockDefault, parse, ProductDoc, REGION, requireStaff } from "./shared";

const adjustStockSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(["receive", "adjust", "count"]),
  boxes: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  pieces: z.number().int().min(-10_000_000).max(10_000_000).default(0),
  reason: z.string().trim().max(300).optional().default(""),
});

/**
 * Staff: changes stock for one product.
 *  - receive: adds boxes + pieces (must be positive)
 *  - adjust:  adds a signed correction (reason required)
 *  - count:   sets stock to the counted boxes + pieces
 */
export const adjustStock = onCall({ region: REGION }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(adjustStockSchema, req.data);

  return db.runTransaction(async (tx) => {
    const ref = db.collection("products").doc(input.productId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Product not found.");
    const product = snap.data() as ProductDoc;
    assertCanManage(caller, product.branchId);
    const lowStockDefault = await getLowStockDefault(tx);

    const amount = input.boxes * product.qtyPerBox + input.pieces;
    let newStock: number;
    if (input.type === "receive") {
      if (amount <= 0) throw new HttpsError("invalid-argument", "Enter how many boxes or pieces you received.");
      newStock = product.stockPieces + amount;
    } else if (input.type === "adjust") {
      if (amount === 0) throw new HttpsError("invalid-argument", "Enter the correction amount.");
      if (!input.reason) throw new HttpsError("invalid-argument", "Give a reason for the adjustment.");
      newStock = product.stockPieces + amount;
    } else {
      if (amount < 0) throw new HttpsError("invalid-argument", "A count can't be negative.");
      newStock = amount;
    }
    if (newStock < 0) throw new HttpsError("failed-precondition", "Stock can't go below zero.");

    const delta = newStock - product.stockPieces;
    applyStockChange(tx, {
      productId: input.productId,
      product,
      newStock,
      delta,
      type: input.type,
      reason: input.reason || null,
      refId: null,
      byUid: caller.uid,
      lowStockDefault,
    });
    if (input.type !== "receive") {
      audit(tx, {
        actorUid: caller.uid,
        action: `stock.${input.type}`,
        target: input.productId,
        branchId: product.branchId,
        details: { product: product.name, from: product.stockPieces, to: newStock, reason: input.reason },
      });
    }
    return { stockPieces: newStock };
  });
});
