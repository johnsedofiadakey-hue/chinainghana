"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Gift, MessageCircle, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { api, errorMessage } from "@/lib/api";
import { ghs, isSingle, normalizeGhanaPhone } from "@/lib/format";
import { giftStatus } from "@/lib/gift";
import { useLocalState } from "@/lib/hooks";
import type { Branch, Product } from "@/lib/types";
import { useBranchCart, useCart } from "@/store/cart";
import { ProductImage, QtyStepper } from "./bits";

export interface ResolvedLine {
  key: string;
  product: Product;
  unit: "box" | "piece";
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export function useResolvedCart(branchId: string | null, products: Product[]) {
  const cart = useBranchCart(branchId);
  return useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines: ResolvedLine[] = [];
    let missing = 0;
    for (const [key, e] of Object.entries(cart)) {
      const p = byId.get(e.productId);
      if (!p) {
        missing++;
        continue;
      }
      const unitPrice = e.unit === "box" ? p.boxPrice : (p.piecePrice ?? 0);
      lines.push({ key, product: p, unit: e.unit, qty: e.qty, unitPrice, lineTotal: unitPrice * e.qty });
    }
    const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    return { lines, total, missing };
  }, [cart, products]);
}

interface CustomerDetails {
  name: string;
  phone: string;
  businessName: string;
}

export function CartSheet({
  open,
  onClose,
  branch,
  products,
}: {
  open: boolean;
  onClose: () => void;
  branch: Branch | null;
  products: Product[];
}) {
  const router = useRouter();
  const { lines, total } = useResolvedCart(branch?.id ?? null, products);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);

  const [step, setStep] = useState<"cart" | "details">("cart");
  const [saved, setSaved] = useLocalState<CustomerDetails>("cig.customer", { name: "", phone: "", businessName: "" });
  const [form, setForm] = useState<CustomerDetails>(saved);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerDetails | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("cart");
      setForm(saved);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!branch) return null;

  async function submit() {
    if (!branch) return;
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Enter your name.";
    const phone = normalizeGhanaPhone(form.phone);
    if (!phone) next.phone = "Enter a valid Ghana number, e.g. 024 123 4567.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const res = await api.placeOrder({
        branchId: branch.id,
        items: lines.map((l) => ({ productId: l.product.id, unit: l.unit, qty: l.qty })),
        customer: { name: form.name.trim(), phone: phone!, businessName: form.businessName.trim() },
        note: note.trim(),
      });
      setSaved({ name: form.name.trim(), phone: form.phone.trim(), businessName: form.businessName.trim() });
      clear(branch.id);
      setNote("");
      onClose();
      router.push(`/o/${res.orderId}?send=1`);
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const footer =
    lines.length === 0 ? null : step === "cart" ? (
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-soft">Total</p>
          <p className="font-display text-xl font-black text-navy-900">{ghs(total)}</p>
        </div>
        <Button variant="cta" size="lg" onClick={() => setStep("details")}>
          Continue
        </Button>
      </div>
    ) : (
      <div className="space-y-2">
        {errors.form && (
          <p className="flex items-start gap-2 rounded-xl bg-alert-soft px-3 py-2 text-[13px] text-alert-ink" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {errors.form}
          </p>
        )}
        <Button variant="whatsapp" size="lg" block loading={busy} onClick={submit}>
          <MessageCircle className="size-5" /> Send order on WhatsApp · {ghs(total)}
        </Button>
        <p className="text-center text-[12px] text-ink-soft">
          Opens WhatsApp with your order ready to send to {branch.name}. Delivery and payment are agreed there.
        </p>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === "cart" ? "Your order" : "Your details"}
      description={`${branch.name} branch`}
      footer={footer}
      size="md"
    >
      {lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-6" />}
          title="Your order is empty"
          body="Add products from the list to build your order."
          action={<Button onClick={onClose}>Browse products</Button>}
        />
      ) : step === "cart" ? (
        <ul className="divide-y divide-line">
          {lines.map((l) => {
            const p = l.product;
            const perUnit = l.unit === "box" ? p.qtyPerBox : 1;
            const otherPieces = lines
              .filter((x) => x.product.id === p.id && x.unit !== l.unit)
              .reduce((s, x) => s + x.qty * (x.unit === "box" ? p.qtyPerBox : 1), 0);
            const max = Math.max(0, Math.floor((p.stockPieces - otherPieces) / perUnit));
            const min = l.unit === "box" ? p.minBoxes || 1 : p.minPieces || 1;
            return (
              <li key={l.key} className="flex gap-3 py-3">
                <ProductImage src={p.thumbUrl ?? p.imageUrl} alt={p.name} className="size-16 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900">{p.name}</p>
                      <p className="text-[12px] text-ink-soft">
                        {p.code} · {ghs(l.unitPrice)} {l.unit === "piece" ? `/ ${p.unitLabel} (retail)` : isSingle(p.qtyPerBox) ? "each" : `/ box of ${p.qtyPerBox} (wholesale)`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(branch.id, p.id, l.unit)}
                      className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-alert-soft hover:text-alert-ink"
                      aria-label={`Remove ${p.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <QtyStepper
                      size="sm"
                      label={l.unit === "box" ? (isSingle(p.qtyPerBox) ? "Quantity" : "Boxes") : `${p.unitLabel}s`}
                      value={l.qty}
                      min={min}
                      max={max}
                      onChange={(v) => setQty(branch.id, p.id, l.unit, v)}
                    />
                    <p className="font-display text-base font-bold text-navy-900">{ghs(l.lineTotal)}</p>
                  </div>
                  {l.qty > max && <p className="mt-1 text-[12px] text-alert-ink">Only {max} available now.</p>}
                  {l.unit === "box" && giftStatus(p.freeGift) === "active" && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-sun-ink">
                      <Gift className="size-3.5" /> + {l.qty > 1 ? `${l.qty} × ` : ""}FREE {p.freeGift!.name}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep("cart")} className="inline-flex items-center gap-1 text-sm font-medium text-navy-600 hover:underline">
            <ArrowLeft className="size-4" /> Back to order
          </button>
          <Field label="Your name" required error={errors.name}>
            {(id) => (
              <Input id={id} autoComplete="name" placeholder="Ama Mensah" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            )}
          </Field>
          <Field label="Phone / WhatsApp number" required error={errors.phone}>
            {(id) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="024 123 4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            )}
          </Field>
          <Field label="Business or shop name" hint="Optional">
            {(id) => (
              <Input id={id} autoComplete="organization" placeholder="Ama's Enterprise" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            )}
          </Field>
          <Field label="Note for the branch" hint="Optional — e.g. delivery area or pickup time.">
            {(id) => <Textarea id={id} rows={2} placeholder="Please deliver to Madina" value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </div>
      )}
    </Modal>
  );
}
