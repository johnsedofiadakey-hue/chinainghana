import { httpsCallable, type FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { Unit } from "./types";

function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export interface CartLine {
  productId: string;
  unit: Unit;
  qty: number;
}

/** One spreadsheet row; empty cells are left out. */
export interface ImportRow {
  code: string;
  name: string;
  category?: string;
  description?: string;
  qtyPerBox?: number;
  unitLabel?: string;
  boxPrice?: number;
  piecePrice?: number;
  minBoxes?: number;
  minPieces?: number;
  lowStockPieces?: number;
  visible?: boolean;
  hot?: boolean;
  isNew?: boolean;
  stockBoxes?: number;
  stockPieces?: number;
  giftName?: string;
  giftStartsAt?: string;
  giftEndsAt?: string;
}

export const api = {
  placeOrder: callable<
    {
      branchId: string;
      items: CartLine[];
      customer: { name: string; phone: string; businessName?: string };
      note?: string;
    },
    { orderId: string; orderNo: string; total: number; message: string; whatsappUrl: string }
  >("placeOrder"),

  createBranch: callable<
    {
      name: string;
      address: string;
      landmark?: string;
      ghanaPostGps?: string;
      lat: number;
      lng: number;
      whatsapp: string;
      phone?: string;
      hours?: string;
    },
    { branchId: string; slug: string; code: string }
  >("createBranch"),

  createStaff: callable<
    { name: string; username: string; password: string; phone?: string; branchId: string },
    { uid: string }
  >("createStaff"),

  updateStaff: callable<
    { uid: string; name?: string; phone?: string; branchId?: string; active?: boolean; newPassword?: string },
    { ok: true }
  >("updateStaff"),

  setAdminAccount: callable<{ name: string; username: string; password: string }, { uid: string; created: boolean }>("setAdminAccount"),

  adjustStock: callable<
    { productId: string; type: "receive" | "adjust" | "count"; boxes: number; pieces: number; reason?: string },
    { stockPieces: number }
  >("adjustStock"),

  updateOrderStatus: callable<
    { orderId: string; status: "confirmed" | "completed" | "cancelled"; reason?: string },
    { ok: true; saleId?: string; receiptNo?: string; receiptWhatsappUrl?: string }
  >("updateOrderStatus"),

  recordSale: callable<
    {
      branchId: string;
      items: (CartLine & { unitPrice?: number | null })[];
      customer?: { name?: string; phone?: string };
    },
    { saleId: string; receiptNo: string; total: number; receiptText: string; receiptWhatsappUrl: string | null }
  >("recordSale"),

  voidSale: callable<{ saleId: string; reason: string }, { ok: true }>("voidSale"),

  closeDay: callable<{ branchId: string; date: string; cashCounted?: number; note?: string }, { ok: true; salesTotal: number }>("closeDay"),
  reopenDay: callable<{ branchId: string; date: string }, { ok: true }>("reopenDay"),

  submitStockTake: callable<
    { branchId: string; scope?: string; note?: string; lines: { productId: string; countedPieces: number }[] },
    { id: string; varianceLines: number }
  >("submitStockTake"),
  reviewStockTake: callable<{ id: string; approve: boolean; note?: string }, { ok: true; applied: number }>("reviewStockTake"),

  importProducts: callable<
    { branchId: string; rows: ImportRow[] },
    { created: number; updated: number; stockChanged: number; errors: { code: string; message: string }[] }
  >("importProducts"),

  setPushToken: callable<{ token: string; enabled: boolean }, { ok: true }>("setPushToken"),
};

/** Human-readable message from a callable error. */
export function errorMessage(e: unknown): string {
  const err = e as Partial<FunctionsError> & { message?: string };
  if (err?.code === "functions/unavailable" || err?.code === "functions/internal") {
    return err.message && err.message !== "internal" ? err.message : "Couldn't reach the server. Check your connection and try again.";
  }
  return err?.message || "Something went wrong. Try again.";
}

export function errorDetails<T>(e: unknown): T | null {
  const err = e as { details?: T };
  return err?.details ?? null;
}
