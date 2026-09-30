"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Gift, MessageCircle, Search, ShoppingCart, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/store/bits";
import { api, errorMessage } from "@/lib/api";
import { cn, dateTime, displayPhone, ghs, lineQty, timeAgo, waLink } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Order, OrderStatus } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { scopedQuery, useAllBranches } from "./data";

const TABS: { key: OrderStatus | "open" | "all"; label: string }[] = [
  { key: "open", label: "To handle" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

export function statusBadge(status: OrderStatus) {
  switch (status) {
    case "new":
      return <Badge tone="orange">New</Badge>;
    case "confirmed":
      return <Badge tone="navy">Confirmed</Badge>;
    case "completed":
      return <Badge tone="fresh">Completed</Badge>;
    case "cancelled":
      return <Badge tone="alert">Cancelled</Badge>;
  }
}

function OrdersInner({ fixedBranchId }: { fixedBranchId: string | null }) {
  const { branches, byId } = useAllBranches();
  const [scope, setScope] = useState<string>(fixedBranchId ?? "all");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const [search, setSearch] = useState("");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get("open");

  const { data: orders, loading } = useQueryData<Order>(scopedQuery("orders", fixedBranchId ?? scope, 300), `orders:${fixedBranchId ?? scope}`);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => (tab === "all" ? true : tab === "open" ? o.status === "new" || o.status === "confirmed" : o.status === tab))
      .filter(
        (o) =>
          !q ||
          o.orderNo.toLowerCase().includes(q) ||
          o.customer.name.toLowerCase().includes(q) ||
          o.customer.phone.includes(q.replace(/^0/, "")) ||
          (o.customer.businessName ?? "").toLowerCase().includes(q),
      );
  }, [orders, tab, search]);

  const counts = useMemo(
    () => ({
      open: orders.filter((o) => o.status === "new" || o.status === "confirmed").length,
    }),
    [orders],
  );

  const active = orders.find((o) => o.id === openId) ?? null;
  const setOpen = (id: string | null) => router.replace(id ? `${pathname}?open=${id}` : pathname, { scroll: false });

  return (
    <div>
      <PageHeader
        title="Orders"
        description="WhatsApp orders from the shop. Confirm, then complete to deduct stock and send a receipt."
        actions={!fixedBranchId && <BranchSelect branches={branches} value={scope} onChange={setScope} />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition",
                tab === t.key ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50",
              )}
            >
              {t.label}
              {t.key === "open" && counts.open > 0 && (
                <span className="ml-1.5 rounded-full bg-brand-orange px-1.5 text-[11px] text-white">{counts.open}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <Input placeholder="Order no, name or phone" className="h-10 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingCart className="size-6" />} title={tab === "open" ? "You're all caught up" : "No orders here"} body="New orders from the shop appear here in real time." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setOpen(o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      o.status === "new" ? "bg-brand-orange-soft text-brand-orange-dark" : "bg-navy-50 text-navy-600",
                    )}
                  >
                    <ShoppingCart className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-bold">#{o.orderNo}</span>
                      {statusBadge(o.status)}
                    </span>
                    <span className="block truncate text-[13px] text-ink-soft">
                      {o.customer.name}
                      {o.customer.businessName ? ` · ${o.customer.businessName}` : ""} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                      {!fixedBranchId && scope === "all" && ` · ${byId.get(o.branchId)?.name ?? o.branchName}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display font-bold">{ghs(o.total)}</span>
                    <span className="block text-[12px] text-ink-soft">{timeAgo(o.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <OrderDetail order={active} onClose={() => setOpen(null)} />
    </div>
  );
}

function OrderDetail({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelMode, setCancelMode] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  useEffect(() => {
    setCancelMode(false);
    setReason("");
    setReasonError(null);
    setReceiptUrl(null);
  }, [order?.id]);

  if (!order) return null;

  async function update(status: "confirmed" | "completed" | "cancelled") {
    if (!order) return;
    if (status === "cancelled" && reason.trim().length < 3) {
      setReasonError("Give a short reason, e.g. customer changed their mind.");
      return;
    }
    setBusy(status);
    try {
      const res = await api.updateOrderStatus({ orderId: order.id, status, reason: reason.trim() || undefined });
      if (status === "completed") {
        toast.success(`Order completed · receipt ${res.receiptNo}`);
        setReceiptUrl(res.receiptWhatsappUrl ?? null);
      } else {
        toast.success(status === "confirmed" ? "Order confirmed" : "Order cancelled");
        setCancelMode(false);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const chatUrl = waLink(order.customer.phone, `Hello ${order.customer.name}, this is China-in-Ghana ${order.branchName} about your order #${order.orderNo}.`);
  const open = order.status === "new" || order.status === "confirmed";

  const footer = receiptUrl ? (
    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
      <Button variant="whatsapp" block size="lg">
        <MessageCircle className="size-5" /> Send receipt on WhatsApp
      </Button>
    </a>
  ) : open ? (
    cancelMode ? (
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setCancelMode(false)}>
          Back
        </Button>
        <Button variant="danger" block loading={busy === "cancelled"} onClick={() => update("cancelled")}>
          Cancel order
        </Button>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" className="text-alert-ink hover:bg-alert-soft" onClick={() => setCancelMode(true)}>
          <XCircle className="size-4" /> Cancel
        </Button>
        <div className="flex flex-1 justify-end gap-2">
          {order.status === "new" && (
            <Button variant="secondary" loading={busy === "confirmed"} onClick={() => update("confirmed")}>
              Confirm
            </Button>
          )}
          <Button variant="primary" loading={busy === "completed"} onClick={() => update("completed")}>
            <CheckCircle2 className="size-4" /> Complete sale
          </Button>
        </div>
      </div>
    )
  ) : order.saleId ? (
    <a href={`/r/${order.saleId}`} target="_blank" rel="noopener noreferrer" className="block">
      <Button variant="secondary" block>
        View receipt {order.receiptNo ? `#${order.receiptNo}` : ""}
      </Button>
    </a>
  ) : null;

  return (
    <Modal
      open={!!order}
      onClose={onClose}
      title={`Order #${order.orderNo}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {statusBadge(order.status)} {order.branchName} · {dateTime(order.createdAt)}
        </span>
      }
      footer={footer}
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-3.5">
          <div>
            <p className="font-medium">{order.customer.name}</p>
            <p className="text-[13px] text-ink-soft">
              {displayPhone(order.customer.phone)}
              {order.customer.businessName ? ` · ${order.customer.businessName}` : ""}
            </p>
          </div>
          <a href={chatUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="whatsapp" size="sm">
              <MessageCircle className="size-4" /> Chat
            </Button>
          </a>
        </div>
        {order.note && <p className="rounded-xl bg-sun-soft p-3 text-sm text-sun-ink">Note: {order.note}</p>}
        {open && order.items.some((l) => l.gift) && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-orange-soft p-3 text-sm font-medium text-brand-orange-dark">
            <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Remember to hand over the free gift{order.items.filter((l) => l.gift).length > 1 ? "s" : ""}: {order.items.filter((l) => l.gift).map((l) => l.gift).join(", ")}
            </span>
          </p>
        )}

        <ul className="divide-y divide-line">
          {order.items.map((l) => (
            <li key={`${l.productId}:${l.unit}`} className="flex items-center gap-3 py-2.5">
              <ProductImage src={l.thumb} alt={l.name} className="size-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-[12px] text-ink-soft">
                  {l.code} · {lineQty(l)} × {ghs(l.unitPrice)}
                  {l.pieces !== l.qty && ` · ${l.pieces} pcs`}
                </p>
                {l.gift && (
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-sun-ink">
                    <Gift className="size-3.5 shrink-0" aria-hidden /> FREE: {l.gift}
                  </p>
                )}
              </div>
              <p className="font-display font-bold">{ghs(l.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-sm text-ink-soft">Total</span>
          <span className="font-display text-2xl font-black">{ghs(order.total)}</span>
        </div>

        {cancelMode && (
          <Field label="Reason for cancelling" required error={reasonError}>
            {(id) => (
              <Textarea
                id={id}
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReasonError(null);
                }}
                placeholder="Customer changed their mind"
              />
            )}
          </Field>
        )}

        {receiptUrl && (
          <p className="rounded-xl bg-fresh-soft p-3 text-sm text-fresh-ink">Sale recorded and stock updated. Send the receipt to the customer on WhatsApp.</p>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">History</p>
          <ol className="space-y-1.5">
            {order.statusHistory?.map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-ink-soft">
                <Clock className="size-3.5" />
                <span className="capitalize text-navy-900">{h.status}</span> · {dateTime(h.at)}
                {h.reason ? ` · ${h.reason}` : ""}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

export function OrdersPanel({ fixedBranchId }: { fixedBranchId: string | null }) {
  return (
    <Suspense fallback={<Spinner />}>
      <OrdersInner fixedBranchId={fixedBranchId} />
    </Suspense>
  );
}
