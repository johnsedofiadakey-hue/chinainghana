"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Gift, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { ProductImage, QtyStepper, UnitToggle } from "@/components/store/bits";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ghs, normalizeGhanaPhone, priceSuffix, stockLabel } from "@/lib/format";
import { giftStatus } from "@/lib/gift";
import { useQueryData } from "@/lib/hooks";
import type { Product, Unit } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches } from "./data";

interface Line {
  key: string;
  productId: string;
  unit: Unit;
  qty: number;
  price: number;
}

export function NewSale({ fixedBranchId, basePath }: { fixedBranchId: string | null; basePath: "/admin" | "/manager" }) {
  const { branches } = useAllBranches();
  const [pickedBranch, setPickedBranch] = useState<string>("");
  const branchId = fixedBranchId ?? (pickedBranch || branches.find((b) => b.active)?.id || "");

  const { data: products } = useQueryData<Product>(
    branchId ? query(collection(db, "products"), where("branchId", "==", branchId)) : null,
    `newsale:products:${branchId}`,
  );
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ saleId: string; receiptNo: string; total: number; text: string; wa: string | null } | null>(null);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [products, search]);

  const total = Math.round(lines.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;

  function add(p: Product) {
    const unit: Unit = "box";
    const key = `${p.id}:${unit}`;
    setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { key, productId: p.id, unit, qty: 1, price: p.boxPrice }]));
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.unit && patch.unit !== l.unit) {
          const p = byId.get(l.productId)!;
          next.price = patch.unit === "box" ? p.boxPrice : (p.piecePrice ?? 0);
          next.key = `${l.productId}:${patch.unit}`;
        }
        return next;
      }),
    );
  }

  async function submit() {
    setPhoneErr(null);
    if (!lines.length) return toast.error("Add at least one product.");
    if (customerPhone && !normalizeGhanaPhone(customerPhone)) {
      setPhoneErr("Enter a valid Ghana number or leave it empty.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.recordSale({
        branchId,
        items: lines.filter((l) => l.qty > 0).map((l) => {
          const p = byId.get(l.productId)!;
          const base = l.unit === "box" ? p.boxPrice : p.piecePrice;
          return { productId: l.productId, unit: l.unit, qty: l.qty, unitPrice: l.price !== base ? l.price : null };
        }),
        customer: { name: customerName.trim(), phone: customerPhone.trim() },
      });
      setDone({ saleId: res.saleId, receiptNo: res.receiptNo, total: res.total, text: res.receiptText, wa: res.receiptWhatsappUrl });
      toast.success(`Sale recorded · #${res.receiptNo}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setSearch("");
    setDone(null);
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-fresh-soft text-fresh">
          <CheckCircle2 className="size-8" />
        </div>
        <p className="mt-3 text-sm text-ink-soft">Sale recorded</p>
        <h1 className="font-display text-3xl font-black">#{done.receiptNo}</h1>
        <p className="mt-1 font-display text-xl font-bold text-brand-orange-dark">{ghs(done.total)}</p>
        <div className="mt-6 space-y-2">
          {done.wa && (
            <a href={done.wa} target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="whatsapp" size="lg" block>
                <MessageCircle className="size-5" /> Send receipt on WhatsApp
              </Button>
            </a>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(done.text).then(() => toast.success("Receipt copied"), () => toast.error("Couldn't copy"))}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <a href={`/r/${done.saleId}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" block>
                <ExternalLink className="size-4" /> Open
              </Button>
            </a>
          </div>
          <Button variant="primary" block onClick={reset}>
            <Plus className="size-4" /> New sale
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Link href={`${basePath}/sales`} className="-ml-2 mb-1 inline-flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-navy-600 hover:underline">
        <ArrowLeft className="size-4" /> Sales
      </Link>
      <PageHeader
        title="Record a sale"
        description="Walk-in sale. Stock is deducted immediately."
        actions={!fixedBranchId && <BranchSelect branches={branches.filter((b) => b.active)} value={branchId} onChange={(v) => { setPickedBranch(v); setLines([]); }} allowAll={false} />}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <Input autoFocus placeholder="Search product or code" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto">
            {results.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface" disabled={p.stockPieces <= 0}>
                  <ProductImage src={p.thumbUrl ?? p.imageUrl} alt={p.name} className="size-10 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block text-[12px] text-ink-soft">
                      {p.code} · {ghs(p.boxPrice)} {priceSuffix(p.qtyPerBox)}{giftStatus(p.freeGift) === "active" ? " · free gift" : ""} · {p.stockPieces > 0 ? stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) : "out of stock"}
                    </span>
                  </span>
                  <Plus className="size-5 text-navy-600" />
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="py-6 text-center text-sm text-ink-soft">No products found.</li>}
          </ul>
        </Card>

        <Card className="p-4 lg:col-span-3">
          {lines.length === 0 ? (
            <EmptyState title="No items yet" body="Tap products on the left to add them." className="py-10" />
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => {
                const p = byId.get(l.productId);
                if (!p) return null;
                const max = Math.floor(p.stockPieces / (l.unit === "box" ? p.qtyPerBox : 1));
                return (
                  <li key={l.key} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-[12px] text-ink-soft">
                          {p.code} · in stock: {stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) || "0"}
                        </p>
                        {l.unit === "box" && giftStatus(p.freeGift) === "active" && (
                          <p className="flex items-center gap-1 text-[12px] font-semibold text-sun-ink">
                            <Gift className="size-3.5 shrink-0" aria-hidden /> Give {l.qty > 1 ? `${l.qty} × ` : ""}FREE {p.freeGift!.name}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label={`Remove ${p.name}`}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-alert-soft hover:text-alert-ink"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.sellByPiece && p.piecePrice != null && (
                        <UnitToggle value={l.unit} onChange={(u) => update(l.key, { unit: u })} qtyPerBox={p.qtyPerBox} unitLabel={p.unitLabel} />
                      )}
                      <QtyStepper size="sm" label="Quantity" value={l.qty} max={max} onChange={(v) => update(l.key, { qty: v })} />
                      <label className="flex items-center gap-1 text-[13px] text-ink-soft">
                        @ GH₵
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          value={l.price}
                          onChange={(e) => update(l.key, { price: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="h-8 w-24 rounded-lg bg-white px-2 text-sm text-navy-900 ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
                          aria-label="Unit price"
                        />
                      </label>
                      <span className="ml-auto font-display font-bold">{ghs(l.price * l.qty)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="Customer name" hint="Optional">
              {(id) => <Input id={id} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Kofi Boateng" />}
            </Field>
            <Field label="Customer WhatsApp" hint="Optional — to send the receipt" error={phoneErr}>
              {(id) => <Input id={id} type="tel" inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="024 123 4567" />}
            </Field>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-navy-900 p-3 pl-4 text-white">
            <div>
              <p className="text-[12px] text-navy-200">Total</p>
              <p className="font-display text-2xl font-black">{ghs(total)}</p>
            </div>
            <Button variant="cta" size="lg" loading={busy} onClick={submit} disabled={!lines.length || !branchId}>
              Save sale
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
