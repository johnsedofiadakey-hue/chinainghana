import { businessDate } from "./format";
import type { FreeGift } from "./types";

export type GiftStatus = "active" | "upcoming" | "ended";

/** Dates are Ghana business dates (YYYY-MM-DD), inclusive. No dates = always on. */
export function giftStatus(g: FreeGift | null | undefined, today = businessDate()): GiftStatus | null {
  if (!g?.name) return null;
  if (g.endsAt && today > g.endsAt) return "ended";
  if (g.startsAt && today < g.startsAt) return "upcoming";
  return "active";
}

function short(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "26 Oct – 2 Nov", "until 2 Nov", "from 26 Oct" or "". */
export function giftDates(g: FreeGift): string {
  if (g.startsAt && g.endsAt) return `${short(g.startsAt)} – ${short(g.endsAt)}`;
  if (g.endsAt) return `until ${short(g.endsAt)}`;
  if (g.startsAt) return `from ${short(g.startsAt)}`;
  return "";
}
