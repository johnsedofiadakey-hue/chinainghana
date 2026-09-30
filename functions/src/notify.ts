import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";
import { db, FieldValue, ghs, parse, REGION, requireStaff, CALLABLE } from "./shared";

// ---------------------------------------------------------------------------
// Push tokens
// ---------------------------------------------------------------------------

const tokenSchema = z.object({ token: z.string().min(20).max(4096), enabled: z.boolean() });

/** Staff: saves (or removes) this device's push token on their profile. */
export const setPushToken = onCall({ ...CALLABLE }, async (req) => {
  const caller = requireStaff(req);
  const input = parse(tokenSchema, req.data);
  await db
    .collection("users")
    .doc(caller.uid)
    .set({ pushTokens: input.enabled ? FieldValue.arrayUnion(input.token) : FieldValue.arrayRemove(input.token) }, { merge: true });
  return { ok: true };
});

/** Tokens of the branch's active managers plus every admin. */
async function recipients(branchId: string): Promise<Map<string, string[]>> {
  const [managers, admins] = await Promise.all([
    db.collection("users").where("branchId", "==", branchId).get(),
    db.collection("users").where("role", "in", ["admin", "superadmin"]).get(),
  ]);
  const out = new Map<string, string[]>();
  for (const d of [...managers.docs, ...admins.docs]) {
    if (d.get("active") === false) continue;
    const tokens = (d.get("pushTokens") as string[] | undefined) ?? [];
    if (tokens.length) out.set(d.id, tokens);
  }
  return out;
}

async function push(branchId: string, msg: { title: string; body: string; url: string; tag: string }): Promise<void> {
  const byUser = await recipients(branchId);
  const tokens = [...byUser.values()].flat();
  if (!tokens.length) return;

  try {
    // Data-only message: the service worker (public/sw.js) shows the notification.
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      data: { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag },
      webpush: { headers: { Urgency: "high", TTL: "86400" } },
    });

    // Drop tokens for uninstalled / expired devices.
    const dead = new Set<string>();
    res.responses.forEach((r, i) => {
      const code = r.error?.code ?? "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) dead.add(tokens[i]);
    });
    if (dead.size) {
      await Promise.all(
        [...byUser.entries()]
          .filter(([, ts]) => ts.some((t) => dead.has(t)))
          .map(([uid, ts]) => db.collection("users").doc(uid).update({ pushTokens: FieldValue.arrayRemove(...ts.filter((t) => dead.has(t))) })),
      );
    }
  } catch (e) {
    // Messaging isn't available in the local emulators; never fail the trigger over a notification.
    logger.warn("push failed", { branchId, error: (e as Error).message });
  }
}

/** New online order → notify the branch's managers and the admin. */
export const onOrderCreated = onDocumentCreated({ document: "orders/{orderId}", region: REGION }, async (event) => {
  const o = event.data?.data();
  if (!o) return;
  await push(o.branchId as string, {
    title: `New order #${o.orderNo} · ${ghs(o.total as number)}`,
    body: `${o.customer?.name ?? "Customer"} · ${o.itemCount} item(s) · ${o.branchName}`,
    url: `/console/orders?open=${event.params.orderId}`,
    tag: `order-${event.params.orderId}`,
  });
});

/** Product just went low or out of stock → notify. Repeats are skipped. */
export const onStockAlert = onDocumentWritten({ document: "alerts/{alertId}", region: REGION }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || after.resolved) return;
  const becameActive = !before || before.resolved === true;
  const becameOut = before && before.type !== "out_of_stock" && after.type === "out_of_stock";
  if (!becameActive && !becameOut) return;

  const out = after.type === "out_of_stock";
  await push(after.branchId as string, {
    title: out ? `Out of stock: ${after.productName}` : `Low stock: ${after.productName}`,
    body: out ? `${after.code} has run out.` : `${after.code} · only ${after.stockPieces} pieces left.`,
    url: `/console/products?filter=${out ? "out" : "low"}`,
    tag: `stock-${after.productId}`,
  });
});

// ---------------------------------------------------------------------------
// Nightly backup
// ---------------------------------------------------------------------------

/**
 * Exports the whole database to Cloud Storage every night at 02:00 Ghana time.
 * Set BACKUP_BUCKET (e.g. "gs://my-project-backups") in functions/.env; give the
 * bucket a 30-day delete lifecycle rule for retention. Skipped when unset.
 */
export const nightlyBackup = onSchedule({ schedule: "0 2 * * *", timeZone: "Africa/Accra", region: REGION }, async () => {
  const bucket = process.env.BACKUP_BUCKET;
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (!bucket || !projectId) {
    logger.info("nightlyBackup skipped: BACKUP_BUCKET not set");
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { v1 } = require("@google-cloud/firestore") as typeof import("@google-cloud/firestore");
  const client = new v1.FirestoreAdminClient();
  const [op] = await client.exportDocuments({
    name: client.databasePath(projectId, "(default)"),
    outputUriPrefix: `${bucket.replace(/\/$/, "")}/${new Date().toISOString().slice(0, 10)}`,
    collectionIds: [],
  });
  logger.info("nightlyBackup started", { operation: op.name });
});
