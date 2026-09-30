"use client";

import { useState } from "react";
import { Gift, ImageOff, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { type Availability } from "@/lib/format";
import { giftDates, giftStatus } from "@/lib/gift";
import type { FreeGift } from "@/lib/types";
import { cn } from "@/lib/format";

export function ProductImage({
  src,
  alt,
  className,
  sizes = "thumb",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: "thumb" | "full";
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn("flex items-center justify-center bg-navy-50 text-navy-300", className)}>
        <ImageOff className={sizes === "full" ? "size-10" : "size-6"} aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("bg-navy-50 object-cover", className)}
    />
  );
}

export function AvailabilityBadge({ value, lowCount }: { value: Availability; lowCount?: string }) {
  if (value === "out") return <Badge tone="alert">Out of stock</Badge>;
  if (value === "low") return <Badge tone="sun">{lowCount ? `Only ${lowCount} left` : "Low stock"}</Badge>;
  return <Badge tone="fresh">In stock</Badge>;
}

export function QtyStepper({
  value,
  onChange,
  min = 0,
  max,
  size = "md",
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label: string;
}) {
  const clamp = (v: number) => {
    let n = Number.isFinite(v) ? Math.floor(v) : 0;
    if (max != null) n = Math.min(n, max);
    return Math.max(n, 0);
  };
  const dec = () => {
    const next = value - 1;
    onChange(next < min ? 0 : next);
  };
  const inc = () => onChange(clamp(value < min ? min : value + 1));
  const btn = size === "sm" ? "size-8" : "size-10";

  return (
    <div className="inline-flex items-center rounded-xl bg-navy-50 p-0.5" role="group" aria-label={label}>
      <button
        type="button"
        onClick={dec}
        disabled={value <= 0}
        aria-label={`Decrease ${label}`}
        className={cn(btn, "inline-flex items-center justify-center rounded-[10px] text-navy-700 transition hover:bg-white disabled:opacity-40")}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
        onBlur={() => value > 0 && value < min && onChange(min)}
        className={cn(
          "w-11 bg-transparent text-center font-display font-bold text-navy-900 focus:outline-none",
          size === "sm" ? "text-sm" : "text-base",
        )}
      />
      <button
        type="button"
        onClick={inc}
        disabled={max != null && value >= max}
        aria-label={`Increase ${label}`}
        className={cn(btn, "inline-flex items-center justify-center rounded-[10px] bg-navy-700 text-white transition hover:bg-navy-800 disabled:opacity-40")}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function UnitToggle({
  value,
  onChange,
  qtyPerBox,
  unitLabel,
}: {
  value: "box" | "piece";
  onChange: (v: "box" | "piece") => void;
  qtyPerBox: number;
  unitLabel: string;
}) {
  return (
    <div className="inline-flex rounded-xl bg-navy-50 p-1 text-sm" role="radiogroup" aria-label="Buy by">
      {(["box", "piece"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium transition",
            value === u ? "bg-white text-navy-900 shadow-sm" : "text-ink-soft hover:text-navy-900",
          )}
        >
          {u === "box" ? `Box of ${qtyPerBox}` : `Per ${unitLabel}`}
        </button>
      ))}
    </div>
  );
}

/** "🎁 FREE Blender" ribbon for product cards. Hidden when the promo has ended. */
export function GiftTag({ gift, className }: { gift: FreeGift | null | undefined; className?: string }) {
  const status = giftStatus(gift);
  if (!gift || !status || status === "ended") return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold leading-snug",
        status === "active" ? "bg-sun-soft text-sun-ink" : "bg-navy-50 text-navy-700",
        className,
      )}
    >
      <Gift className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        {status === "active" ? "FREE " : "Free "}
        {gift.name}
        {status === "upcoming" && giftDates(gift) ? ` · ${giftDates(gift)}` : ""}
      </span>
    </p>
  );
}

/** Larger gift block for the product sheet. */
export function GiftPanel({ gift, perWhat }: { gift: FreeGift | null | undefined; perWhat: string }) {
  const status = giftStatus(gift);
  if (!gift || !status || status === "ended") return null;
  const dates = giftDates(gift);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sun-soft to-brand-orange-soft p-3 ring-1 ring-inset ring-sun/40">
      {gift.imageUrl ? (
        <ProductImage src={gift.imageUrl} alt={gift.name} className="size-16 shrink-0 rounded-xl bg-white" />
      ) : (
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-white text-brand-orange">
          <Gift className="size-8" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-orange-dark">{status === "active" ? "Free gift" : "Free gift coming soon"}</p>
        <p className="font-display text-lg font-black leading-tight text-navy-900">{gift.name}</p>
        <p className="text-[12px] text-sun-ink">
          {status === "active" ? `1 free with every ${perWhat}` : "Promo starts soon"}
          {dates ? ` · ${dates}` : ""}
        </p>
      </div>
    </div>
  );
}
