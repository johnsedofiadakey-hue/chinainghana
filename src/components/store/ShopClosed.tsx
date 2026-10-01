"use client";

import { collection, query, where } from "firebase/firestore";
import { Clock, MessageCircle, MoonStar, Wrench } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/firebase";
import { displayPhone, waLink } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { formatReopen, type ShopState } from "@/lib/shop";
import type { Branch } from "@/lib/types";

/** What customers see when the shop is closed or paused. Loads no products. */
export function ShopClosed({
  state,
  message,
  reopensAt,
  showContacts,
}: {
  state: Exclude<ShopState, "open">;
  message: string;
  reopensAt: Date | null;
  showContacts: boolean;
}) {
  // Branch contacts only (a couple of documents), so customers can still reach the shop.
  const branches = useQueryData<Branch>(
    showContacts ? query(collection(db, "branches"), where("active", "==", true)) : null,
    `closed:branches:${showContacts}`,
  ).data.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const paused = state === "paused";
  const Icon = paused ? Wrench : MoonStar;

  return (
    <main className="flex min-h-dvh flex-col bg-navy-900">
      <div className="relative overflow-hidden px-6 pb-16 pt-10">
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-brand-orange/20 blur-2xl" />
        <div className="absolute -left-16 top-24 size-40 rounded-full bg-sun/15 blur-2xl" />
        <div className="relative mx-auto max-w-md">
          <Logo inverted />
        </div>
      </div>
      <div className="-mt-8 flex-1 rounded-t-[28px] bg-surface px-6 pb-10 pt-8">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-orange-soft text-brand-orange-dark">
            <Icon className="size-8" aria-hidden />
          </span>
          <h1 className="mt-4 font-display text-3xl font-black text-navy-900">{paused ? "We'll be right back" : "We're closed for now"}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {paused
              ? "The shop is temporarily unavailable. Please check back a little later."
              : message || "We're updating our shop. Please check back soon."}
          </p>
          {!paused && reopensAt && (
            <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-navy-800 ring-1 ring-inset ring-line">
              <Clock className="size-4 text-brand-orange" /> Back {formatReopen(reopensAt)}
            </p>
          )}

          {showContacts && branches.length > 0 && (
            <div className="mt-8 space-y-2 text-left">
              <p className="text-center text-sm font-medium text-navy-900">Need something? Chat with a branch</p>
              {branches.map((b) => (
                <a key={b.id} href={waLink(b.whatsapp)} target="_blank" rel="noopener noreferrer" className="block">
                  <span className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-inset ring-line hover:bg-navy-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-navy-900">{b.name}</span>
                      <span className="text-[13px] text-ink-soft">{displayPhone(b.whatsapp)}</span>
                    </span>
                    <Button variant="whatsapp" size="sm" tabIndex={-1}>
                      <MessageCircle className="size-4" /> Chat
                    </Button>
                  </span>
                </a>
              ))}
            </div>
          )}

          <a href="/login" className="mt-10 inline-flex min-h-10 items-center px-2 text-[13px] text-ink-soft hover:underline">
            Staff sign in
          </a>
        </div>
      </div>
    </main>
  );
}
