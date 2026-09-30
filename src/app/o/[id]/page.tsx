"use client";

import { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Gift, MessageCircle, Package, XCircle } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/misc";
import { ProductImage } from "@/components/store/bits";
import { cn, dateTime, displayPhone, ghs, lineQty, waLink } from "@/lib/format";
import { useDocData } from "@/lib/hooks";
import type { Branch, Order, OrderStatus } from "@/lib/types";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "new", label: "Sent" },
  { status: "confirmed", label: "Confirmed" },
  { status: "completed", label: "Completed" },
];

export default function OrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const params = useSearchParams();
  const autoSend = params.get("send") === "1";
  const { data: order, loading } = useDocData<Order>(`orders/${id}`);
  const { data: branch } = useDocData<Branch>(order ? `branches/${order.branchId}` : null);
  const sentRef = useRef(false);

  const waUrl = order?.waMessage && branch?.whatsapp ? waLink(branch.whatsapp, order.waMessage) : null;

  // Straight after placing the order, hand the customer over to WhatsApp.
  useEffect(() => {
    if (autoSend && waUrl && !sentRef.current) {
      sentRef.current = true;
      window.history.replaceState(null, "", `/o/${id}`);
      window.location.href = waUrl;
    }
  }, [autoSend, waUrl, id]);

  if (loading) return <Spinner className="min-h-dvh" />;
  if (!order)
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="Order not found" body="Check the link and try again." action={<Link href="/"><Button>Go to shop</Button></Link>} />
      </main>
    );

  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const cancelled = order.status === "cancelled";

  return (
    <main className="min-h-dvh pb-10">
      <header className="bg-navy-900 px-4 pb-20 pt-4 text-white">
        <div className="mx-auto max-w-lg">
          <Link href="/" aria-label="Back to shop" className="-my-2 inline-flex py-2">
            <Logo inverted />
          </Link>
        </div>
      </header>
      <div className="mx-auto -mt-16 max-w-lg space-y-4 px-4">
        <Card className="p-5 text-center">
          <div
            className={cn(
              "mx-auto flex size-14 items-center justify-center rounded-full",
              cancelled ? "bg-alert-soft text-alert" : "bg-fresh-soft text-fresh",
            )}
          >
            {cancelled ? <XCircle className="size-8" /> : <CheckCircle2 className="size-8" />}
          </div>
          <p className="mt-3 text-sm text-ink-soft">Order number</p>
          <h1 className="font-display text-3xl font-black text-navy-900">#{order.orderNo}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {order.branchName} · {dateTime(order.createdAt)}
          </p>

          {!cancelled ? (
            <ol className="mt-5 flex items-center">
              {STEPS.map((s, i) => (
                <li key={s.status} className="flex flex-1 items-center last:flex-none">
                  <span className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-xs font-bold",
                        i <= stepIndex ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-300",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className={cn("text-[12px]", i <= stepIndex ? "font-medium text-navy-900" : "text-ink-soft")}>{s.label}</span>
                  </span>
                  {i < STEPS.length - 1 && <span className={cn("mx-1 mb-5 h-0.5 flex-1", i < stepIndex ? "bg-navy-700" : "bg-navy-100")} />}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-alert-soft p-3 text-sm text-alert-ink">This order was cancelled by the branch.</p>
          )}

          {order.status === "new" && waUrl && (
            <div className="mt-5 space-y-2 text-left">
              <div className="flex items-start gap-2 rounded-xl bg-sun-soft p-3 text-[13px] text-sun-ink">
                <Clock className="mt-0.5 size-4 shrink-0" />
                <p>
                  Make sure you pressed <strong>Send</strong> in WhatsApp so {order.branchName} receives your order. If WhatsApp didn&apos;t open,
                  use the button below.
                </p>
              </div>
              <a href={waUrl} className="block">
                <Button variant="whatsapp" size="lg" block>
                  <MessageCircle className="size-5" /> Send order on WhatsApp
                </Button>
              </a>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Package className="size-5 text-navy-600" /> Items
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {order.items.map((l) => (
              <li key={`${l.productId}:${l.unit}`} className="flex items-center gap-3 py-2.5">
                <ProductImage src={l.thumb} alt={l.name} className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.name}</p>
                  <p className="text-[12px] text-ink-soft">
                    {l.code} · {lineQty(l)} × {ghs(l.unitPrice)}
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
          <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-soft">Total</span>
            <span className="font-display text-2xl font-black text-navy-900">{ghs(order.total)}</span>
          </div>
          <div className="mt-4 rounded-xl bg-surface p-3 text-[13px] text-ink-soft">
            <p>
              <span className="font-medium text-navy-900">{order.customer.name}</span> · {displayPhone(order.customer.phone)}
              {order.customer.businessName ? ` · ${order.customer.businessName}` : ""}
            </p>
            {order.note && <p className="mt-1">Note: {order.note}</p>}
          </div>
        </Card>

        <div className="text-center">
          <Link href="/" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-navy-600 hover:underline">
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
