"use client";

import { useMemo } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { AlertTriangle, ArrowRight, BarChart3, Banknote, Boxes, ClipboardCheck, Clock, MoonStar, PackageX, Receipt, ShoppingCart, Store } from "lucide-react";
import { PushPrompt } from "@/components/pwa/PushToggle";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/misc";
import { db } from "@/lib/firebase";
import { businessDate, ghs, timeAgo } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { DailySummary, Order, StockAlert, StockTake } from "@/lib/types";
import { useAllBranches } from "./data";

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - i);
    out.push(businessDate(x));
  }
  return out;
}

export function Dashboard({ branchId, basePath }: { branchId: string | null; basePath: "/admin" | "/manager" }) {
  const today = businessDate();
  const week = useMemo(() => lastNDates(7), []);
  const { branches, byId } = useAllBranches();
  const scoped = !!branchId;

  const summaries = useQueryData<DailySummary>(
    scoped
      ? query(collection(db, "dailySummaries"), where("branchId", "==", branchId), where("date", ">=", week[0]))
      : query(collection(db, "dailySummaries"), where("date", ">=", week[0])),
    `dash:summaries:${branchId ?? "all"}:${week[0]}`,
  ).data;

  const newOrders = useQueryData<Order>(
    scoped
      ? query(collection(db, "orders"), where("branchId", "==", branchId), where("status", "in", ["new", "confirmed"]))
      : query(collection(db, "orders"), where("status", "in", ["new", "confirmed"])),
    `dash:openOrders:${branchId ?? "all"}`,
  ).data;

  const alerts = useQueryData<StockAlert>(
    scoped
      ? query(collection(db, "alerts"), where("branchId", "==", branchId), where("resolved", "==", false))
      : query(collection(db, "alerts"), where("resolved", "==", false)),
    `dash:alerts:${branchId ?? "all"}`,
  ).data;

  const pendingTakes = useQueryData<StockTake>(
    scoped
      ? query(collection(db, "stockTakes"), where("branchId", "==", branchId), where("status", "==", "submitted"))
      : query(collection(db, "stockTakes"), where("status", "==", "submitted")),
    `dash:takes:${branchId ?? "all"}`,
  ).data;

  const todays = summaries.filter((s) => s.date === today);
  const sum = (list: DailySummary[], k: keyof DailySummary) => list.reduce((acc, s) => acc + ((s[k] as number | undefined) ?? 0), 0);

  const trend = week.map((date) => ({ date, total: sum(summaries.filter((s) => s.date === date), "salesTotal") }));
  const maxTrend = Math.max(1, ...trend.map((t) => t.total));

  const perBranch = useMemo(
    () =>
      branches
        .filter((b) => (scoped ? b.id === branchId : b.active))
        .map((b) => {
          const s = todays.find((x) => x.branchId === b.id);
          return {
            branch: b,
            sales: s?.salesTotal ?? 0,
            count: s?.salesCount ?? 0,
            closed: !!s?.closed,
            open: newOrders.filter((o) => o.branchId === b.id).length,
            alerts: alerts.filter((a) => a.branchId === b.id).length,
          };
        })
        .sort((a, b) => b.sales - a.sales),
    [branches, todays, newOrders, alerts, scoped, branchId],
  );
  const maxBranchSales = Math.max(1, ...perBranch.map((p) => p.sales));

  const sortedOrders = [...newOrders].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));

  return (
    <div>
      <PageHeader
        title={scoped ? "Today" : "Dashboard"}
        description={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        actions={
          scoped ? (
            <Link href={`${basePath}/sales/new`}>
              <Button variant="cta">
                <Receipt className="size-4" /> Record sale
              </Button>
            </Link>
          ) : undefined
        }
      />

      <PushPrompt />

      {scoped ? (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {[
            { href: `${basePath}/close`, label: todays[0]?.closed ? "Day closed ✓" : "Close the day", icon: MoonStar },
            { href: `${basePath}/stock-take`, label: pendingTakes.length ? "Stock take (waiting)" : "Stock take", icon: ClipboardCheck },
            { href: `${basePath}/reports`, label: "Reports", icon: BarChart3 },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50">
              <l.icon className="size-4 text-navy-500" /> {l.label}
            </Link>
          ))}
        </div>
      ) : (
        pendingTakes.length > 0 && (
          <Link href="/admin/stock-takes" className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-orange-soft px-4 py-3 text-sm text-brand-orange-dark hover:brightness-95">
            <ClipboardCheck className="size-5 shrink-0" />
            <span className="flex-1 font-medium">
              {pendingTakes.length} stock take{pendingTakes.length === 1 ? "" : "s"} waiting for your approval
            </span>
            <ArrowRight className="size-4" />
          </Link>
        )
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales today" value={ghs(sum(todays, "salesTotal"))} sub={`${sum(todays, "salesCount")} sale(s)`} icon={<Banknote className="size-4" />} tone="fresh" />
        <StatCard
          label="Orders to handle"
          value={newOrders.length}
          sub={`${newOrders.filter((o) => o.status === "new").length} new`}
          icon={<ShoppingCart className="size-4" />}
          tone="orange"
        />
        <StatCard label="Items sold today" value={sum(todays, "piecesSold").toLocaleString()} sub="pieces" icon={<Boxes className="size-4" />} />
        <StatCard
          label="Stock alerts"
          value={alerts.length}
          sub={`${alerts.filter((a) => a.type === "out_of_stock").length} out of stock`}
          icon={<AlertTriangle className="size-4" />}
          tone={alerts.length ? "alert" : "neutral"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* Sales trend */}
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Last 7 days</h2>
            <p className="text-sm text-ink-soft">{ghs(trend.reduce((s, t) => s + t.total, 0))}</p>
          </div>
          <div className="mt-5 flex h-40 items-end gap-2" role="img" aria-label="Sales for the last 7 days">
            {trend.map((t) => (
              <div key={t.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium text-ink-soft">{t.total ? ghs(t.total).replace("GH₵", "") : ""}</span>
                <div
                  className={`w-full rounded-t-lg ${t.date === today ? "bg-brand-orange" : "bg-navy-200"}`}
                  style={{ height: `${Math.max(4, (t.total / maxTrend) * 120)}px` }}
                  title={`${t.date}: ${ghs(t.total)}`}
                />
                <span className="text-[11px] text-ink-soft">
                  {new Date(`${t.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Per-branch today */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">{scoped ? "Branch today" : "Branches today"}</h2>
          <ul className="mt-3 space-y-3">
            {perBranch.map((p) => (
              <li key={p.branch.id}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Store className="size-4 shrink-0 text-navy-500" />
                    <span className="truncate font-medium">{p.branch.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {p.closed && <Badge tone="fresh">Closed</Badge>}
                    <span className="font-display font-bold">{ghs(p.sales)}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-50">
                  <div className="h-full rounded-full bg-fresh" style={{ width: `${(p.sales / maxBranchSales) * 100}%` }} />
                </div>
                <div className="mt-1 flex gap-3 text-[12px] text-ink-soft">
                  <span>{p.count} sales</span>
                  <span>{p.open} open orders</span>
                  {p.alerts > 0 && <span className="text-alert-ink">{p.alerts} stock alerts</span>}
                </div>
              </li>
            ))}
            {perBranch.length === 0 && <p className="text-sm text-ink-soft">No branches yet.</p>}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Open orders</h2>
            <Link href={`${basePath}/orders`} className="-my-2 -mr-2 flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-navy-600 hover:underline">
              All orders <ArrowRight className="size-4" />
            </Link>
          </div>
          {sortedOrders.length === 0 ? (
            <EmptyState icon={<ShoppingCart className="size-6" />} title="No open orders" body="New WhatsApp orders appear here instantly." className="py-8" />
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {sortedOrders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`${basePath}/orders?open=${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        #{o.orderNo} · {o.customer.name}
                      </p>
                      <p className="flex items-center gap-1 text-[12px] text-ink-soft">
                        <Clock className="size-3" /> {timeAgo(o.createdAt)}
                        {!scoped && ` · ${byId.get(o.branchId)?.name ?? o.branchName}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold">{ghs(o.total)}</p>
                      <Badge tone={o.status === "new" ? "orange" : "navy"}>{o.status === "new" ? "New" : "Confirmed"}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Stock alerts</h2>
            <Link href={`${basePath}/products?filter=low`} className="-my-2 -mr-2 flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-navy-600 hover:underline">
              Products <ArrowRight className="size-4" />
            </Link>
          </div>
          {alerts.length === 0 ? (
            <EmptyState icon={<Boxes className="size-6" />} title="Stock looks healthy" body="Low and out-of-stock products will show here." className="py-8" />
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${a.type === "out_of_stock" ? "bg-alert-soft text-alert" : "bg-sun-soft text-sun-ink"}`}
                    >
                      {a.type === "out_of_stock" ? <PackageX className="size-4" /> : <AlertTriangle className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.productName}</p>
                      <p className="text-[12px] text-ink-soft">
                        {a.code}
                        {!scoped && ` · ${byId.get(a.branchId)?.name ?? ""}`}
                      </p>
                    </div>
                  </div>
                  <Badge tone={a.type === "out_of_stock" ? "alert" : "sun"}>
                    {a.type === "out_of_stock" ? "Out" : `${a.stockPieces} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
