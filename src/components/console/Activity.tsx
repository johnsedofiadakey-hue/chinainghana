"use client";

import { useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { Ban, Boxes, Building2, History, KeyRound, Lock, LockOpen, Receipt, ShoppingCart, Users } from "lucide-react";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { db } from "@/lib/firebase";
import { cn, dateTime, ghs, toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { AuditEntry, StaffUser } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches } from "./data";

type Icon = React.ComponentType<{ className?: string }>;

const ACTIONS: Record<string, { label: string; icon: Icon; tone?: "alert" | "fresh" }> = {
  "branch.create": { label: "Added a branch", icon: Building2, tone: "fresh" },
  "staff.create": { label: "Created a manager login", icon: Users, tone: "fresh" },
  "staff.update": { label: "Updated a manager", icon: Users },
  "admin.set": { label: "Set the admin login", icon: KeyRound },
  "order.complete": { label: "Completed an order", icon: ShoppingCart, tone: "fresh" },
  "sale.record": { label: "Recorded a walk-in sale", icon: Receipt, tone: "fresh" },
  "sale.void": { label: "Voided a sale", icon: Ban, tone: "alert" },
  "shop.close": { label: "Closed the shop to customers", icon: Lock, tone: "alert" },
  "shop.open": { label: "Reopened the shop", icon: LockOpen, tone: "fresh" },
  "capacity.lock": { label: "Paused the shop (capacity)", icon: Lock, tone: "alert" },
  "capacity.unlock": { label: "Lifted the capacity pause", icon: LockOpen, tone: "fresh" },
  "capacity.settings": { label: "Changed capacity settings", icon: History },
  "stock.receive": { label: "Received stock", icon: Boxes },
  "stock.adjust": { label: "Corrected stock", icon: Boxes },
  "stock.count": { label: "Stock take", icon: Boxes },
};

function describe(e: AuditEntry): string | null {
  const d = e.details ?? {};
  const parts: string[] = [];
  const pick = (k: string) => (typeof d[k] === "string" || typeof d[k] === "number" ? String(d[k]) : null);
  const name = pick("name") ?? pick("product") ?? pick("username");
  if (name) parts.push(name);
  const no = pick("orderNo") ?? pick("receiptNo");
  if (no) parts.push(`#${no}`);
  if (typeof d.total === "number") parts.push(ghs(d.total));
  if (typeof d.from === "number" && typeof d.to === "number") parts.push(`${d.from} → ${d.to} pcs`);
  if (d.active === false) parts.push("suspended");
  if (d.active === true) parts.push("reactivated");
  if (d.newPassword) parts.push("password reset");
  const reason = pick("reason");
  if (reason) parts.push(`“${reason}”`);
  return parts.length ? parts.join(" · ") : null;
}

export function ActivityPanel() {
  const { branches, byId } = useAllBranches();
  const [scope, setScope] = useState("all");

  const { data: entries, loading } = useQueryData<AuditEntry>(
    scope === "all"
      ? query(collection(db, "auditLog"), orderBy("at", "desc"), limit(200))
      : query(collection(db, "auditLog"), where("branchId", "==", scope), orderBy("at", "desc"), limit(200)),
    `audit:${scope}`,
  );
  const staff = useQueryData<StaffUser>(collection(db, "users"), "audit:users").data;
  const names = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);

  // Group by day for easier scanning.
  const days = useMemo(() => {
    const out: { day: string; items: AuditEntry[] }[] = [];
    for (const e of entries) {
      const d = toDate(e.at);
      const day = d ? d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "Just now";
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <div>
      <PageHeader title="Activity log" description="Who did what, across every branch." actions={<BranchSelect branches={branches} value={scope} onChange={setScope} />} />

      {loading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon={<History className="size-6" />} title="No activity yet" body="Sales, voids, stock changes and account changes are recorded here." />
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 text-sm font-medium text-ink-soft">{g.day}</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {g.items.map((e) => {
                    const meta = ACTIONS[e.action] ?? { label: e.action, icon: History };
                    const detail = describe(e);
                    return (
                      <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                        <span
                          className={cn(
                            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                            meta.tone === "alert" ? "bg-alert-soft text-alert-ink" : meta.tone === "fresh" ? "bg-fresh-soft text-fresh-ink" : "bg-navy-50 text-navy-600",
                          )}
                        >
                          <meta.icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-medium">{names.get(e.actorUid) ?? "Someone"}</span> <span className="text-ink-soft">{meta.label.toLowerCase()}</span>
                          </p>
                          {detail && <p className="truncate text-[13px] text-navy-900">{detail}</p>}
                          <p className="text-[12px] text-ink-soft">
                            {dateTime(e.at)}
                            {e.branchId && byId.get(e.branchId) ? ` · ${byId.get(e.branchId)?.name}` : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
