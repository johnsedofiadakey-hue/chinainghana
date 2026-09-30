"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, ExternalLink, Gift, MessageCircle, Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { businessDate, cn, dateTime, displayPhone, ghs, lineQty, toDate, waLink } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Sale } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { scopedQuery, useAllBranches } from "./data";

type Range = "today" | "7d" | "30d" | "all";

function inRange(sale: Sale, range: Range): boolean {
  if (range === "all") return true;
  const d = toDate(sale.createdAt);
  if (!d) return true;
  if (range === "today") return businessDate(d) === businessDate();
  const days = range === "7d" ? 7 : 30;
  return Date.now() - d.getTime() <= days * 86400000;
}

export function SalesPanel({ fixedBranchId, basePath }: { fixedBranchId: string | null; basePath: "/admin" | "/manager" }) {
  const { branches, byId } = useAllBranches();
  const [scope, setScope] = useState<string>(fixedBranchId ?? "all");
  const [range, setRange] = useState<Range>("today");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: sales, loading } = useQueryData<Sale>(scopedQuery("sales", fixedBranchId ?? scope, 500), `sales:${fixedBranchId ?? scope}`);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter((s) => inRange(s, range))
      .filter(
        (s) =>
          !q ||
          s.receiptNo.toLowerCase().includes(q) ||
          (s.customer?.name ?? "").toLowerCase().includes(q) ||
          (s.orderNo ?? "").toLowerCase().includes(q) ||
          s.items.some((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)),
      );
  }, [sales, range, search]);

  const valid = filtered.filter((s) => !s.voided);
  const total = valid.reduce((a, s) => a + s.total, 0);
  const walkin = valid.filter((s) => s.source === "walkin").reduce((a, s) => a + s.total, 0);
  const fromOrders = total - walkin;
  const active = sales.find((s) => s.id === activeId) ?? null;

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Walk-in sales and completed WhatsApp orders."
        actions={
          <>
            {!fixedBranchId && <BranchSelect branches={branches} value={scope} onChange={setScope} />}
            <Link href={`${basePath}/sales/new`}>
              <Button variant="cta">
                <Plus className="size-4" /> Record sale
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="Total" value={ghs(total)} sub={`${valid.length} sale(s)`} tone="fresh" />
        <StatCard label="Walk-in" value={ghs(walkin)} />
        <StatCard label="WhatsApp orders" value={ghs(fromOrders)} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5">
          {(
            [
              ["today", "Today"],
              ["7d", "7 days"],
              ["30d", "30 days"],
              ["all", "All"],
            ] as [Range, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setRange(k)}
              className={cn(
                "h-9 rounded-full px-3.5 text-sm font-medium transition",
                range === k ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <Input placeholder="Receipt, customer or product" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Receipt className="size-6" />} title="No sales in this period" body="Record a walk-in sale or complete a WhatsApp order." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setActiveId(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", s.voided ? "bg-alert-soft text-alert" : "bg-fresh-soft text-fresh-ink")}>
                    <Receipt className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn("font-display font-bold", s.voided && "line-through opacity-60")}>#{s.receiptNo}</span>
                      {s.source === "order" ? <Badge tone="navy">Order #{s.orderNo}</Badge> : <Badge tone="neutral">Walk-in</Badge>}
                      {s.voided && <Badge tone="alert">Voided</Badge>}
                    </span>
                    <span className="block truncate text-[13px] text-ink-soft">
                      {s.items.map((i) => `${lineQty(i)} ${i.name}${i.gift ? " + free gift" : ""}`).join(", ")}
                      {!fixedBranchId && scope === "all" && ` · ${byId.get(s.branchId)?.name ?? s.branchName}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className={cn("block font-display font-bold", s.voided && "line-through opacity-60")}>{ghs(s.total)}</span>
                    <span className="block text-[12px] text-ink-soft">{dateTime(s.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SaleDetail sale={active} onClose={() => setActiveId(null)} />
    </div>
  );
}

function SaleDetail({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!sale) return null;

  const receiptLink = typeof window !== "undefined" ? `${window.location.origin}/r/${sale.id}` : `/r/${sale.id}`;
  const receiptMsg = [
    `*RECEIPT #${sale.receiptNo}*`,
    `China-in-Ghana · ${sale.branchName}`,
    ...sale.items.map((l) => `• ${l.code} ${l.name} — ${lineQty(l)} = ${ghs(l.lineTotal)}${l.gift ? `\n   FREE GIFT: ${l.gift}` : ""}`),
    `*TOTAL: ${ghs(sale.total)}*`,
    "",
    "Thank you for shopping with us!",
    receiptLink,
  ].join("\n");

  async function doVoid() {
    if (!sale) return;
    if (reason.trim().length < 3) {
      setErr("Give a reason for voiding this sale.");
      return;
    }
    setBusy(true);
    try {
      await api.voidSale({ saleId: sale.id, reason: reason.trim() });
      toast.success(`Sale #${sale.receiptNo} voided and stock returned`);
      setVoiding(false);
      setReason("");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={() => {
        setVoiding(false);
        onClose();
      }}
      title={`Receipt #${sale.receiptNo}`}
      description={`${sale.branchName} · ${dateTime(sale.createdAt)}`}
      footer={
        sale.voided ? null : voiding ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVoiding(false)}>
              Back
            </Button>
            <Button variant="danger" block loading={busy} onClick={doVoid}>
              Void sale and return stock
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="text-alert-ink hover:bg-alert-soft" onClick={() => setVoiding(true)}>
              <Ban className="size-4" /> Void
            </Button>
            <div className="flex flex-1 justify-end gap-2">
              <a href={`/r/${sale.id}`} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary">
                  <ExternalLink className="size-4" /> Open
                </Button>
              </a>
              {sale.customer?.phone ? (
                <a href={waLink(sale.customer.phone, receiptMsg)} target="_blank" rel="noopener noreferrer">
                  <Button variant="whatsapp">
                    <MessageCircle className="size-4" /> Send receipt
                  </Button>
                </a>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => navigator.clipboard?.writeText(receiptMsg).then(() => toast.success("Receipt copied"), () => toast.error("Couldn't copy"))}
                >
                  Copy receipt
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {sale.voided && <p className="rounded-xl bg-alert-soft p-3 text-sm text-alert-ink">Voided: {sale.voidReason}</p>}
        {(sale.customer?.name || sale.customer?.phone) && (
          <p className="rounded-xl bg-surface p-3 text-sm">
            {sale.customer.name || "Customer"} {sale.customer.phone && `· ${displayPhone(sale.customer.phone)}`}
          </p>
        )}
        <ul className="divide-y divide-line">
          {sale.items.map((l) => (
            <li key={`${l.productId}:${l.unit}`} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                <span className="block font-medium">{l.name}</span>
                <span className="text-[12px] text-ink-soft">
                  {l.code} · {lineQty(l)} × {ghs(l.unitPrice)}
                </span>
                {l.gift && (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-sun-ink">
                    <Gift className="size-3.5 shrink-0" aria-hidden /> FREE: {l.gift}
                  </span>
                )}
              </span>
              <span className="font-display font-bold">{ghs(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-ink-soft">Total</span>
          <span className="font-display text-2xl font-black">{ghs(sale.total)}</span>
        </div>
        {voiding && (
          <Field label="Why are you voiding this sale?" required error={err}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setErr(null);
                }}
                placeholder="Entered the wrong quantity"
              />
            )}
          </Field>
        )}
        {voiding && <p className="text-[13px] text-ink-soft">The stock goes back to the branch and the admin can see this in the activity log.</p>}
      </div>
    </Modal>
  );
}
