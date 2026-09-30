"use client";

import { useMemo, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { CheckCircle2, LockKeyhole, LockKeyholeOpen, MoonStar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { businessDate, cn, dateTime, ghs } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { DailySummary, Order } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches } from "./data";

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push(businessDate(d));
  }
  return out;
}

function dayLabel(date: string): string {
  if (date === businessDate()) return "Today";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function DailyClosePanel({ fixedBranchId }: { fixedBranchId: string | null }) {
  const { branches, byId } = useAllBranches();
  const [picked, setPicked] = useState("");
  const branchId = fixedBranchId ?? (picked || branches.find((b) => b.active)?.id || "");
  const branch = byId.get(branchId);
  const isAdmin = !fixedBranchId;

  const days = useMemo(() => lastDays(14), []);
  const today = days[0];

  const summaries = useQueryData<DailySummary>(
    branchId ? query(collection(db, "dailySummaries"), where("branchId", "==", branchId), where("date", ">=", days[days.length - 1])) : null,
    `close:${branchId}:${days[days.length - 1]}`,
  ).data;
  const byDate = new Map(summaries.map((s) => [s.date, s]));

  const openOrders = useQueryData<Order>(
    branchId ? query(collection(db, "orders"), where("branchId", "==", branchId), where("status", "in", ["new", "confirmed"])) : null,
    `close:open:${branchId}`,
  ).data;

  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);

  const t = byDate.get(today);

  return (
    <div>
      <PageHeader
        title="Daily close"
        description={branch ? `${branch.name} · end-of-day summary and cash count.` : "Choose a branch."}
        actions={isAdmin && <BranchSelect branches={branches.filter((b) => b.active)} value={branchId} onChange={setPicked} allowAll={false} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales today" value={ghs(t?.salesTotal)} sub={`${t?.salesCount ?? 0} sale(s)`} tone="fresh" />
        <StatCard label="Walk-in" value={ghs(t?.walkinTotal)} />
        <StatCard label="WhatsApp orders" value={ghs(t?.orderTotal)} sub={`${t?.ordersCompleted ?? 0} completed`} />
        <StatCard label="Voids" value={t?.voidCount ?? 0} sub={t?.voidTotal ? ghs(t.voidTotal) : "none"} tone={t?.voidCount ? "alert" : "neutral"} />
      </div>

      <Card className="mt-4 p-5">
        {t?.closed ? (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-fresh-soft text-fresh-ink">
              <CheckCircle2 className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">Today is closed</p>
              <p className="text-sm text-ink-soft">
                By {t.closedByName ?? "staff"} · {dateTime(t.closedAt)}
                {t.cashCounted != null && ` · cash counted ${ghs(t.cashCounted)}`}
              </p>
              {t.closingNote && <p className="mt-1 text-sm">“{t.closingNote}”</p>}
              {(t.salesTotal ?? 0) !== (t.salesAtClose ?? 0) && (
                <p className="mt-1 text-sm text-sun-ink">Sales changed by {ghs((t.salesTotal ?? 0) - (t.salesAtClose ?? 0))} after closing.</p>
              )}
            </div>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setReopening(today)}>
                <LockKeyholeOpen className="size-4" /> Reopen
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-600">
              <MoonStar className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-bold">Ready to close today?</p>
              <p className="text-sm text-ink-soft">
                {openOrders.length > 0
                  ? `${openOrders.length} order(s) are still open. You can close anyway; they stay in Orders.`
                  : "Count the cash, add a note if anything happened, and close the day."}
              </p>
            </div>
            <Button variant="cta" onClick={() => setClosing(today)}>
              <LockKeyhole className="size-4" /> Close today
            </Button>
          </div>
        )}
      </Card>

      <h2 className="mb-2 mt-6 text-sm font-medium text-ink-soft">Last 14 days</h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {days.map((d) => {
            const s = byDate.get(d);
            const hadActivity = !!s && ((s.salesCount ?? 0) > 0 || (s.voidCount ?? 0) > 0);
            return (
              <li key={d} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="w-28 shrink-0">
                  <p className="text-sm font-medium">{dayLabel(d)}</p>
                  <p className="text-[12px] text-ink-soft">{d}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold">{ghs(s?.salesTotal)}</p>
                  <p className="truncate text-[12px] text-ink-soft">
                    {s?.salesCount ?? 0} sale(s)
                    {s?.cashCounted != null && ` · cash ${ghs(s.cashCounted)}`}
                    {s?.closingNote ? ` · ${s.closingNote}` : ""}
                  </p>
                </div>
                {s?.closed ? (
                  <Badge tone="fresh">Closed</Badge>
                ) : d === today ? (
                  <Badge tone="navy">Open</Badge>
                ) : hadActivity ? (
                  <Badge tone="sun">Not closed</Badge>
                ) : (
                  <Badge tone="neutral">No sales</Badge>
                )}
                {d !== today &&
                  (s?.closed ? (
                    isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => setReopening(d)}>
                        Reopen
                      </Button>
                    )
                  ) : (
                    hadActivity && (
                      <Button variant="ghost" size="sm" onClick={() => setClosing(d)}>
                        Close
                      </Button>
                    )
                  ))}
              </li>
            );
          })}
        </ul>
      </Card>

      <CloseDialog branchId={branchId} date={closing} summary={closing ? byDate.get(closing) : undefined} onClose={() => setClosing(null)} />
      <ReopenDialog branchId={branchId} date={reopening} onClose={() => setReopening(null)} />
    </div>
  );
}

function CloseDialog({ branchId, date, summary, onClose }: { branchId: string; date: string | null; summary?: DailySummary; onClose: () => void }) {
  const [cash, setCash] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!date) return null;
  const expectedWalkin = summary?.walkinTotal ?? 0;
  const cashNum = cash.trim() === "" ? null : Number(cash);
  const diff = cashNum != null && Number.isFinite(cashNum) ? cashNum - expectedWalkin : null;

  async function submit() {
    if (!date) return;
    if (cashNum != null && !(cashNum >= 0)) {
      setErr("Enter the cash amount or leave it empty.");
      return;
    }
    setBusy(true);
    try {
      await api.closeDay({ branchId, date, cashCounted: cashNum ?? undefined, note: note.trim() || undefined });
      toast.success(`${dayLabel(date)} closed`);
      setCash("");
      setNote("");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      title={`Close ${dayLabel(date).toLowerCase() === "today" ? "today" : dayLabel(date)}`}
      description={`Total sales ${ghs(summary?.salesTotal)} · walk-in ${ghs(expectedWalkin)}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="cta" loading={busy} onClick={submit}>
            Close day
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Cash counted (GH₵)" hint="Optional. Compare with walk-in sales." error={err}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              value={cash}
              onChange={(e) => {
                setCash(e.target.value);
                setErr(null);
              }}
              placeholder={String(expectedWalkin)}
            />
          )}
        </Field>
        {diff != null && (
          <p className={cn("rounded-xl p-3 text-sm", diff === 0 ? "bg-fresh-soft text-fresh-ink" : "bg-sun-soft text-sun-ink")}>
            {diff === 0 ? "Cash matches walk-in sales." : diff > 0 ? `${ghs(diff)} more than walk-in sales.` : `${ghs(-diff)} short of walk-in sales.`}{" "}
            {diff !== 0 && "Mobile money and order payments can explain a difference; add a note."}
          </p>
        )}
        <Field label="Note" hint="Anything the admin should know.">
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="GH₵500 paid by MoMo" />}
        </Field>
      </div>
    </Modal>
  );
}

function ReopenDialog({ branchId, date, onClose }: { branchId: string; date: string | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!date) return null;
  async function submit() {
    if (!date) return;
    setBusy(true);
    try {
      await api.reopenDay({ branchId, date });
      toast.success(`${dayLabel(date)} reopened`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={!!date}
      onClose={onClose}
      title={`Reopen ${dayLabel(date)}?`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Reopen
          </Button>
        </div>
      }
    >
      <p className="text-[15px] text-ink-soft">The branch manager can then close it again with a new cash count and note.</p>
    </Modal>
  );
}
