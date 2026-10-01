"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Lock, LockOpen, MessageCircle, MoonStar, RefreshCw, Store, Wrench } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { cn, dateTime, timeAgo, waLink } from "@/lib/format";
import { useDocData } from "@/lib/hooks";
import { formatReopen, useShopGate } from "@/lib/shop";
import type { License } from "@/lib/types";

// ---------------------------------------------------------------------------
// Banner at the top of every staff page while customers can't use the shop
// ---------------------------------------------------------------------------

export function ShopStatusBanner() {
  const gate = useShopGate();
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "superadmin";
  // Admins can read the licence (for the developer's WhatsApp); managers can't.
  const license = useDocData<License>(isAdmin && gate.state === "paused" ? "settings/license" : null).data;

  if (gate.loading || gate.state === "open") return null;

  if (gate.state === "paused") {
    return (
      <div className="mb-4 rounded-2xl bg-alert p-4 text-white print:hidden">
        <p className="flex items-center gap-2 font-display font-bold">
          <Wrench className="size-5 shrink-0" /> The shop is paused for customers
        </p>
        <p className="mt-1 text-sm text-white/90">
          {isAdmin
            ? "Today's free server capacity has been used up, so customers can't open the shop or order. Everything here still works. Contact your developer to upgrade your plan."
            : "Customers can't open the shop right now. You can keep working here. The admin has the details."}
        </p>
        {role === "superadmin" ? (
          <Link href="/super" className="mt-3 inline-block">
            <Button variant="secondary" size="sm">
              Manage capacity
            </Button>
          </Link>
        ) : (
          isAdmin &&
          license?.supportWhatsApp && (
            <a
              href={waLink(license.supportWhatsApp, "Hello, the China-in-Ghana shop is paused because the daily server capacity was reached. I'd like to upgrade.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block"
            >
              <Button variant="whatsapp" size="sm">
                <MessageCircle className="size-4" /> Contact developer
              </Button>
            </a>
          )
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sun-soft p-4 text-sun-ink ring-1 ring-inset ring-sun/40 print:hidden">
      <MoonStar className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">The shop is closed to customers</span>
        {gate.reopensAt ? ` until ${formatReopen(gate.reopensAt)}` : ""}. You can keep working here.
      </p>
      {isAdmin && (
        <Link href="/admin/settings">
          <Button variant="secondary" size="sm">
            Open or edit
          </Button>
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: open / close the shop (Settings)
// ---------------------------------------------------------------------------

export function ShopStatusCard() {
  const gate = useShopGate();
  const [message, setMessage] = useState("");
  const [reopensAt, setReopensAt] = useState("");
  const [showContacts, setShowContacts] = useState(true);
  const [confirming, setConfirming] = useState<"close" | "open" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const closed = gate.state === "closed" || (gate.shop?.open === false && !!gate.reopensAt);

  async function apply(open: boolean) {
    setErr(null);
    let iso: string | undefined;
    if (!open && reopensAt) {
      const d = new Date(reopensAt);
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
        setErr("Pick a reopening time in the future, or leave it empty.");
        setConfirming(null);
        return;
      }
      iso = d.toISOString();
    }
    setBusy(true);
    try {
      await api.setShopStatus({ open, message: message.trim() || undefined, reopensAt: iso, showContacts });
      toast.success(open ? "The shop is open to customers again" : "The shop is now closed to customers");
      setConfirming(null);
      if (open) {
        setMessage("");
        setReopensAt("");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Store className="size-5 text-navy-500" /> Shop status
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">Close the shop while you update prices or stock. You and the managers can keep working here.</p>
        </div>
        {gate.state === "paused" ? (
          <Badge tone="alert">Paused (capacity)</Badge>
        ) : closed ? (
          <Badge tone="sun">Closed to customers</Badge>
        ) : (
          <Badge tone="fresh">Open</Badge>
        )}
      </div>

      {gate.state === "paused" && (
        <p className="mt-3 rounded-xl bg-alert-soft p-3 text-sm text-alert-ink">
          The shop is paused because today&apos;s free server capacity is used up. Your developer can lift this; closing or opening here won&apos;t change it.
        </p>
      )}

      {closed ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-surface p-3 text-sm">
            <p>
              <span className="text-ink-soft">Customers see:</span> {gate.message || "We're updating our shop. Please check back soon."}
            </p>
            <p className="mt-1 text-ink-soft">{gate.reopensAt ? `Reopens automatically ${formatReopen(gate.reopensAt)}.` : "Stays closed until you reopen it."}</p>
            {gate.shop?.updatedAt && <p className="mt-1 text-[12px] text-ink-soft">Closed {timeAgo(gate.shop.updatedAt)}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" target="_blank">
              <Button variant="secondary">Preview shop</Button>
            </Link>
            <Button onClick={() => setConfirming("open")}>
              <LockOpen className="size-4" /> Reopen now
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Field label="Message for customers" hint="Optional. Shown on the closed page.">
            {(id) => <Textarea id={id} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="We're updating prices. Back tomorrow morning." />}
          </Field>
          <Field label="Reopen automatically at" hint="Optional. Leave empty to reopen by hand." error={err}>
            {(id) => <Input id={id} type="datetime-local" value={reopensAt} onChange={(e) => setReopensAt(e.target.value)} className="sm:max-w-64" />}
          </Field>
          <Toggle checked={showContacts} onChange={setShowContacts} label="Show branch WhatsApp numbers" description="Customers can still chat with a branch while the shop is closed." />
          <div className="flex justify-end">
            <Button variant="danger" onClick={() => setConfirming("close")}>
              <Lock className="size-4" /> Close shop
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={confirming === "close" ? "Close the shop to customers?" : "Reopen the shop?"}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant={confirming === "close" ? "danger" : "primary"} loading={busy} onClick={() => apply(confirming === "open")}>
              {confirming === "close" ? "Close shop" : "Reopen"}
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-soft">
          {confirming === "close"
            ? "Customers will see a closed page and can't order. Products, prices and stock stay as they are, and you can keep editing them. Walk-in sales still work."
            : "Customers will see products and prices again and can order on WhatsApp."}
        </p>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Developer: capacity lock (/super)
// ---------------------------------------------------------------------------

export function CapacityCard({ license }: { license: License | null }) {
  const gate = useShopGate();
  const cfg = { enabled: true, dailyLimit: 50_000, lockAtPercent: 90, afterLock: "manual" as const, ...(license?.capacity ?? {}) };
  const usage = license?.capacityUsage;
  const [limit, setLimit] = useState<string | null>(null);
  const [percent, setPercent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const locked = gate.capacity?.locked === true;
  const reads = usage?.reads ?? 0;
  const pct = Math.min(100, Math.round((reads / cfg.dailyLimit) * 100));

  async function run(action: "save" | "lock" | "unlock" | "check", extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await api.setCapacity({ action, ...extra });
      if (action === "check") toast.success(`Today so far: ${(res.reads ?? 0).toLocaleString()} reads`);
      else if (action === "save") toast.success("Capacity settings saved");
      else toast.success(action === "lock" ? "Shop paused for customers" : "Shop unlocked for the rest of today");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const l = Number(limit ?? cfg.dailyLimit);
    const p = Number(percent ?? cfg.lockAtPercent);
    if (!Number.isInteger(l) || l < 1000) return toast.error("Daily limit: a whole number, 1,000 or more.");
    if (!Number.isInteger(p) || p < 50 || p > 100) return toast.error("Lock at: 50–100%.");
    void run("save", { dailyLimit: l, lockAtPercent: p });
  }

  return (
    <Card className="space-y-4 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Activity className="size-5 text-navy-500" /> Server capacity
          </h2>
          <p className="text-sm text-ink-soft">
            Pauses the shop for customers when today&apos;s database reads near the limit, so free usage doesn&apos;t silently turn into a bill. Staff pages keep working.
          </p>
        </div>
        {locked ? <Badge tone="alert">Shop paused</Badge> : cfg.enabled ? <Badge tone="fresh">Watching</Badge> : <Badge tone="neutral">Off</Badge>}
      </div>

      <div>
        <div className="flex items-end justify-between gap-2">
          <p className="font-display text-2xl font-black">
            {reads.toLocaleString()} <span className="text-base font-medium text-ink-soft">/ {cfg.dailyLimit.toLocaleString()} reads today</span>
          </p>
          <Button variant="ghost" size="sm" loading={busy === "check"} onClick={() => run("check")}>
            <RefreshCw className="size-4" /> Check now
          </Button>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-navy-50">
          <div className={cn("h-full rounded-full", pct >= cfg.lockAtPercent ? "bg-alert" : pct >= 70 ? "bg-sun" : "bg-fresh")} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[12px] text-ink-soft">
          Locks at {cfg.lockAtPercent}% ({Math.floor((cfg.dailyLimit * cfg.lockAtPercent) / 100).toLocaleString()} reads). Day resets at midnight US Pacific (7–8am Ghana).
          {usage?.checkedAt ? ` Checked ${timeAgo(usage.checkedAt)}.` : " Not checked yet."} Checked every 15 minutes; Google&apos;s numbers lag a few minutes.
        </p>
      </div>

      {locked && (
        <p className="rounded-xl bg-alert-soft p-3 text-sm text-alert-ink">
          {gate.capacity?.reason ?? "Locked"}
          {gate.capacity?.at ? ` · ${dateTime(gate.capacity.at)}` : ""}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Daily read limit">
          {(id) => <Input id={id} type="number" inputMode="numeric" min={1000} step={1000} value={limit ?? String(cfg.dailyLimit)} onChange={(e) => setLimit(e.target.value)} />}
        </Field>
        <Field label="Lock at (%)">
          {(id) => <Input id={id} type="number" inputMode="numeric" min={50} max={100} value={percent ?? String(cfg.lockAtPercent)} onChange={(e) => setPercent(e.target.value)} />}
        </Field>
        <Field label="After locking">
          {(id) => (
            <Select id={id} value={cfg.afterLock} onChange={(e) => run("save", { afterLock: e.target.value })}>
              <option value="manual">Stay locked until I unlock</option>
              <option value="auto">Unlock when the day resets</option>
            </Select>
          )}
        </Field>
      </div>
      <Toggle checked={cfg.enabled} onChange={(v) => run("save", { enabled: v })} label="Lock automatically" description="Off = still measured, but the shop is never paused automatically." />

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="secondary" loading={busy === "save"} onClick={save}>
          Save limit
        </Button>
        <div className="ml-auto flex gap-2">
          {locked ? (
            <Button loading={busy === "unlock"} onClick={() => run("unlock")}>
              <LockOpen className="size-4" /> Unlock shop
            </Button>
          ) : (
            <Button variant="danger" loading={busy === "lock"} onClick={() => run("lock")}>
              <Lock className="size-4" /> Pause shop now
            </Button>
          )}
        </div>
      </div>
      <p className="text-[12px] text-ink-soft">Unlocking by hand keeps the shop open for the rest of today&apos;s quota day, even if reads stay above the limit.</p>
    </Card>
  );
}
