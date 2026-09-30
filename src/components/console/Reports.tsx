"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from "firebase/firestore";
import { Download, Printer, TrendingDown, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Spinner, StatCard } from "@/components/ui/misc";
import { downloadCsv } from "@/lib/csv";
import { db } from "@/lib/firebase";
import { businessDate, cn, ghs, stockLabel } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { DailySummary, Product, Sale } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches } from "./data";

type Range = 7 | 30 | 90;
const MAX_SALES = 5000;

function datesBack(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(businessDate(d));
  }
  return out;
}

/** One-off read (reports don't need to be live, and this keeps reads cheap). */
function useSalesSince(branchId: string, start: string) {
  const [state, setState] = useState<{ sales: Sale[]; loading: boolean; capped: boolean }>({ sales: [], loading: true, capped: false });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    const from = Timestamp.fromDate(new Date(`${start}T00:00:00Z`));
    const ref = collection(db, "sales");
    const q =
      branchId === "all"
        ? query(ref, where("createdAt", ">=", from), orderBy("createdAt", "desc"), limit(MAX_SALES))
        : query(ref, where("branchId", "==", branchId), where("createdAt", ">=", from), orderBy("createdAt", "desc"), limit(MAX_SALES));
    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        setState({ sales: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sale), loading: false, capped: snap.size >= MAX_SALES });
      })
      .catch((e) => {
        console.error("[reports:sales]", e);
        if (!cancelled) setState({ sales: [], loading: false, capped: false });
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, start]);
  return state;
}

interface ProductStat {
  key: string;
  code: string;
  name: string;
  pieces: number;
  revenue: number;
  branches: Set<string>;
}

export function ReportsPanel({ fixedBranchId }: { fixedBranchId: string | null }) {
  const { branches, byId } = useAllBranches();
  const [scopePicked, setScope] = useState("all");
  const scope = fixedBranchId ?? scopePicked;
  const [range, setRange] = useState<Range>(30);
  const dates = useMemo(() => datesBack(range), [range]);
  const start = dates[0];

  const summaries = useQueryData<DailySummary>(
    scope === "all"
      ? query(collection(db, "dailySummaries"), where("date", ">=", start))
      : query(collection(db, "dailySummaries"), where("branchId", "==", scope), where("date", ">=", start)),
    `reports:sum:${scope}:${start}`,
  ).data;

  const products = useQueryData<Product>(
    scope === "all" ? collection(db, "products") : query(collection(db, "products"), where("branchId", "==", scope)),
    `reports:products:${scope}`,
  ).data;

  const { sales, loading, capped } = useSalesSince(scope, start);
  const valid = useMemo(() => sales.filter((s) => !s.voided), [sales]);

  // ---- Totals ----
  const total = summaries.reduce((a, s) => a + (s.salesTotal ?? 0), 0);
  const count = summaries.reduce((a, s) => a + (s.salesCount ?? 0), 0);
  const walkin = summaries.reduce((a, s) => a + (s.walkinTotal ?? 0), 0);
  const voids = summaries.reduce((a, s) => a + (s.voidTotal ?? 0), 0);

  // ---- By day ----
  const byDay = dates.map((date) => {
    const list = summaries.filter((s) => s.date === date);
    return { date, total: list.reduce((a, s) => a + (s.salesTotal ?? 0), 0), count: list.reduce((a, s) => a + (s.salesCount ?? 0), 0) };
  });
  const maxDay = Math.max(1, ...byDay.map((d) => d.total));

  // ---- By branch ----
  const byBranch = branches
    .map((b) => {
      const list = summaries.filter((s) => s.branchId === b.id);
      const stock = products.filter((p) => p.branchId === b.id).reduce((a, p) => a + (p.stockPieces * p.boxPrice) / Math.max(1, p.qtyPerBox), 0);
      return {
        branch: b,
        total: list.reduce((a, s) => a + (s.salesTotal ?? 0), 0),
        count: list.reduce((a, s) => a + (s.salesCount ?? 0), 0),
        walkin: list.reduce((a, s) => a + (s.walkinTotal ?? 0), 0),
        orders: list.reduce((a, s) => a + (s.orderTotal ?? 0), 0),
        stock,
      };
    })
    .filter((r) => scope === "all" || r.branch.id === scope)
    .sort((a, b) => b.total - a.total);

  // ---- By product (matched on code across branches) ----
  const productStats = useMemo(() => {
    const m = new Map<string, ProductStat>();
    for (const s of valid) {
      for (const l of s.items) {
        const key = scope === "all" ? l.code : l.productId;
        const cur = m.get(key) ?? { key, code: l.code, name: l.name, pieces: 0, revenue: 0, branches: new Set<string>() };
        cur.pieces += l.pieces;
        cur.revenue += l.lineTotal;
        cur.branches.add(s.branchId);
        m.set(key, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [valid, scope]);

  const soldKeys = new Set(productStats.map((p) => p.key));
  const slowMovers = products
    .filter((p) => p.stockPieces > 0 && !soldKeys.has(scope === "all" ? p.code : p.id))
    .map((p) => ({ p, value: (p.stockPieces * p.boxPrice) / Math.max(1, p.qtyPerBox) }))
    .sort((a, b) => b.value - a.value);

  const stockValue = products.reduce((a, p) => a + (p.stockPieces * p.boxPrice) / Math.max(1, p.qtyPerBox), 0);
  const scopeName = scope === "all" ? "All branches" : (byId.get(scope)?.name ?? "");
  const fileTag = `${scope === "all" ? "all" : (byId.get(scope)?.slug ?? scope)}_${start}_to_${dates[dates.length - 1]}`;

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`${scopeName} · ${new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – today`}
        actions={
          <>
            {!fixedBranchId && <BranchSelect branches={branches} value={scope} onChange={setScope} />}
            <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
              <Printer className="size-4" /> Print / PDF
            </Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1.5 print:hidden">
        {([7, 30, 90] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={cn("h-9 rounded-full px-3.5 text-sm font-medium", range === r ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50")}
          >
            {r} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales" value={ghs(total)} sub={`${count} sale(s)`} tone="fresh" />
        <StatCard label="Average sale" value={ghs(count ? Math.round((total / count) * 100) / 100 : 0)} sub={`Walk-in ${ghs(walkin)}`} />
        <StatCard label="Stock value" value={ghs(Math.round(stockValue))} sub="at box prices" />
        <StatCard label="Voided" value={ghs(voids)} tone={voids ? "alert" : "neutral"} />
      </div>

      {/* Sales by day */}
      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Sales by day</h2>
          <Button
            variant="ghost"
            size="sm"
            className="print:hidden"
            onClick={() => downloadCsv(`sales-by-day_${fileTag}.csv`, ["Date", "Sales (GHS)", "Number of sales"], byDay.map((d) => [d.date, d.total, d.count]))}
          >
            <Download className="size-4" /> CSV
          </Button>
        </div>
        <div className="mt-4 flex h-40 items-end gap-[3px]" role="img" aria-label="Sales by day">
          {byDay.map((d) => (
            <div
              key={d.date}
              className={cn("flex-1 rounded-t", d.date === businessDate() ? "bg-brand-orange" : "bg-navy-300")}
              style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }}
              title={`${d.date}: ${ghs(d.total)} (${d.count})`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-ink-soft">
          <span>{byDay[0]?.date}</span>
          <span>Today</span>
        </div>
      </Card>

      {/* By branch */}
      {scope === "all" && (
        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="font-display text-lg font-bold">By branch</h2>
            <Button
              variant="ghost"
              size="sm"
              className="print:hidden"
              onClick={() =>
                downloadCsv(
                  `sales-by-branch_${fileTag}.csv`,
                  ["Branch", "Sales (GHS)", "Number of sales", "Walk-in (GHS)", "WhatsApp orders (GHS)", "Stock value (GHS)"],
                  byBranch.map((r) => [r.branch.name, r.total, r.count, r.walkin, r.orders, Math.round(r.stock)]),
                )
              }
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-[12px] text-ink-soft">
                <tr className="border-b border-line">
                  <th className="px-5 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 text-right font-medium">Sales</th>
                  <th className="px-3 py-2 text-right font-medium">Count</th>
                  <th className="px-3 py-2 text-right font-medium">Walk-in</th>
                  <th className="px-3 py-2 text-right font-medium">Orders</th>
                  <th className="px-5 py-2 text-right font-medium">Stock value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byBranch.map((r) => (
                  <tr key={r.branch.id}>
                    <td className="px-5 py-2.5 font-medium">{r.branch.name}</td>
                    <td className="px-3 py-2.5 text-right font-display font-bold">{ghs(r.total)}</td>
                    <td className="px-3 py-2.5 text-right">{r.count}</td>
                    <td className="px-3 py-2.5 text-right">{ghs(r.walkin)}</td>
                    <td className="px-3 py-2.5 text-right">{ghs(r.orders)}</td>
                    <td className="px-5 py-2.5 text-right">{ghs(Math.round(r.stock))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Best sellers */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Trophy className="size-5 text-sun" /> Best sellers
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="print:hidden"
              disabled={!productStats.length}
              onClick={() =>
                downloadCsv(
                  `sales-by-product_${fileTag}.csv`,
                  ["Code", "Product", "Pieces sold", "Revenue (GHS)", "Branches"],
                  productStats.map((p) => [p.code, p.name, p.pieces, Math.round(p.revenue * 100) / 100, [...p.branches].map((b) => byId.get(b)?.name ?? b).join("; ")]),
                )
              }
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
          {loading ? (
            <Spinner />
          ) : productStats.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-soft">No sales in this period.</p>
          ) : (
            <ol className="mt-2 divide-y divide-line">
              {productStats.slice(0, 10).map((p, i) => (
                <li key={p.key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="w-5 text-center font-display font-bold text-ink-soft">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-[12px] text-ink-soft">
                      {p.code} · {p.pieces.toLocaleString()} pcs
                    </span>
                  </span>
                  <span className="font-display font-bold">{ghs(Math.round(p.revenue))}</span>
                </li>
              ))}
            </ol>
          )}
          {capped && <p className="px-5 pb-3 text-[12px] text-sun-ink">Showing the latest {MAX_SALES.toLocaleString()} sales. Choose a shorter period for exact product totals.</p>}
        </Card>

        {/* Slow movers */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <TrendingDown className="size-5 text-alert" /> Not selling
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="print:hidden"
              disabled={!slowMovers.length}
              onClick={() =>
                downloadCsv(
                  `not-selling_${fileTag}.csv`,
                  ["Code", "Product", "Branch", "In stock (pieces)", "Stock value (GHS)"],
                  slowMovers.map(({ p, value }) => [p.code, p.name, byId.get(p.branchId)?.name ?? "", p.stockPieces, Math.round(value)]),
                )
              }
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
          <p className="px-5 text-[13px] text-ink-soft">In stock but no sales in the last {range} days, biggest value first.</p>
          {loading ? (
            <Spinner />
          ) : slowMovers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-soft">Everything in stock has sold at least once.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {slowMovers.slice(0, 10).map(({ p, value }) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-[12px] text-ink-soft">
                      {p.code}
                      {scope === "all" ? ` · ${byId.get(p.branchId)?.name ?? ""}` : ""} · {stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel)}
                    </span>
                  </span>
                  <span className="font-display font-bold">{ghs(Math.round(value))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 flex justify-end print:hidden">
        <Button
          variant="secondary"
          onClick={() =>
            downloadCsv(
              `stock_${fileTag}.csv`,
              ["Branch", "Code", "Product", "Pieces per box", "Stock (pieces)", "Stock", "Box price (GHS)", "Stock value (GHS)"],
              products
                .slice()
                .sort((a, b) => (byId.get(a.branchId)?.name ?? "").localeCompare(byId.get(b.branchId)?.name ?? "") || a.name.localeCompare(b.name))
                .map((p) => [
                  byId.get(p.branchId)?.name ?? "",
                  p.code,
                  p.name,
                  p.qtyPerBox,
                  p.stockPieces,
                  stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) || "0",
                  p.boxPrice,
                  Math.round((p.stockPieces * p.boxPrice) / Math.max(1, p.qtyPerBox)),
                ]),
            )
          }
        >
          <Download className="size-4" /> Stock list (CSV)
        </Button>
      </div>
    </div>
  );
}
