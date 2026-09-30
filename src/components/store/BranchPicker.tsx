"use client";

import { Check, Clock, LocateFixed, MapPin, Navigation, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn, waLink } from "@/lib/format";
import { directionsUrl, formatKm } from "@/lib/geo";
import type { Branch } from "@/lib/types";

export interface BranchWithDistance extends Branch {
  distanceKm: number | null;
}

export function BranchPicker({
  open,
  onClose,
  branches,
  selectedId,
  onSelect,
  onLocate,
  locating,
  locStatus,
}: {
  open: boolean;
  onClose: () => void;
  branches: BranchWithDistance[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLocate: () => void;
  locating: boolean;
  locStatus: "idle" | "ok" | "denied" | "error";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Choose your branch"
      description="Each branch has its own stock and prices."
      size="md"
    >
      <div className="mb-4 rounded-2xl bg-navy-50 p-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-navy-700">
            <LocateFixed className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-navy-900">
              {locStatus === "ok" ? "Sorted by distance from you" : "Find the branch closest to you"}
            </p>
            <p className="text-[13px] text-ink-soft">
              {locStatus === "denied"
                ? "Location is blocked. Allow it in your browser settings, or pick a branch below."
                : "Your location stays on your phone. It's never saved."}
            </p>
          </div>
          {locStatus !== "ok" && (
            <Button size="sm" onClick={onLocate} loading={locating}>
              Use my location
            </Button>
          )}
        </div>
      </div>

      <ul className="space-y-2.5">
        {branches.map((b, i) => {
          const selected = b.id === selectedId;
          return (
            <li key={b.id}>
              <div
                className={cn(
                  "rounded-2xl p-3.5 ring-1 ring-inset transition",
                  selected ? "bg-navy-50/60 ring-2 ring-navy-600" : "bg-white ring-line hover:ring-navy-200",
                )}
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() => {
                    onSelect(b.id);
                    onClose();
                  }}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                      selected ? "bg-navy-700 text-white" : "bg-navy-50 text-navy-700",
                    )}
                  >
                    {selected ? <Check className="size-4" /> : <MapPin className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-navy-900">{b.name}</span>
                      {locStatus === "ok" && i === 0 && (
                        <span className="rounded-md bg-brand-orange-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-orange-dark">
                          Nearest
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-soft">
                      {b.address}
                      {b.landmark ? ` · ${b.landmark}` : ""}
                    </span>
                    {b.hours && (
                      <span className="mt-1 flex items-center gap-1 text-[12px] text-ink-soft">
                        <Clock className="size-3.5" /> {b.hours}
                      </span>
                    )}
                  </span>
                  {b.distanceKm != null && (
                    <span className="shrink-0 font-display text-sm font-bold text-navy-700">{formatKm(b.distanceKm)}</span>
                  )}
                </button>
                <div className="mt-3 flex gap-2 pl-12">
                  <a
                    href={directionsUrl(b)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[13px] font-medium text-navy-700 ring-1 ring-inset ring-line hover:bg-navy-50"
                  >
                    <Navigation className="size-3.5" /> Directions
                  </a>
                  <a
                    href={waLink(b.whatsapp, `Hello ${b.name} branch 👋`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[13px] font-medium text-[#128c4a] ring-1 ring-inset ring-line hover:bg-navy-50"
                  >
                    <MessageCircle className="size-3.5" /> WhatsApp
                  </a>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export function LocationPrompt({
  open,
  onLocate,
  onManual,
  locating,
}: {
  open: boolean;
  onLocate: () => void;
  onManual: () => void;
  locating: boolean;
}) {
  return (
    <Modal open={open} onClose={onManual} title="Welcome to China-in-Ghana" size="sm">
      <div className="text-center">
        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-orange/20" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-brand-orange text-white">
            <MapPin className="size-8" />
          </span>
        </div>
        <p className="font-display text-xl font-bold text-navy-900">Find your nearest branch</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
          We&apos;ll show live prices and stock at the branch closest to you. Your location never leaves your phone.
        </p>
        <div className="mt-6 space-y-2">
          <Button block size="lg" variant="cta" onClick={onLocate} loading={locating}>
            <LocateFixed className="size-5" /> Use my location
          </Button>
          <Button block variant="ghost" onClick={onManual}>
            I&apos;ll choose a branch myself
          </Button>
        </div>
      </div>
    </Modal>
  );
}
