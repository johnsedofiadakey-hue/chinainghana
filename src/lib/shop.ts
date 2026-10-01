"use client";

import { useEffect, useState } from "react";
import { useDocData } from "./hooks";
import { toDate } from "./format";
import type { CapacityStatus, ShopStatus } from "./types";

export type ShopState = "open" | "closed" | "paused";

/**
 * Whether customers can use the shop right now.
 *  - "paused": the developer's capacity lock is on.
 *  - "closed": the admin closed the shop (until reopensAt, if set).
 */
export function useShopGate() {
  const shop = useDocData<ShopStatus>("settings/shop");
  const capacity = useDocData<CapacityStatus>("settings/capacity");
  const loading = shop.loading || capacity.loading;

  const now = useMinuteClock();
  const reopensAt = toDate(shop.data?.reopensAt ?? null);
  const closed = !!shop.data && shop.data.open === false && (!reopensAt || reopensAt.getTime() > now);
  const state: ShopState = capacity.data?.locked ? "paused" : closed ? "closed" : "open";

  return {
    state,
    loading,
    message: shop.data?.message ?? "",
    reopensAt: closed ? reopensAt : null,
    showContacts: shop.data?.showContacts ?? true,
    shop: shop.data,
    capacity: capacity.data,
  };
}

/** Current time, refreshed every minute, so a timed reopening shows without a reload. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function formatReopen(d: Date): string {
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });
}
