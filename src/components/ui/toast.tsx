"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/format";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; remove: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: Date.now() + Math.random() }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToasts.getState().push({ tone: "success", message }),
  error: (message: string) => useToasts.getState().push({ tone: "error", message }),
  info: (message: string) => useToasts.getState().push({ tone: "info", message }),
};

function ToastView({ item }: { item: ToastItem }) {
  const remove = useToasts((s) => s.remove);
  useEffect(() => {
    const t = setTimeout(() => remove(item.id), item.tone === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [item, remove]);

  const Icon = item.tone === "success" ? CheckCircle2 : item.tone === "error" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full animate-slide-up items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-float)]",
        item.tone === "error" ? "bg-alert-ink text-white" : "bg-navy-900 text-white",
      )}
      role={item.tone === "error" ? "alert" : "status"}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", item.tone === "success" && "text-fresh")} aria-hidden />
      <p className="flex-1">{item.message}</p>
      <button type="button" onClick={() => remove(item.id)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] mx-auto flex max-w-md flex-col gap-2 px-4">
      {items.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </div>
  );
}
