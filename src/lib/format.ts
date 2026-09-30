import type { Timestamp } from "firebase/firestore";
import type { Product } from "./types";

export function ghs(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(n).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}GH₵${abs}`;
}

/** "14 boxes + 5 pcs" style stock display. */
export function stockLabel(pieces: number, qtyPerBox: number, unitLabel = "pc"): string {
  if (pieces <= 0) return "0";
  if (isSingle(qtyPerBox)) return `${pieces} ${unitLabel}${pieces === 1 ? "" : "s"}`;
  const per = Math.max(qtyPerBox, 1);
  const boxes = Math.floor(pieces / per);
  const loose = pieces % per;
  const parts: string[] = [];
  if (boxes) parts.push(`${boxes} box${boxes === 1 ? "" : "es"}`);
  if (loose) parts.push(`${loose} ${unitLabel}${loose === 1 ? "" : "s"}`);
  return parts.join(" + ");
}

export type Availability = "in" | "low" | "out";

export function availability(p: Pick<Product, "stockPieces" | "lowStockPieces">, defaultLow: number): Availability {
  if (p.stockPieces <= 0) return "out";
  if (p.stockPieces <= (p.lowStockPieces ?? defaultLow)) return "low";
  return "in";
}

/** Normalises Ghana numbers to E.164 (+233XXXXXXXXX). */
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

/** +233547738678 → 054 773 8678 */
export function displayPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+233(\d{2})(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function waLink(phoneE164: string, text?: string): string {
  const base = `https://wa.me/${phoneE164.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function toDate(ts: Timestamp | Date | null | undefined): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  return typeof ts.toDate === "function" ? ts.toDate() : null;
}

export function dateTime(ts: Timestamp | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(ts: Timestamp | Date | null | undefined): string {
  const d = toDate(ts);
  if (!d) return "just now";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Ghana is UTC+0 all year, so the UTC date is the business date. */
export function businessDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Items packed one per box (fridges, freezers) are sold as single units, not "boxes". */
export function isSingle(qtyPerBox: number): boolean {
  return qtyPerBox <= 1;
}

/** "box"/"boxes", or the unit name for single items ("unit"/"units"). */
export function boxWord(qtyPerBox: number, unitLabel: string, n = 1): string {
  if (isSingle(qtyPerBox)) return `${unitLabel}${n === 1 ? "" : "s"}`;
  return n === 1 ? "box" : "boxes";
}

/** Price suffix: "each" for single items, "/box" otherwise. */
export function priceSuffix(qtyPerBox: number): string {
  return isSingle(qtyPerBox) ? "each" : "/box";
}

/** "3 boxes", "12 pcs", "1 unit" for an order/sale line. */
export function lineQty(l: { unit: "box" | "piece"; qty: number; pieces: number; unitLabel: string }): string {
  const single = l.unit === "piece" || l.pieces === l.qty;
  if (single) return `${l.qty} ${l.unitLabel}${l.qty === 1 ? "" : "s"}`;
  return `${l.qty} ${l.qty === 1 ? "box" : "boxes"}`;
}
