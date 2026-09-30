"use client";

import { useEffect, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { cn, dateTime, stockLabel } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Product, StockMovement } from "@/lib/types";

type Mode = "receive" | "count" | "adjust";

const MODES: { key: Mode; label: string; help: string }[] = [
  { key: "receive", label: "Receive", help: "Add new stock that arrived." },
  { key: "count", label: "Stock take", help: "Set stock to what you physically counted." },
  { key: "adjust", label: "Correct", help: "Add or remove stock for damage, loss or mistakes." },
];

const TYPE_LABEL: Record<string, string> = {
  receive: "Received",
  count: "Stock take",
  adjust: "Correction",
  sale: "Walk-in sale",
  order: "Order",
  void: "Void (returned)",
};

export function StockDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("receive");
  const [boxes, setBoxes] = useState("");
  const [pieces, setPieces] = useState("");
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode("receive");
    setBoxes("");
    setPieces("");
    setReason("");
    setErr(null);
    setDirection("remove");
  }, [product?.id]);

  const movements = useQueryData<StockMovement>(
    product ? query(
          collection(db, "stockMovements"),
          where("branchId", "==", product.branchId),
          where("productId", "==", product.id),
          orderBy("createdAt", "desc"),
          limit(15),
        ) : null,
    `movements:${product?.id ?? "none"}`,
  ).data;

  if (!product) return null;

  const b = Math.max(0, Math.floor(Number(boxes) || 0));
  const p = Math.max(0, Math.floor(Number(pieces) || 0));
  const amount = b * product.qtyPerBox + p;
  const preview =
    mode === "receive" ? product.stockPieces + amount : mode === "count" ? amount : product.stockPieces + (direction === "add" ? amount : -amount);

  async function save() {
    if (!product) return;
    setErr(null);
    if (mode !== "count" && amount === 0) return setErr("Enter boxes and/or pieces.");
    if (mode === "adjust" && reason.trim().length < 3) return setErr("Give a reason for the correction.");
    if (preview < 0) return setErr("Stock can't go below zero.");
    setBusy(true);
    try {
      const sign = mode === "adjust" && direction === "remove" ? -1 : 1;
      await api.adjustStock({ productId: product.id, type: mode, boxes: sign * b, pieces: sign * p, reason: reason.trim() || undefined });
      toast.success(`Stock updated: ${stockLabel(preview, product.qtyPerBox, product.unitLabel) || "0"}`);
      setBoxes("");
      setPieces("");
      setReason("");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title={`Stock · ${product.name}`}
      description={`${product.code} · ${product.qtyPerBox} ${product.unitLabel}s per box`}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            After: <span className="font-display font-bold text-navy-900">{preview < 0 ? "—" : stockLabel(preview, product.qtyPerBox, product.unitLabel) || "0"}</span>
          </p>
          <Button loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-navy-50 p-4">
          <p className="text-[13px] text-navy-600">In stock now</p>
          <p className="font-display text-2xl font-black text-navy-900">{stockLabel(product.stockPieces, product.qtyPerBox, product.unitLabel) || "0"}</p>
          <p className="text-[12px] text-ink-soft">{product.stockPieces.toLocaleString()} pieces total</p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1 ring-1 ring-inset ring-line">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn("rounded-lg py-2 text-sm font-medium", mode === m.key ? "bg-white text-navy-900 shadow-sm" : "text-ink-soft")}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-ink-soft">{MODES.find((m) => m.key === mode)?.help}</p>

        {mode === "adjust" && (
          <div className="flex gap-2">
            {(["remove", "add"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={cn(
                  "flex-1 rounded-xl py-2 text-sm font-medium ring-1 ring-inset",
                  direction === d ? (d === "remove" ? "bg-alert-soft text-alert-ink ring-alert/30" : "bg-fresh-soft text-fresh-ink ring-fresh/30") : "bg-white text-ink-soft ring-line",
                )}
              >
                {d === "remove" ? "− Remove" : "+ Add"}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === "count" ? "Counted boxes" : "Boxes"}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={boxes} onChange={(e) => setBoxes(e.target.value)} placeholder="0" />}
          </Field>
          <Field label={`+ loose ${product.unitLabel}s`}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={pieces} onChange={(e) => setPieces(e.target.value)} placeholder="0" />}
          </Field>
        </div>
        <Field label={mode === "adjust" ? "Reason" : "Note"} required={mode === "adjust"} error={err}>
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === "receive" ? "Container from Guangzhou" : mode === "count" ? "Monthly count" : "2 damaged in transit"}
            />
          )}
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Recent movements</p>
          {movements.length === 0 ? (
            <p className="text-[13px] text-ink-soft">No stock history yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="font-medium">{TYPE_LABEL[m.type] ?? m.type}</span>
                    <span className="block truncate text-ink-soft">
                      {dateTime(m.createdAt)}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-display font-bold", m.qtyPieces >= 0 ? "text-fresh-ink" : "text-alert-ink")}>
                    {m.qtyPieces >= 0 ? "+" : ""}
                    {m.qtyPieces}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
