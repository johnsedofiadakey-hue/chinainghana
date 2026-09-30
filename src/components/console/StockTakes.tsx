"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { CheckCircle2, ClipboardCheck, ClipboardList, RotateCcw, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/store/bits";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { cn, dateTime, ghs, stockLabel } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Product, StockTake, StockTakeStatus } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches, useCategories } from "./data";

type Draft = Record<string, { boxes: string; pieces: string }>;

function statusBadge(s: StockTakeStatus) {
  if (s === "approved") return <Badge tone="fresh">Approved</Badge>;
  if (s === "rejected") return <Badge tone="alert">Rejected</Badge>;
  if (s === "applying") return <Badge tone="sun">Applying…</Badge>;
  return <Badge tone="orange">Waiting for approval</Badge>;
}

function variance(n: number, qtyPerBox: number, unitLabel: string) {
  if (n === 0) return "—";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${stockLabel(Math.abs(n), qtyPerBox, unitLabel)}`;
}

function readDraft(key: string): Draft {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Draft;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Manager: count sheet + history
// ---------------------------------------------------------------------------

export function StockTakeSheet({ branchId }: { branchId: string }) {
  const [tab, setTab] = useState<"count" | "history">("count");
  const categories = useCategories();
  const { data: products, loading } = useQueryData<Product>(query(collection(db, "products"), where("branchId", "==", branchId)), `take:products:${branchId}`);
  const takes = useQueryData<StockTake>(
    query(collection(db, "stockTakes"), where("branchId", "==", branchId), orderBy("createdAt", "desc"), limit(30)),
    `take:list:${branchId}`,
  ).data;

  const draftKey = `cig.stocktake.${branchId}`;
  const [draft, setDraftState] = useState<Draft>({});
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<StockTake | null>(null);

  // Counts are kept on this device until submitted, so nothing is lost if the connection drops.
  useEffect(() => setDraftState(readDraft(draftKey)), [draftKey]);
  const setDraft = (next: Draft) => {
    setDraftState(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryId, search]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const counted = Object.entries(draft).filter(([id, v]) => byId.has(id) && (v.boxes.trim() !== "" || v.pieces.trim() !== ""));
  const pending = takes.some((t) => t.status === "submitted" || t.status === "applying");

  function update(id: string, patch: Partial<{ boxes: string; pieces: string }>) {
    const cur = draft[id] ?? { boxes: "", pieces: "" };
    setDraft({ ...draft, [id]: { ...cur, ...patch } });
  }

  async function submit() {
    const lines = counted.map(([productId, v]) => {
      const p = byId.get(productId)!;
      const boxes = Math.max(0, Math.floor(Number(v.boxes) || 0));
      const pieces = Math.max(0, Math.floor(Number(v.pieces) || 0));
      return { productId, countedPieces: boxes * p.qtyPerBox + pieces };
    });
    setBusy(true);
    try {
      const scope = categoryId ? (categories.find((c) => c.id === categoryId)?.name ?? "One category") : "All products";
      const res = await api.submitStockTake({ branchId, scope, note: note.trim() || undefined, lines });
      setDraft({});
      setNote("");
      setConfirming(false);
      setTab("history");
      toast.success(res.varianceLines ? `Submitted · ${res.varianceLines} difference(s) for the admin to approve` : "Submitted · everything matches");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Stock take" description="Count what's on the shelves. The admin approves any differences before stock changes." />

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-white p-1 ring-1 ring-inset ring-line sm:max-w-sm">
        {(["count", "history"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn("rounded-lg py-2 text-sm font-medium", tab === k ? "bg-navy-700 text-white" : "text-ink-soft hover:bg-navy-50")}
          >
            {k === "count" ? "Count sheet" : `History${pending ? " •" : ""}`}
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <TakeList takes={takes} onOpen={setViewing} empty="No stock takes yet." />
      ) : loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <Input className="h-10 pl-9" placeholder="Find a product" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="h-10 rounded-xl bg-white px-3 text-sm ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
              aria-label="Category"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {list.length === 0 ? (
            <Card>
              <EmptyState icon={<ClipboardList className="size-6" />} title="No products" body="Add products first, then count them here." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {list.map((p) => {
                  const v = draft[p.id] ?? { boxes: "", pieces: "" };
                  const done = v.boxes.trim() !== "" || v.pieces.trim() !== "";
                  return (
                    <li key={p.id} className={cn("flex items-center gap-3 px-4 py-3", done && "bg-fresh-soft/40")}>
                      <ProductImage src={p.thumbUrl ?? p.imageUrl} alt={p.name} className="size-11 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-[12px] text-ink-soft">
                          {p.code} · {p.qtyPerBox} {p.unitLabel}s/box
                        </p>
                      </div>
                      <label className="flex flex-col items-center text-[11px] text-ink-soft">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={v.boxes}
                          onChange={(e) => update(p.id, { boxes: e.target.value })}
                          className="h-10 w-16 rounded-lg bg-white text-center text-[15px] text-navy-900 ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
                          aria-label={`Boxes of ${p.name}`}
                        />
                        boxes
                      </label>
                      <label className="flex flex-col items-center text-[11px] text-ink-soft">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={v.pieces}
                          onChange={(e) => update(p.id, { pieces: e.target.value })}
                          className="h-10 w-16 rounded-lg bg-white text-center text-[15px] text-navy-900 ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
                          aria-label={`Loose pieces of ${p.name}`}
                        />
                        {p.unitLabel}s
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <div className="sticky bottom-20 z-20 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-navy-900 p-3 pl-4 text-white shadow-[var(--shadow-float)] md:bottom-4">
            <div>
              <p className="font-display font-bold">
                {counted.length} of {products.length} counted
              </p>
              <p className="text-[12px] text-navy-200">Saved on this phone until you submit.</p>
            </div>
            <div className="flex gap-2">
              {counted.length > 0 && (
                <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setDraft({})} aria-label="Clear counts">
                  <RotateCcw className="size-4" />
                </Button>
              )}
              <Button variant="cta" disabled={!counted.length || pending} onClick={() => setConfirming(true)}>
                Submit
              </Button>
            </div>
          </div>
          {pending && <p className="mt-2 text-center text-[13px] text-ink-soft">Your last stock take is waiting for approval. You can submit again once it&apos;s reviewed.</p>}
        </>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit stock take?"
        description={`${counted.length} product(s) counted. Products left blank aren't changed.`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep counting
            </Button>
            <Button variant="cta" loading={busy} onClick={submit}>
              Submit
            </Button>
          </div>
        }
      >
        <Field label="Note" hint="Optional">
          {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Monthly count, back store included" />}
        </Field>
      </Modal>

      <TakeDetail take={viewing} onClose={() => setViewing(null)} canReview={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: review
// ---------------------------------------------------------------------------

export function StockTakeReview() {
  const { branches, byId } = useAllBranches();
  const [scope, setScope] = useState("all");
  const [onlyPending, setOnlyPending] = useState(true);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: takes, loading } = useQueryData<StockTake>(
    scope === "all"
      ? query(collection(db, "stockTakes"), orderBy("createdAt", "desc"), limit(100))
      : query(collection(db, "stockTakes"), where("branchId", "==", scope), orderBy("createdAt", "desc"), limit(100)),
    `takes:${scope}`,
  );
  const shown = takes.filter((t) => !onlyPending || t.status === "submitted" || t.status === "applying");
  const viewing = takes.find((t) => t.id === viewingId) ?? null;

  return (
    <div>
      <PageHeader
        title="Stock takes"
        description="Managers' counts. Approving adds each difference to the branch's current stock."
        actions={<BranchSelect branches={branches} value={scope} onChange={setScope} />}
      />
      <div className="mb-4 flex gap-1.5">
        {[
          [true, "Waiting"],
          [false, "All"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setOnlyPending(v as boolean)}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-medium",
              onlyPending === v ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50",
            )}
          >
            {label as string}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : <TakeList takes={shown} onOpen={(t) => setViewingId(t.id)} branchName={(id) => byId.get(id)?.name} empty={onlyPending ? "Nothing waiting for approval." : "No stock takes yet."} />}
      <TakeDetail take={viewing} onClose={() => setViewingId(null)} canReview branchName={viewing ? byId.get(viewing.branchId)?.name : undefined} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function TakeList({ takes, onOpen, branchName, empty }: { takes: StockTake[]; onOpen: (t: StockTake) => void; branchName?: (id: string) => string | undefined; empty: string }) {
  if (!takes.length) {
    return (
      <Card>
        <EmptyState icon={<ClipboardCheck className="size-6" />} title={empty} />
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {takes.map((t) => (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-600">
                <ClipboardCheck className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.scope}</span>
                  {statusBadge(t.status)}
                </span>
                <span className="block truncate text-[13px] text-ink-soft">
                  {branchName?.(t.branchId) ? `${branchName(t.branchId)} · ` : ""}
                  {t.productsCounted} counted · {t.varianceLines} difference(s) · {t.submittedByName} · {dateTime(t.createdAt)}
                </span>
              </span>
              <span className={cn("font-display font-bold", t.varianceValue < 0 ? "text-alert-ink" : t.varianceValue > 0 ? "text-fresh-ink" : "")}>
                {t.varianceValue > 0 ? "+" : ""}
                {ghs(t.varianceValue)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TakeDetail({ take, onClose, canReview, branchName }: { take: StockTake | null; onClose: () => void; canReview: boolean; branchName?: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (!take) return null;
  const reviewable = canReview && (take.status === "submitted" || take.status === "applying");
  const lines = showAll ? take.lines : take.lines.filter((l) => l.variance !== 0);

  async function review(approve: boolean) {
    if (!take) return;
    if (!approve && note.trim().length < 3) {
      toast.error("Give the manager a reason for rejecting.");
      return;
    }
    setBusy(approve ? "approve" : "reject");
    try {
      const res = await api.reviewStockTake({ id: take.id, approve, note: note.trim() || undefined });
      toast.success(approve ? `Approved · ${res.applied} product(s) updated` : "Rejected");
      setNote("");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={!!take}
      onClose={onClose}
      title={`Stock take · ${take.scope}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {statusBadge(take.status)} {branchName ? `${branchName} · ` : ""}
          {take.submittedByName} · {dateTime(take.createdAt)}
        </span>
      }
      size="lg"
      footer={
        reviewable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" className="text-alert-ink hover:bg-alert-soft" loading={busy === "reject"} onClick={() => review(false)}>
              <XCircle className="size-4" /> Reject
            </Button>
            <Button className="ml-auto" loading={busy === "approve"} onClick={() => review(true)}>
              <CheckCircle2 className="size-4" /> Approve and update stock
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[12px] text-ink-soft">Counted</p>
            <p className="font-display text-lg font-bold">{take.productsCounted}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[12px] text-ink-soft">Differences</p>
            <p className="font-display text-lg font-bold">{take.varianceLines}</p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-[12px] text-ink-soft">Value</p>
            <p className={cn("font-display text-lg font-bold", take.varianceValue < 0 ? "text-alert-ink" : take.varianceValue > 0 ? "text-fresh-ink" : "")}>{ghs(take.varianceValue)}</p>
          </div>
        </div>
        {take.note && <p className="rounded-xl bg-sun-soft p-3 text-sm text-sun-ink">Manager&apos;s note: {take.note}</p>}
        {take.reviewNote && <p className="rounded-xl bg-navy-50 p-3 text-sm">Admin&apos;s note: {take.reviewNote}</p>}

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{showAll ? "All counted products" : "Differences"}</p>
          <button type="button" className="text-sm font-medium text-navy-600 hover:underline" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Only differences" : "Show all"}
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-xl bg-fresh-soft p-3 text-sm text-fresh-ink">Everything counted matches the system.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-line">
            <table className="w-full text-[13px]">
              <thead className="bg-surface text-left text-[12px] text-ink-soft">
                <tr>
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Expected</th>
                  <th className="px-2 py-2 font-medium">Counted</th>
                  <th className="px-2 py-2 text-right font-medium">Difference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l) => (
                  <tr key={l.productId}>
                    <td className="px-2 py-2">
                      <span className="block font-medium">{l.name}</span>
                      <span className="text-[12px] text-ink-soft">{l.code}</span>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{stockLabel(l.expectedPieces, l.qtyPerBox, l.unitLabel) || "0"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{stockLabel(l.countedPieces, l.qtyPerBox, l.unitLabel) || "0"}</td>
                    <td className={cn("px-2 py-2 text-right font-medium whitespace-nowrap", l.variance < 0 ? "text-alert-ink" : l.variance > 0 ? "text-fresh-ink" : "")}>
                      {variance(l.variance, l.qtyPerBox, l.unitLabel)}
                      {l.variance !== 0 && <span className="block text-[12px] font-normal text-ink-soft">{ghs(Math.round(l.variance * l.unitCost * 100) / 100)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reviewable && (
          <Field label="Note to the manager" hint="Required when rejecting.">
            {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Recount the kettles in the back store" />}
          </Field>
        )}
      </div>
    </Modal>
  );
}
