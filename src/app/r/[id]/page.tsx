"use client";

import { use } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Spinner } from "@/components/ui/misc";
import { dateTime, ghs, lineQty } from "@/lib/format";
import { useDocData } from "@/lib/hooks";
import type { Sale } from "@/lib/types";

export default function ReceiptPage(props: { params: Promise<{ id: string }> }) {
  const { id } = use(props.params);
  const { data: sale, loading } = useDocData<Sale>(`sales/${id}`);

  if (loading) return <Spinner className="min-h-dvh" />;
  if (!sale)
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <EmptyState title="Receipt not found" body="Check the link and try again." />
      </main>
    );

  return (
    <main className="min-h-dvh px-4 py-8 print:py-0">
      <Card className="mx-auto max-w-md p-6 print:shadow-none print:ring-0">
        <div className="flex items-center justify-between">
          <Logo />
          {sale.voided && <span className="rounded-lg bg-alert-soft px-2 py-1 text-xs font-bold uppercase text-alert-ink">Voided</span>}
        </div>
        <div className="mt-5 border-y border-dashed border-line py-4">
          <p className="text-sm text-ink-soft">Receipt</p>
          <h1 className="font-display text-2xl font-black">#{sale.receiptNo}</h1>
          <p className="text-sm text-ink-soft">
            {sale.branchName} branch · {dateTime(sale.createdAt)}
          </p>
          {sale.customer?.name && <p className="mt-1 text-sm">Customer: {sale.customer.name}</p>}
          {sale.orderNo && <p className="text-sm text-ink-soft">Order #{sale.orderNo}</p>}
        </div>
        <ul className="divide-y divide-line">
          {sale.items.map((l) => (
            <li key={`${l.productId}:${l.unit}`} className="flex justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{l.name}</span>
                <span className="text-[12px] text-ink-soft">
                  {l.code} · {lineQty(l)} × {ghs(l.unitPrice)}
                </span>
                {l.gift && <span className="block text-[12px] font-semibold text-sun-ink">🎁 FREE: {l.gift}</span>}
              </span>
              <span className="font-display font-bold">{ghs(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t-2 border-navy-900 pt-3">
          <span className="font-medium">Total</span>
          <span className="font-display text-2xl font-black">{ghs(sale.total)}</span>
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">Thank you for shopping with China-in-Ghana!</p>
        <div className="mt-5 flex justify-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          <Link href="/">
            <Button variant="ghost" size="sm">
              Visit shop
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
