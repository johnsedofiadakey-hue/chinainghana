import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { audit, CALLABLE, db, FieldValue, parse, REGION, requireAdmin, requireSuper, Timestamp } from "./shared";

/*
 * Two public switches the shop reads before showing products or taking orders:
 *
 *   settings/shop      — the admin's "close the shop" switch (message, optional reopen time).
 *   settings/capacity  — the developer's capacity lock, set automatically when the day's
 *                        Firestore reads approach the free allowance, or by hand.
 *
 * Capacity configuration and usage are private, in settings/license (super admin only).
 * Both public docs are written only here (rules: write false), so every change is logged.
 */

const shopRef = db.collection("settings").doc("shop");
const capacityRef = db.collection("settings").doc("capacity");
const licenseRef = db.collection("settings").doc("license");

// ---------------------------------------------------------------------------
// Shop open / closed (admin)
// ---------------------------------------------------------------------------

const shopSchema = z.object({
  open: z.boolean(),
  message: z.string().trim().max(300).optional().default(""),
  /** ISO date-time; the shop reopens on its own after this. */
  reopensAt: z.string().datetime({ offset: true }).optional(),
  showContacts: z.boolean().optional().default(true),
});

export const setShopStatus = onCall({ ...CALLABLE }, async (req) => {
  const caller = requireAdmin(req);
  const input = parse(shopSchema, req.data);
  const reopensAt = !input.open && input.reopensAt ? Timestamp.fromDate(new Date(input.reopensAt)) : null;
  if (reopensAt && reopensAt.toMillis() <= Date.now()) throw new HttpsError("invalid-argument", "The reopening time must be in the future.");

  await shopRef.set({
    open: input.open,
    message: input.open ? "" : input.message,
    reopensAt,
    showContacts: input.showContacts,
    updatedBy: caller.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  audit(null, {
    actorUid: caller.uid,
    action: input.open ? "shop.open" : "shop.close",
    target: "settings/shop",
    details: input.open ? {} : { reason: input.message, reopensAt: input.reopensAt ?? null },
  });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Capacity lock (developer)
// ---------------------------------------------------------------------------

export interface CapacityConfig {
  enabled: boolean;
  /** Reads per day before the lock — 50,000 is Firestore's free allowance. */
  dailyLimit: number;
  /** Lock at this share of the limit (metrics lag a few minutes and are checked every 15). */
  lockAtPercent: number;
  /** "manual": stays locked until the developer unlocks. "auto": lifts when the free quota resets. */
  afterLock: "manual" | "auto";
}

const DEFAULT_CONFIG: CapacityConfig = { enabled: true, dailyLimit: 50_000, lockAtPercent: 90, afterLock: "manual" };

async function loadConfig(): Promise<CapacityConfig> {
  const snap = await licenseRef.get();
  return { ...DEFAULT_CONFIG, ...((snap.get("capacity") as Partial<CapacityConfig> | undefined) ?? {}) };
}

/** Firestore's free daily quota resets at midnight US Pacific time. */
export function quotaDayStart(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const localAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs);
}

function projectId(): string {
  const id = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId;
  if (!id) throw new Error("Unknown project id");
  return id;
}

/** Document reads since the quota day started, from Cloud Monitoring (lags a few minutes). */
export async function readsToday(now = new Date()): Promise<{ reads: number; since: Date }> {
  const since = quotaDayStart(now);
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] });
  const client = await auth.getClient();
  let reads = 0;
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      filter: 'metric.type = "firestore.googleapis.com/document/read_count"',
      "interval.startTime": since.toISOString(),
      "interval.endTime": now.toISOString(),
      "aggregation.alignmentPeriod": "300s",
      "aggregation.perSeriesAligner": "ALIGN_SUM",
      "aggregation.crossSeriesReducer": "REDUCE_SUM",
      view: "FULL",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await client.request<{ timeSeries?: { points?: { value: { int64Value?: string; doubleValue?: number } }[] }[]; nextPageToken?: string }>({
      url: `https://monitoring.googleapis.com/v3/projects/${projectId()}/timeSeries?${params}`,
    });
    for (const ts of res.data.timeSeries ?? []) {
      for (const p of ts.points ?? []) reads += Number(p.value.int64Value ?? p.value.doubleValue ?? 0);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return { reads, since };
}

async function setLock(locked: boolean, by: string, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
  await capacityRef.set({ locked, reason, by, at: FieldValue.serverTimestamp(), ...extra }, { merge: true });
  audit(null, { actorUid: by, action: locked ? "capacity.lock" : "capacity.unlock", target: "settings/capacity", details: { reason } });
}

async function pushToDevelopers(title: string, body: string): Promise<void> {
  try {
    const supers = await db.collection("users").where("role", "==", "superadmin").get();
    const tokens = supers.docs.flatMap((d) => (d.get("pushTokens") as string[] | undefined) ?? []);
    if (!tokens.length) return;
    await getMessaging().sendEachForMulticast({ tokens, data: { title, body, url: "/super", tag: "capacity" }, webpush: { headers: { Urgency: "high" } } });
  } catch (e) {
    logger.warn("developer push failed", { error: (e as Error).message });
  }
}

/** Measures today's reads, records them, and locks or unlocks the shop according to the config. */
async function runCheck(actor: string): Promise<{ reads: number; limit: number; locked: boolean; since: string }> {
  const config = await loadConfig();
  const { reads, since } = await readsToday();
  const windowStart = Timestamp.fromDate(since);
  const cap = await capacityRef.get();
  const locked = cap.get("locked") === true;
  const lockedWindow = (cap.get("windowStart") as Timestamp | undefined)?.toMillis();
  const releasedWindow = (cap.get("releasedWindow") as Timestamp | undefined)?.toMillis();
  const threshold = Math.floor((config.dailyLimit * config.lockAtPercent) / 100);

  await licenseRef.set(
    { capacityUsage: { reads, windowStart, threshold, checkedAt: FieldValue.serverTimestamp() } },
    { merge: true },
  );

  let nowLocked = locked;
  if (config.enabled && !locked && reads >= threshold && releasedWindow !== windowStart.toMillis()) {
    await setLock(true, actor, `Daily capacity reached: ${reads.toLocaleString()} of ${config.dailyLimit.toLocaleString()} reads`, {
      auto: true,
      windowStart,
    });
    nowLocked = true;
    await pushToDevelopers("Shop locked: capacity reached", `${reads.toLocaleString()} reads today (limit ${config.dailyLimit.toLocaleString()}).`);
  } else if (locked && cap.get("auto") === true && config.afterLock === "auto" && lockedWindow !== undefined && lockedWindow < windowStart.toMillis()) {
    await setLock(false, actor, "Free quota reset — unlocked automatically", { auto: false });
    nowLocked = false;
  }
  return { reads, limit: config.dailyLimit, locked: nowLocked, since: since.toISOString() };
}

/** Every 15 minutes (2 of the 3 free Cloud Scheduler jobs in use, with nightlyBackup). */
export const checkCapacity = onSchedule({ schedule: "every 15 minutes", timeZone: "Africa/Accra", region: REGION, retryCount: 0 }, async () => {
  try {
    const r = await runCheck("system:capacity");
    logger.info("capacity", r);
  } catch (e) {
    logger.error("capacity check failed", { error: (e as Error).message });
  }
});

const setCapacitySchema = z.object({
  action: z.enum(["save", "lock", "unlock", "check"]),
  enabled: z.boolean().optional(),
  dailyLimit: z.number().int().min(1_000).max(100_000_000).optional(),
  lockAtPercent: z.number().int().min(50).max(100).optional(),
  afterLock: z.enum(["manual", "auto"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

/** Developer: change the capacity settings, lock/unlock by hand, or measure now. */
export const setCapacity = onCall({ ...CALLABLE, timeoutSeconds: 60 }, async (req) => {
  const caller = requireSuper(req);
  const input = parse(setCapacitySchema, req.data);

  if (input.action === "save") {
    const patch: Partial<CapacityConfig> = {};
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.dailyLimit !== undefined) patch.dailyLimit = input.dailyLimit;
    if (input.lockAtPercent !== undefined) patch.lockAtPercent = input.lockAtPercent;
    if (input.afterLock !== undefined) patch.afterLock = input.afterLock;
    await licenseRef.set({ capacity: { ...(await loadConfig()), ...patch } }, { merge: true });
    audit(null, { actorUid: caller.uid, action: "capacity.settings", target: "settings/license", details: patch as Record<string, unknown> });
    return { ok: true };
  }
  if (input.action === "lock") {
    await setLock(true, caller.uid, input.reason || "Locked by developer", { auto: false, windowStart: Timestamp.fromDate(quotaDayStart()) });
    return { ok: true };
  }
  if (input.action === "unlock") {
    // Don't re-lock for the rest of today's quota window after a manual unlock.
    await setLock(false, caller.uid, input.reason || "Unlocked by developer", { auto: false, releasedWindow: Timestamp.fromDate(quotaDayStart()) });
    return { ok: true };
  }
  try {
    return { ok: true, ...(await runCheck(caller.uid)) };
  } catch (e) {
    throw new HttpsError("unavailable", `Couldn't read usage from Cloud Monitoring: ${(e as Error).message}`);
  }
});

// ---------------------------------------------------------------------------
// Used by placeOrder
// ---------------------------------------------------------------------------

/** Throws if customers can't order right now (shop closed or capacity lock). */
export async function assertShopOpen(): Promise<void> {
  const [shop, cap] = await db.getAll(shopRef, capacityRef);
  if (cap.get("locked") === true) {
    throw new HttpsError("unavailable", "The shop is temporarily unavailable. Please try again later or contact the branch on WhatsApp.");
  }
  if (shop.exists && shop.get("open") === false) {
    const reopensAt = shop.get("reopensAt") as Timestamp | null | undefined;
    if (!reopensAt || reopensAt.toMillis() > Date.now()) {
      throw new HttpsError("failed-precondition", (shop.get("message") as string) || "The shop is closed right now. Please check back soon.");
    }
  }
}
