"use client";

import { useMemo, useState } from "react";
import { collection } from "firebase/firestore";
import { Boxes, Download, PackageSearch, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui/misc";
import { ProductImage } from "@/components/store/bits";
import { downloadCsv } from "@/lib/csv";
import { db } from "@/lib/firebase";
import { availability, cn, ghs, stockLabel, type Availability } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Branch, Product } from "@/lib/types";
import { useAllBranches, useCategories, useSettings } from "./data";
import { StockDialog } from "./StockDialog";

type Filter = "all" | "attention" | "missing" | "prices";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Low or out anywhere" },
  { key: "missing", label: "Not at every branch" },
  { key: "prices", label: "Prices differ" },
];

interface Row {
  code: string;
  name: string;
  categoryId: string | null;
  thumb: string | null;
  qtyPerBox: number;
  unitLabel: string;
  /** Product at each branch, by branch id. */
  byBranch: Map<string, Product>;
  totalPieces: number;
  value: number;
  outCount: number;
  lowCount: number;
  missingCount: number;
  pricesDiffer: boolean;
}

const cellTone: Record<Availability, string> = {
  out: "bg-alert-soft text-alert-ink",
  low: "bg-sun-soft text-sun-ink",
  in: "bg-white text-navy-900",
};

/** Admin: every product (matched by code) with its stock at each branch side by side. */
export function InventoryPanel() {
  const { branches: allBranches, loading: branchesLoading } = useAllBranches();
  const categories = useCategories();
  const settings = useSettings();
  const defaultLow = settings?.defaultLowStockPieces ?? 10;
  const { data: products, loading } = useQueryData<Product>(collection(db, "products"), "inventory:products");

  const [showInactive, setShowInactive] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [search, setSearch] = useState("");
  const [stockId, setStockId] = useState<string | null>(null);

  const branches = useMemo(() => allBranches.filter((b) => b.active || showInactive), [allBranches, showInactive]);
  const inactiveCount = allBranches.filter((b) => !b.active).length;

  const rows = useMemo(() => {
    const shown = new Set(branches.map((b) => b.id));
    const groups = new Map<string, Product[]>();
    for (const p of products) {
      if (!shown.has(p.branchId)) continue;
      const code = p.code.trim().toUpperCase();
      groups.set(code, [...(groups.get(code) ?? []), p]);
    }
    const out: Row[] = [];
    for (const [code, list] of groups) {
      const first = list[0];
      const byBranch = new Map(list.map((p) => [p.branchId, p]));
      const avails = list.map((p) => availability(p, defaultLow));
      const prices = new Set(list.map((p) => p.boxPrice));
      out.push({
        code,
        name: first.name,
        categoryId: first.categoryId,
        thumb: list.find((p) => p.thumbUrl ?? p.imageUrl)?.thumbUrl ?? list.find((p) => p.imageUrl)?.imageUrl ?? null,
        qtyPerBox: first.qtyPerBox,
        unitLabel: first.unitLabel,
        byBranch,
        totalPieces: list.reduce((s, p) => s + Math.max(0, p.stockPieces), 0),
        value: list.reduce((s, p) => s + (Math.max(0, p.stockPieces) * p.boxPrice) / Math.max(1, p.qtyPerBox), 0),
        outCount: avails.filter((a) => a === "out").length,
        lowCount: avails.filter((a) => a === "low").length,
        missingCount: branches.length - byBranch.size,
        pricesDiffer: prices.size > 1,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, branches, defaultLow]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !categoryId || r.categoryId === categoryId)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      .filter((r) =>
        filter === "attention" ? r.outCount + r.lowCount > 0 : filter === "missing" ? r.missingCount > 0 : filter === "prices" ? r.pricesDiffer : true,
      );
  }, [rows, categoryId, search, filter]);

  const counts: Record<Filter, number> = {
    all: rows.length,
    attention: rows.filter((r) => r.outCount + r.lowCount > 0).length,
    missing: rows.filter((r) => r.missingCount > 0).length,
    prices: rows.filter((r) => r.pricesDiffer).length,
  };
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const outCells = rows.reduce((s, r) => s + r.outCount, 0);
  const lowCells = rows.reduce((s, r) => s + r.lowCount, 0);
  const stockProduct = products.find((p) => p.id === stockId) ?? null;
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  function exportCsv() {
    downloadCsv(
      `inventory_${new Date().toISOString().slice(0, 10)}.csv`,
      ["Code", "Product", "Category", ...branches.flatMap((b) => [`${b.name} (pieces)`, `${b.name} (stock)`, `${b.name} price (GHS)`]), "Total (pieces)", "Total", "Stock value (GHS)"],
      filtered.map((r) => [
        r.code,
        r.name,
        r.categoryId ? (catName.get(r.categoryId) ?? "") : "",
        ...branches.flatMap((b) => {
          const p = r.byBranch.get(b.id);
          return p ? [p.stockPieces, stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) || "0", p.boxPrice] : ["", "not stocked", ""];
        }),
        r.totalPieces,
        stockLabel(r.totalPieces, r.qtyPerBox, r.unitLabel) || "0",
        Math.round(r.value),
      ]),
    );
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock of every product at every branch, side by side. Tap a branch's stock to receive or correct it."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Products" value={rows.length} sub={`across ${branches.length} branch${branches.length === 1 ? "" : "es"}`} icon={<Boxes className="size-4" />} />
        <StatCard label="Stock value" value={ghs(Math.round(totalValue))} sub="at selling prices" tone="fresh" />
        <StatCard label="Out of stock" value={outCells} sub="branch listings" tone={outCells ? "alert" : "neutral"} />
        <StatCard label="Low stock" value={lowCells} sub="branch listings" tone={lowCells ? "sun" : "neutral"} />
      </div>

      <div className="mb-3 mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            placeholder="Name or code"
            className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[15px] ring-1 ring-inset ring-line placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-navy-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
          aria-label="Category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="no-scrollbar -mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition",
                filter === f.key ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50",
              )}
            >
              {f.label}
              <span className={cn("ml-1.5 text-[12px]", filter === f.key ? "text-navy-200" : "text-ink-soft")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {inactiveCount > 0 && (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="size-4 accent-navy-700" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive branches
          </label>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-alert-soft ring-1 ring-alert/30" /> Out of stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-sun-soft ring-1 ring-sun/40" /> Low stock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-bold">—</span> Not stocked at that branch
        </span>
      </div>

      {loading || branchesLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageSearch className="size-6" />} title={rows.length ? "Nothing matches" : "No products yet"} body={rows.length ? "Try another filter or search." : "Add products under Products."} />
        </Card>
      ) : (
        <>
          {/* Phones: one card per product, a line per branch. */}
          <div className="space-y-3 md:hidden">
            {filtered.map((r) => (
              <Card key={r.code} className="overflow-hidden">
                <RowHeading row={r} />
                <ul className="divide-y divide-line border-t border-line">
                  {branches.map((b) => (
                    <li key={b.id}>
                      <BranchCell branch={b} product={r.byBranch.get(b.id)} defaultLow={defaultLow} onOpen={setStockId} layout="line" />
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between bg-surface/70 px-4 py-2.5 text-sm">
                  <span className="text-ink-soft">Total · {ghs(Math.round(r.value))}</span>
                  <span className="font-display font-bold">{stockLabel(r.totalPieces, r.qtyPerBox, r.unitLabel) || "0"}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Tablets and computers: the full grid. */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="text-left text-[12px] text-ink-soft">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-60 border-b border-line bg-surface px-4 py-2.5 font-medium">Product</th>
                    {branches.map((b) => (
                      <th key={b.id} className="min-w-32 border-b border-line bg-surface px-3 py-2.5 font-medium">
                        {b.name}
                        {!b.active && <span className="ml-1 font-normal">(inactive)</span>}
                      </th>
                    ))}
                    <th className="min-w-32 border-b border-line bg-surface px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.code} className="group">
                      <td className="sticky left-0 z-10 border-b border-line bg-white p-0 group-hover:bg-surface">
                        <RowHeading row={r} compact />
                      </td>
                      {branches.map((b) => (
                        <td key={b.id} className="border-b border-line p-1.5">
                          <BranchCell branch={b} product={r.byBranch.get(b.id)} defaultLow={defaultLow} onOpen={setStockId} layout="cell" />
                        </td>
                      ))}
                      <td className="border-b border-line px-4 py-2 text-right">
                        <span className="block font-display font-bold">{stockLabel(r.totalPieces, r.qtyPerBox, r.unitLabel) || "0"}</span>
                        <span className="text-[12px] text-ink-soft">{ghs(Math.round(r.value))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <StockDialog product={stockProduct} onClose={() => setStockId(null)} />
    </div>
  );
}

function RowHeading({ row, compact }: { row: Row; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", compact ? "px-4 py-2" : "px-4 py-3")}>
      <ProductImage src={row.thumb} alt={row.name} className={cn("shrink-0 rounded-lg", compact ? "size-10" : "size-12")} />
      <div className="min-w-0">
        <p className="truncate font-medium text-navy-900">{row.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-soft">
          {row.code}
          {row.pricesDiffer && <Badge tone="navy">Prices differ</Badge>}
          {row.missingCount > 0 && !compact && <Badge tone="neutral">Not at {row.missingCount} branch{row.missingCount === 1 ? "" : "es"}</Badge>}
        </p>
      </div>
    </div>
  );
}

function BranchCell({
  branch,
  product,
  defaultLow,
  onOpen,
  layout,
}: {
  branch: Branch;
  product: Product | undefined;
  defaultLow: number;
  onOpen: (productId: string) => void;
  layout: "cell" | "line";
}) {
  if (!product) {
    return layout === "cell" ? (
      <span className="flex min-h-12 items-center justify-center rounded-lg text-ink-soft/60" title={`Not stocked at ${branch.name}`}>
        —
      </span>
    ) : (
      <div className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm">
        <span className="text-ink-soft">{branch.name}</span>
        <span className="text-[13px] text-ink-soft/70">Not stocked</span>
      </div>
    );
  }
  const a = availability(product, defaultLow);
  const label = stockLabel(product.stockPieces, product.qtyPerBox, product.unitLabel) || "0";
  const hint = a === "out" ? "Out of stock" : a === "low" ? "Low" : null;

  if (layout === "cell") {
    return (
      <button
        type="button"
        onClick={() => onOpen(product.id)}
        className={cn(
          "block min-h-12 w-full rounded-lg px-2.5 py-1.5 text-left ring-1 ring-inset ring-transparent transition hover:ring-navy-300",
          cellTone[a],
          !product.visible && "opacity-60",
        )}
        title={`${branch.name}: ${label}. Tap to change stock.`}
      >
        <span className="block font-medium">{label}</span>
        <span className="block text-[11px] opacity-80">
          {hint ? `${hint} · ` : ""}
          {ghs(product.boxPrice)}
          {!product.visible && " · hidden"}
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(product.id)} className={cn("flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm", cellTone[a])}>
      <span className="min-w-0">
        <span className="block truncate">{branch.name}</span>
        <span className="block text-[12px] opacity-80">
          {ghs(product.boxPrice)}
          {!product.visible && " · hidden"}
        </span>
      </span>
      <span className="text-right">
        <span className="block font-display font-bold">{label}</span>
        {hint && <span className="block text-[12px] font-medium">{hint}</span>}
      </span>
    </button>
  );
}
