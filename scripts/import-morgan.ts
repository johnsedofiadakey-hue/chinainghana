/**
 * Imports the supplier's (Morgan Electric) public price list into ONE branch on PRODUCTION.
 *
 *   npx tsx scripts/import-morgan.ts <branchId> --dry-run   # show what would happen
 *   npx tsx scripts/import-morgan.ts <branchId>             # import
 *
 * - Products are created HIDDEN (Show in shop off) with stock 0. The client sets her own
 *   prices and real stock, then switches them on.
 * - Their prices are what the client PAYS; they're copied as placeholder selling prices and
 *   also kept on each product under `supplier` as a cost reference.
 * - Photos are downloaded once, resized and stored in the project's own Storage (no hotlinking).
 * - Safe to re-run: codes the branch already has are skipped.
 *
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { randomUUID } from "node:crypto";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "china-in-ghana";
const BUCKET = process.env.STORAGE_BUCKET ?? "china-in-ghana.firebasestorage.app";
const SOURCE_URL = "https://morgan.dzncm.com/price8146988/";
const SOURCE_ORIGIN = "https://morgan.dzncm.com";
const UA = "Mozilla/5.0 (China-in-Ghana catalogue import)";
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= PROJECT_ID;

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Row {
  name: string;
  code: string;
  qtyText: string;
  unitPrice: number;
  boxPrice: number;
  image: string;
  tags: string[];
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function parsePage(html: string): Row[] {
  const tbody = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const rows: Row[] = [];
  for (const m of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tr = m[1];
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length < 9) continue;
    rows.push({
      name: decode(tds[1]),
      code: decode(tds[2]),
      qtyText: decode(tds[3]),
      unitPrice: Number(decode(tds[5]).replace(/[^\d.]/g, "")),
      boxPrice: Number(decode(tds[6]).replace(/[^\d.]/g, "")),
      image: tr.match(/data-image-large="([^"]*)"/)?.[1] ?? "",
      tags: [...tr.matchAll(/class="(hot-tag|new-tag)/g)].map((x) => (x[1] === "hot-tag" ? "hot" : "new")),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Mapping to the app's product model
// ---------------------------------------------------------------------------

const CATEGORIES: { id: string; name: string; sortOrder: number; match: RegExp }[] = [
  { id: "electrical-solar", name: "Electrical & solar", sortOrder: 6, match: /socket|geng|lighted switch|regulator|stabilizer|extension|solar|street light|flood ?light|camping lamp/i },
  { id: "fans-cooling", name: "Fans & cooling", sortOrder: 3, match: /fan|rooftop/i },
  { id: "fridges-freezers", name: "Fridges & freezers", sortOrder: 4, match: /freezer|refrigerator/i },
  {
    id: "kitchen",
    name: "Kitchen appliances",
    sortOrder: 1,
    match: /blender|kettle|dispenser|hot ?plate|grinder|grinding|fryer|cookware|cooker|microwave|juicer|toaster|stove|pot\b|popcorn|sandwi|grill|fufu|mixer|breakfast|cutter|sealer/i,
  },
  { id: "phone-audio", name: "Phone, audio & gadgets", sortOrder: 2, match: /cable|charg|earbud|headset|power ?bank|airpod|speaker|soundbar|selfie|phone stand|video light|fill light/i },
  { id: "home-care", name: "Home & personal care", sortOrder: 5, match: /iron|hair ?dryer|vacuum|washing|shower|rat trap|car |monitor|surveillance/i },
];
const OTHER = { id: "other", name: "Other", sortOrder: 9 };

const categoryFor = (name: string) => CATEGORIES.find((c) => c.match.test(name)) ?? OTHER;

/** Big single items are counted as "unit"; everything else as "pc". */
const isBigItem = (name: string) => /freezer|refrigerator|microwave|washing|dispenser|stove/i.test(name);

function mapRow(r: Row) {
  const qtyMatch = r.qtyText.match(/(\d+)\s*BOX\s*\((\d+)\s*PC\)/i); // "1 BOX(2PC)": price is per box of 2
  const perBox = qtyMatch ? Number(qtyMatch[2]) : Number(r.qtyText.match(/\d+/)?.[0] ?? 1);
  const moq = Number(r.qtyText.match(/MOQ\s*(?:=|>=|≥|>)\s*(\d+)/i)?.[1] ?? 0) || null;
  const notes = r.qtyText.match(/\(([^)]*colou?rs?[^)]*)\)/i)?.[1];

  const single = perBox <= 1 && !qtyMatch;
  const unitLabel = isBigItem(r.name) ? "unit" : "pc";
  const boxPrice = qtyMatch || single ? r.boxPrice : r.boxPrice || r.unitPrice * perBox;

  return {
    qtyPerBox: Math.max(perBox, 1),
    unitLabel,
    boxPrice,
    piecePrice: single || qtyMatch ? null : r.unitPrice,
    sellByPiece: !single && !qtyMatch,
    minBoxes: single ? (moq ?? 1) : 1,
    minPieces: !single && !qtyMatch ? Math.min(moq ?? 1, perBox) : 1,
    description: notes ? notes.replace(/^\w/, (c) => c.toUpperCase()) : "",
  };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function rehostImage(branchId: string, src: string): Promise<{ imageUrl: string; thumbUrl: string } | null> {
  if (!src) return null;
  const url = src.startsWith("http") ? src : `${SOURCE_ORIGIN}${src}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const input = Buffer.from(await res.arrayBuffer());
  const id = randomUUID();
  const out: Record<string, string> = {};
  for (const [kind, size, quality] of [
    ["full", 1200, 82],
    ["thumb", 400, 78],
  ] as const) {
    const data = await sharp(input).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
    const path = `products/${branchId}/${id}${kind === "thumb" ? "_thumb" : ""}.webp`;
    const token = randomUUID();
    await bucket.file(path).save(data, {
      contentType: "image/webp",
      metadata: { cacheControl: "public,max-age=31536000", metadata: { firebaseStorageDownloadTokens: token } },
    });
    out[kind] = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
  return { imageUrl: out.full, thumbUrl: out.thumb };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

async function main() {
  const [branchId, flag] = process.argv.slice(2);
  const dryRun = flag === "--dry-run";
  if (!branchId) throw new Error("Usage: npx tsx scripts/import-morgan.ts <branchId> [--dry-run]");

  const branch = await db.doc(`branches/${branchId}`).get();
  if (!branch.exists) throw new Error(`Branch ${branchId} not found.`);

  const html = await (await fetch(SOURCE_URL, { headers: { "User-Agent": UA } })).text();
  const rows = parsePage(html);

  // Same code used twice (e.g. a fan in two colours): give each its own code.
  const seen = new Map<string, number>();
  for (const r of rows) {
    const n = (seen.get(r.code) ?? 0) + 1;
    seen.set(r.code, n);
    if (n > 1 || rows.filter((x) => x.code === r.code).length > 1) {
      const colour = r.name.match(/white|brown|black|grey|gray|red|blue|purple|silver/i)?.[0];
      r.code = `${r.code}-${(colour ?? String(n)).toUpperCase().slice(0, 3)}`;
    }
  }

  const existing = await db.collection("products").where("branchId", "==", branchId).get();
  const have = new Set(existing.docs.map((d) => String(d.get("code")).trim().toUpperCase()));
  const todo = rows.filter((r) => !have.has(r.code.toUpperCase()));

  const byCat = new Map<string, number>();
  for (const r of todo) byCat.set(categoryFor(r.name).name, (byCat.get(categoryFor(r.name).name) ?? 0) + 1);
  console.log(`${branch.get("name")}: ${rows.length} on the price list, ${rows.length - todo.length} already in the branch, ${todo.length} to import.`);
  console.log("By category:", [...byCat].map(([k, v]) => `${k} ${v}`).join(", "));
  for (const r of todo.slice(0, 5)) console.log("  e.g.", r.code, "|", r.name, "|", r.qtyText, "→", JSON.stringify(mapRow(r)));
  if (dryRun) return;

  for (const c of [...CATEGORIES, OTHER]) {
    if (todo.some((r) => categoryFor(r.name).id === c.id)) await db.doc(`categories/${c.id}`).set({ name: c.name, sortOrder: c.sortOrder }, { merge: true });
  }

  let done = 0;
  let noPhoto = 0;
  for (const r of todo) {
    let images: { imageUrl: string; thumbUrl: string } | null = null;
    try {
      images = await rehostImage(branchId, r.image);
    } catch (e) {
      console.warn(`  photo failed for ${r.code}: ${(e as Error).message}`);
    }
    if (!images) noPhoto++;
    const m = mapRow(r);
    await db.collection("products").add({
      branchId,
      code: r.code,
      name: r.name,
      description: m.description,
      categoryId: categoryFor(r.name).id,
      qtyPerBox: m.qtyPerBox,
      unitLabel: m.unitLabel,
      boxPrice: m.boxPrice,
      piecePrice: m.piecePrice,
      sellByPiece: m.sellByPiece,
      minBoxes: m.minBoxes,
      minPieces: m.minPieces,
      stockPieces: 0,
      lowStockPieces: null,
      imageUrl: images?.imageUrl ?? null,
      thumbUrl: images?.thumbUrl ?? null,
      tags: r.tags,
      freeGift: null,
      visible: false,
      searchText: `${r.name} ${r.code}`.toLowerCase(),
      supplier: { name: "Morgan Electric", code: r.code, packText: r.qtyText, unitPrice: r.unitPrice, boxPrice: r.boxPrice, importedFrom: SOURCE_URL },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    done++;
    if (done % 20 === 0) console.log(`  ${done}/${todo.length}…`);
    await sleep(150); // be gentle with the supplier's server
  }
  await db.collection("auditLog").add({
    actorUid: "script:import-morgan",
    action: "products.import",
    target: branchId,
    branchId,
    details: { source: SOURCE_URL, created: done, withoutPhoto: noPhoto },
    at: FieldValue.serverTimestamp(),
  });
  console.log(`\nDone: ${done} products added to ${branch.get("name")} (hidden, stock 0). ${noPhoto ? `${noPhoto} without a photo.` : "All with photos."}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
