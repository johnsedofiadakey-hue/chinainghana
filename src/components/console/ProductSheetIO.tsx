"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, type ImportRow } from "@/lib/api";
import { downloadBlob } from "@/lib/csv";
import { cn, ghs } from "@/lib/format";
import type { Category, Product } from "@/lib/types";

/** Spreadsheet columns. Export and import use the same layout so files round-trip. */
const COLUMNS: { key: keyof ImportRow; title: string; kind: "text" | "int" | "money" | "bool" | "date"; aliases?: string[] }[] = [
  { key: "code", title: "Code", kind: "text", aliases: ["product code", "item code", "sku"] },
  { key: "name", title: "Name", kind: "text", aliases: ["product", "product name", "item", "description of goods"] },
  { key: "category", title: "Category", kind: "text" },
  { key: "description", title: "Description", kind: "text", aliases: ["details"] },
  { key: "qtyPerBox", title: "Pieces per box", kind: "int", aliases: ["qty per box", "quantity per box", "pcs per box", "qty", "pack size"] },
  { key: "unitLabel", title: "Unit", kind: "text", aliases: ["unit name"] },
  { key: "boxPrice", title: "Box price", kind: "money", aliases: ["price per box", "box price (ghs)", "wholesale price", "price"] },
  { key: "piecePrice", title: "Piece price", kind: "money", aliases: ["price per piece", "piece price (ghs)", "unit price", "retail price"] },
  { key: "minBoxes", title: "Min boxes", kind: "int", aliases: ["minimum boxes"] },
  { key: "minPieces", title: "Min pieces", kind: "int", aliases: ["minimum pieces"] },
  { key: "lowStockPieces", title: "Low stock alert", kind: "int", aliases: ["low stock", "alert level", "reorder level"] },
  { key: "visible", title: "Show in shop", kind: "bool", aliases: ["visible", "show"] },
  { key: "hot", title: "Hot", kind: "bool", aliases: ["hot deal"] },
  { key: "isNew", title: "New", kind: "bool", aliases: ["new arrival"] },
  { key: "stockBoxes", title: "Stock boxes", kind: "int", aliases: ["boxes in stock", "boxes"] },
  { key: "stockPieces", title: "Stock pieces", kind: "int", aliases: ["loose pieces", "pieces in stock", "extra pieces"] },
  { key: "giftName", title: "Free gift", kind: "text", aliases: ["gift", "free item", "freebie"] },
  { key: "giftStartsAt", title: "Gift from", kind: "date", aliases: ["promo start", "promo starts", "gift start"] },
  { key: "giftEndsAt", title: "Gift until", kind: "date", aliases: ["promo end", "promo ends", "gift end"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportProducts(products: Product[], categories: Category[], branchName: string): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const header = COLUMNS.map((c) => ({ value: c.title, fontWeight: "bold" as const, backgroundColor: "#EEF2FB" }));
  const rows = products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const values: Record<keyof ImportRow, string | number | boolean | null> = {
        code: p.code,
        name: p.name,
        category: p.categoryId ? (catName.get(p.categoryId) ?? "") : "",
        description: p.description ?? "",
        qtyPerBox: p.qtyPerBox,
        unitLabel: p.unitLabel,
        boxPrice: p.boxPrice,
        piecePrice: p.sellByPiece ? p.piecePrice : null,
        minBoxes: p.minBoxes || 1,
        minPieces: p.minPieces || 1,
        lowStockPieces: p.lowStockPieces,
        visible: p.visible ? "Yes" : "No",
        hot: p.tags?.includes("hot") ? "Yes" : "No",
        isNew: p.tags?.includes("new") ? "Yes" : "No",
        stockBoxes: Math.floor(p.stockPieces / Math.max(1, p.qtyPerBox)),
        stockPieces: p.stockPieces % Math.max(1, p.qtyPerBox),
        giftName: p.freeGift?.name ?? null,
        giftStartsAt: p.freeGift?.startsAt ?? null,
        giftEndsAt: p.freeGift?.endsAt ?? null,
      };
      return COLUMNS.map((c) => {
        const v = values[c.key];
        if (v == null || v === "") return null;
        return typeof v === "number" ? { value: v, type: Number } : { value: String(v), type: String };
      });
    });
  const blob = await writeXlsxFile([header, ...rows], {
    sheet: "Products",
    columns: COLUMNS.map((c) => ({ width: c.key === "name" || c.key === "description" ? 36 : c.key === "category" ? 20 : 14 })),
    stickyRowsCount: 1,
  }).toBlob();
  const safe = branchName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  downloadBlob(`products_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

type Cell = string | number | boolean | Date | null | undefined;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readRows(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    return parseCsv((await file.text()).replace(/^﻿/, ""));
  }
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as unknown as Cell[][];
}

interface Parsed {
  rows: { line: number; row: ImportRow | null; errors: string[] }[];
  unknownHeaders: string[];
  missingHeaders: string[];
}

function toNumber(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/gh₵|ghs|ghc|₵|,|\s/gi, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Excel dates, "2026-10-26", "26/10/2026" or "26 Oct 2026" → "2026-10-26". */
function toDateString(v: Cell): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day/month/year (Ghana)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const parsed = new Date(`${s} UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toBool(v: Cell): boolean | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["yes", "y", "true", "1", "x", "✓"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return null;
}

function parseRows(data: Cell[][]): Parsed {
  // First row that has a "code" or "name"-like cell is the header.
  const headerIdx = data.findIndex((r) => r.some((c) => typeof c === "string" && ["code", "name", "product"].includes(norm(c))));
  if (headerIdx < 0) return { rows: [], unknownHeaders: [], missingHeaders: ["Code", "Name"] };
  const header = data[headerIdx].map((c) => norm(String(c ?? "")));

  const colIndex = new Map<keyof ImportRow, number>();
  const unknownHeaders: string[] = [];
  header.forEach((h, i) => {
    if (!h) return;
    const col = COLUMNS.find((c) => norm(c.title) === h || c.aliases?.some((a) => norm(a) === h));
    if (col && !colIndex.has(col.key)) colIndex.set(col.key, i);
    else if (!col) unknownHeaders.push(String(data[headerIdx][i]));
  });
  const missingHeaders = (["code", "name"] as const).filter((k) => !colIndex.has(k)).map((k) => COLUMNS.find((c) => c.key === k)!.title);

  const rows: Parsed["rows"] = [];
  data.slice(headerIdx + 1).forEach((r, i) => {
    if (!r.some((c) => c != null && String(c).trim() !== "")) return;
    const errors: string[] = [];
    const out: Record<string, unknown> = {};
    for (const col of COLUMNS) {
      const idx = colIndex.get(col.key);
      if (idx == null) continue;
      const raw = r[idx];
      if (raw == null || String(raw).trim() === "") continue;
      if (col.kind === "text") out[col.key] = String(raw).trim();
      else if (col.kind === "date") {
        const d = toDateString(raw);
        if (!d) errors.push(`${col.title}: use a date like 2026-10-26`);
        else out[col.key] = d;
      }
      else if (col.kind === "bool") {
        const b = toBool(raw);
        if (b == null) errors.push(`${col.title}: use Yes or No`);
        else out[col.key] = b;
      } else {
        const n = toNumber(raw);
        if (n == null) continue;
        if (Number.isNaN(n) || n < 0) errors.push(`${col.title}: "${raw}" isn't a number`);
        else if (col.kind === "int" && !Number.isInteger(n)) errors.push(`${col.title}: whole numbers only`);
        else out[col.key] = col.kind === "money" ? Math.round(n * 100) / 100 : n;
      }
    }
    if (!out.code) errors.push("Code is empty");
    if (!out.name || String(out.name).length < 2) errors.push("Name is empty");
    if (out.qtyPerBox === 0) errors.push("Pieces per box must be 1 or more");
    rows.push({ line: headerIdx + i + 2, row: errors.length ? null : (out as unknown as ImportRow), errors });
  });
  return { rows, unknownHeaders, missingHeaders };
}

export function ImportDialog({
  open,
  onClose,
  branchId,
  branchName,
  products,
}: {
  open: boolean;
  onClose: () => void;
  branchId: string;
  branchName: string;
  products: Product[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  const existing = new Set(products.map((p) => p.code.toUpperCase()));
  const valid = parsed?.rows.filter((r) => r.row) ?? [];
  const bad = parsed?.rows.filter((r) => !r.row) ?? [];
  const isIncompleteNew = (r: ImportRow) => !existing.has(r.code.toUpperCase()) && (r.qtyPerBox == null || r.boxPrice == null);
  const newIncomplete = valid.filter((r) => isIncompleteNew(r.row!));
  const good = valid.filter((r) => !isIncompleteNew(r.row!));
  const newRows = good.filter((r) => !existing.has(r.row!.code.toUpperCase()));
  const withStock = good.filter((r) => r.row!.stockBoxes != null || r.row!.stockPieces != null);

  function reset() {
    setParsed(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setFileName(file.name);
    try {
      setParsed(parseRows(await readRows(file)));
    } catch (e) {
      console.error(e);
      toast.error("Couldn't read that file. Save it as .xlsx or .csv and try again.");
      reset();
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    if (!good.length) return;
    setBusy(true);
    try {
      const res = await api.importProducts({ branchId, rows: good.map((r) => r.row!) });
      const parts = [`${res.created} added`, `${res.updated} updated`];
      if (res.stockChanged) parts.push(`${res.stockChanged} stock level(s) set`);
      if (res.errors.length) parts.push(`${res.errors.length} skipped`);
      toast.success(`Import done · ${parts.join(" · ")}`);
      if (res.errors.length) toast.error(res.errors.slice(0, 3).map((e) => `${e.code}: ${e.message}`).join(" "));
      reset();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import products"
      description={`${branchName} · Excel (.xlsx) or CSV`}
      size="lg"
      footer={
        parsed ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button className="ml-auto" loading={busy} disabled={!good.length || parsed.missingHeaders.length > 0} onClick={runImport}>
              Import {good.length} product{good.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {!parsed ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-navy-200 bg-navy-50/50 px-6 py-10 text-center hover:bg-navy-50"
            disabled={reading}
          >
            <FileSpreadsheet className="size-10 text-navy-500" />
            <span className="font-display text-lg font-bold">{reading ? `Reading ${fileName}…` : "Choose a spreadsheet"}</span>
            <span className="text-sm text-ink-soft">The first sheet is used. Products are matched by code: existing codes are updated, new codes are added.</span>
          </button>
          <div className="rounded-2xl bg-surface p-4 text-sm">
            <p className="font-medium">Columns</p>
            <p className="mt-1 text-ink-soft">
              <strong>Code</strong> and <strong>Name</strong> are required. New products also need <strong>Pieces per box</strong> (1 for single items) and <strong>Box price</strong>. Other columns are
              optional: {COLUMNS.slice(2).map((c) => c.title).join(", ")}.
            </p>
            <p className="mt-2 text-ink-soft">Empty cells leave the current value unchanged. Stock columns set the stock level (like a stock take); leave them empty to keep stock as it is.</p>
            <p className="mt-2 text-ink-soft">Promos: put the gift in <strong>Free gift</strong> with optional <strong>Gift from</strong> / <strong>Gift until</strong> dates. Type <strong>none</strong> to remove a gift.</p>
            <p className="mt-2 text-ink-soft">Tip: use <strong>Export</strong> on the product list to get a file in the right layout.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="navy">{fileName}</Badge>
            <Badge tone="fresh">{newRows.length} new</Badge>
            <Badge tone="navy">{good.length - newRows.length} to update</Badge>
            {withStock.length > 0 && <Badge tone="sun">{withStock.length} with stock</Badge>}
            {bad.length > 0 && <Badge tone="alert">{bad.length} with errors (skipped)</Badge>}
          </div>

          {parsed.missingHeaders.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-alert-soft p-3 text-sm text-alert-ink">
              <AlertTriangle className="size-4 shrink-0" /> Missing column(s): {parsed.missingHeaders.join(", ")}. Check the header row.
            </p>
          )}
          {parsed.unknownHeaders.length > 0 && <p className="text-[13px] text-ink-soft">Ignored columns: {parsed.unknownHeaders.join(", ")}</p>}
          {newIncomplete.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-sun-soft p-3 text-sm text-sun-ink">
              <AlertTriangle className="size-4 shrink-0" /> {newIncomplete.length} new product(s) have no pieces per box or box price and will be skipped:{" "}
              {newIncomplete.slice(0, 5).map((r) => r.row!.code).join(", ")}
              {newIncomplete.length > 5 ? "…" : ""}
            </p>
          )}

          <div className="max-h-[45vh] overflow-auto rounded-xl ring-1 ring-inset ring-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface text-left text-[12px] text-ink-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 text-right font-medium">Box price</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parsed.rows.slice(0, 300).map((r) => (
                  <tr key={r.line} className={cn(!r.row && "bg-alert-soft/50")}>
                    <td className="px-3 py-2 text-ink-soft">{r.line}</td>
                    <td className="px-3 py-2 font-medium">{r.row?.code ?? "—"}</td>
                    <td className="px-3 py-2">{r.row?.name ?? ""}</td>
                    <td className="px-3 py-2 text-right">{r.row?.boxPrice != null ? ghs(r.row.boxPrice) : ""}</td>
                    <td className="px-3 py-2">
                      {!r.row ? (
                        <span className="text-[12px] text-alert-ink">{r.errors.join("; ")}</span>
                      ) : isIncompleteNew(r.row) ? (
                        <Badge tone="sun">Skipped</Badge>
                      ) : existing.has(r.row.code.toUpperCase()) ? (
                        <Badge tone="navy">Update</Badge>
                      ) : (
                        <Badge tone="fresh">New</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 300 && <p className="text-[13px] text-ink-soft">Showing the first 300 of {parsed.rows.length} rows.</p>}
        </div>
      )}
    </Modal>
  );
}

export function SheetButtons({ onImport, onExport, exporting }: { onImport: () => void; onExport: () => void; exporting: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onImport}>
        <Upload className="size-4" /> Import
      </Button>
      <Button variant="secondary" loading={exporting} onClick={onExport}>
        <Download className="size-4" /> Export
      </Button>
    </>
  );
}
