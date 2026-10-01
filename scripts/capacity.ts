/**
 * Developer control for the capacity lock on PRODUCTION (same switches as /super).
 *
 *   npx tsx scripts/capacity.ts status            # usage today, limit, lock and shop state
 *   npx tsx scripts/capacity.ts lock "reason"     # pause the shop for customers now
 *   npx tsx scripts/capacity.ts unlock "reason"   # lift the pause (stays open for the rest of today)
 *   npx tsx scripts/capacity.ts limit 150000      # new daily read limit (e.g. after she upgrades)
 *   npx tsx scripts/capacity.ts percent 90        # lock at this share of the limit
 *   npx tsx scripts/capacity.ts mode manual|auto  # after locking: stay locked / unlock at the daily reset
 *   npx tsx scripts/capacity.ts on|off            # automatic locking on or off (usage is still measured)
 *
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "china-in-ghana";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;
delete process.env.FIRESTORE_EMULATOR_HOST; // always the live project

const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID }));
const licenseRef = db.doc("settings/license");
const capacityRef = db.doc("settings/capacity");
const shopRef = db.doc("settings/shop");

const DEFAULTS = { enabled: true, dailyLimit: 50_000, lockAtPercent: 90, afterLock: "manual" };

/** Same rule as the functions: the free quota day starts at midnight US Pacific. */
function quotaDayStart(now = new Date()): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const offset = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
}

async function readsToday(): Promise<number> {
  const since = quotaDayStart();
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/monitoring.read"] }).getClient();
  const params = new URLSearchParams({
    filter: 'metric.type = "firestore.googleapis.com/document/read_count"',
    "interval.startTime": since.toISOString(),
    "interval.endTime": new Date().toISOString(),
    "aggregation.alignmentPeriod": "300s",
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const res = await client.request<{ timeSeries?: { points?: { value: { int64Value?: string } }[] }[] }>({
    url: `https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/timeSeries?${params}`,
  });
  return (res.data.timeSeries ?? []).flatMap((t) => t.points ?? []).reduce((s, p) => s + Number(p.value.int64Value ?? 0), 0);
}

async function log(action: string, details: Record<string, unknown>) {
  await db.collection("auditLog").add({ actorUid: "script:capacity", action, target: "settings/capacity", branchId: null, details, at: FieldValue.serverTimestamp() });
}

async function status() {
  const [lic, cap, shop] = await db.getAll(licenseRef, capacityRef, shopRef);
  const cfg = { ...DEFAULTS, ...(lic.get("capacity") ?? {}) };
  let reads: number | string;
  try {
    reads = await readsToday();
  } catch (e) {
    reads = `unavailable (${(e as Error).message})`;
  }
  const since = quotaDayStart();
  console.log(`Reads today:   ${typeof reads === "number" ? reads.toLocaleString() : reads}  (since ${since.toISOString()}, midnight US Pacific)`);
  console.log(`Daily limit:   ${cfg.dailyLimit.toLocaleString()} · locks at ${cfg.lockAtPercent}% (${Math.floor((cfg.dailyLimit * cfg.lockAtPercent) / 100).toLocaleString()})`);
  console.log(`Auto-lock:     ${cfg.enabled ? "on" : "off"} · after locking: ${cfg.afterLock === "auto" ? "unlock at the daily reset" : "stay locked until unlocked"}`);
  console.log(`Capacity lock: ${cap.get("locked") ? `LOCKED — ${cap.get("reason") ?? ""}` : "not locked"}`);
  const reopens = shop.get("reopensAt") as Timestamp | null | undefined;
  console.log(`Shop switch:   ${shop.exists && shop.get("open") === false ? `CLOSED by admin${reopens ? ` until ${reopens.toDate().toISOString()}` : ""}` : "open"}`);
}

async function main() {
  const [cmd = "status", arg] = process.argv.slice(2);
  switch (cmd) {
    case "status":
      return status();
    case "lock":
      await capacityRef.set({ locked: true, reason: arg || "Locked by developer", by: "script:capacity", auto: false, windowStart: Timestamp.fromDate(quotaDayStart()), at: FieldValue.serverTimestamp() }, { merge: true });
      await log("capacity.lock", { reason: arg || "Locked by developer" });
      console.log("✔ Shop paused for customers.");
      return;
    case "unlock":
      await capacityRef.set({ locked: false, reason: arg || "Unlocked by developer", by: "script:capacity", auto: false, releasedWindow: Timestamp.fromDate(quotaDayStart()), at: FieldValue.serverTimestamp() }, { merge: true });
      await log("capacity.unlock", { reason: arg || "Unlocked by developer" });
      console.log("✔ Shop unlocked (won't re-lock automatically until the next quota day).");
      return;
    case "limit":
    case "percent":
    case "mode":
    case "on":
    case "off": {
      const lic = await licenseRef.get();
      const cfg = { ...DEFAULTS, ...(lic.get("capacity") ?? {}) };
      if (cmd === "limit") {
        const n = Number(arg);
        if (!Number.isInteger(n) || n < 1000) throw new Error("limit: a whole number, 1000 or more");
        cfg.dailyLimit = n;
      } else if (cmd === "percent") {
        const n = Number(arg);
        if (!Number.isInteger(n) || n < 50 || n > 100) throw new Error("percent: 50–100");
        cfg.lockAtPercent = n;
      } else if (cmd === "mode") {
        if (arg !== "manual" && arg !== "auto") throw new Error("mode: manual or auto");
        cfg.afterLock = arg;
      } else cfg.enabled = cmd === "on";
      await licenseRef.set({ capacity: cfg }, { merge: true });
      await log("capacity.settings", cfg);
      console.log("✔ Saved:", cfg);
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Use: status | lock | unlock | limit <n> | percent <n> | mode manual|auto | on | off`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("✖", (e as Error).message);
    process.exit(1);
  },
);
