"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { BarChart3, ChevronRight, ClipboardCheck, History, KeyRound, MoonStar, ShieldCheck, Users, Warehouse } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useSettings } from "./data";
import { CategoriesCard } from "./Categories";
import { ShopStatusCard } from "./ShopControls";

export function SettingsPanel() {
  const settings = useSettings();
  const { role } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setBusinessName(settings.businessName ?? "");
    setTagline(settings.tagline ?? "");
    setNoticeText(settings.noticeText ?? "");
    setLowStock(String(settings.defaultLowStockPieces ?? 10));
  }, [settings]);

  async function save() {
    const n = Number(lowStock);
    if (!Number.isInteger(n) || n < 0) {
      setErr("Enter a whole number, 0 or more.");
      return;
    }
    setBusy(true);
    try {
      await setDoc(
        doc(db, "settings", "app"),
        { businessName: businessName.trim() || "China-in-Ghana", tagline: tagline.trim(), noticeText: noticeText.trim(), defaultLowStockPieces: n, updatedAt: serverTimestamp() },
        { merge: true },
      );
      toast.success("Settings saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Shop-wide settings for every branch." />

      <ShopStatusCard />

      {/* On phones these pages aren't in the bottom bar. */}
      <Card className="mb-4 overflow-hidden md:hidden">
        {[
          { href: "/admin/inventory", label: "Inventory (all branches)", icon: Warehouse },
          { href: "/admin/reports", label: "Reports", icon: BarChart3 },
          { href: "/admin/stock-takes", label: "Stock takes", icon: ClipboardCheck },
          { href: "/admin/close", label: "Daily close", icon: MoonStar },
          { href: "/admin/staff", label: "Managers", icon: Users },
          { href: "/admin/activity", label: "Activity log", icon: History },
          { href: "/account/password", label: "Change my password", icon: KeyRound },
          ...(role === "superadmin" ? [{ href: "/super", label: "Developer", icon: ShieldCheck }] : []),
        ].map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-0 hover:bg-surface">
            <l.icon className="size-5 text-navy-600" />
            <span className="flex-1 font-medium">{l.label}</span>
            <ChevronRight className="size-4 text-ink-soft" />
          </Link>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-4 p-5 lg:col-span-3">
          <h2 className="font-display text-lg font-bold">Shop</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              {(id) => <Input id={id} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />}
            </Field>
            <Field label="Tagline">
              {(id) => <Input id={id} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Quality home appliances at wholesale prices" />}
            </Field>
          </div>
          <Field label="Notice banner" hint="Shown at the top of the shop. Leave empty to hide it.">
            {(id) => <Textarea id={id} rows={2} value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="Prices may change without notice." />}
          </Field>
          <Field label="Default low-stock alert (pieces)" error={err} hint="Used for products that don't have their own alert level.">
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                className="max-w-40"
                value={lowStock}
                onChange={(e) => {
                  setLowStock(e.target.value);
                  setErr(null);
                }}
              />
            )}
          </Field>
          <div className="flex justify-end">
            <Button loading={busy} onClick={save}>
              Save settings
            </Button>
          </div>
        </Card>

        <CategoriesCard />
      </div>
    </div>
  );
}
