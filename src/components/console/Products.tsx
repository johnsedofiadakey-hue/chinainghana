"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { addDoc, collection, doc, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { Boxes, Copy, Eye, EyeOff, Gift, Package, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { AvailabilityBadge, ProductImage } from "@/components/store/bits";
import { errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { availability, cn, ghs, isSingle, stockLabel } from "@/lib/format";
import { giftStatus } from "@/lib/gift";
import { useQueryData } from "@/lib/hooks";
import type { Branch, Product } from "@/lib/types";
import { BranchSelect } from "./BranchSelect";
import { useAllBranches, useCategories, useSettings } from "./data";
import { ProductForm } from "./ProductForm";
import { exportProducts, ImportDialog, SheetButtons } from "./ProductSheetIO";
import { StockDialog } from "./StockDialog";

type Filter = "all" | "low" | "out" | "hidden";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low", label: "Low stock" },
  { key: "out", label: "Out of stock" },
  { key: "hidden", label: "Hidden" },
];

function ProductsInner({ fixedBranchId }: { fixedBranchId: string | null }) {
  const params = useSearchParams();
  const { branches, byId } = useAllBranches();
  const categories = useCategories();
  const settings = useSettings();
  const defaultLow = settings?.defaultLowStockPieces ?? 10;

  const [picked, setPicked] = useState("");
  const branchId = fixedBranchId ?? (picked || branches.find((b) => b.active)?.id || branches[0]?.id || "");
  const branch = byId.get(branchId) ?? null;

  const initialFilter = params.get("filter");
  const [filter, setFilter] = useState<Filter>(initialFilter === "low" || initialFilter === "out" || initialFilter === "hidden" ? initialFilter : "all");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [stockId, setStockId] = useState<string | null>(null);
  const [copying, setCopying] = useState<Product | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: products, loading } = useQueryData<Product>(
    branchId ? query(collection(db, "products"), where("branchId", "==", branchId)) : null,
    `products:${branchId}`,
  );

  // Keep dialogs pointed at the live document so stock changes show instantly.
  const stockProduct = products.find((p) => p.id === stockId) ?? null;

  const counts = useMemo(
    () => ({
      low: products.filter((p) => availability(p, defaultLow) === "low").length,
      out: products.filter((p) => p.stockPieces <= 0).length,
      hidden: products.filter((p) => !p.visible).length,
    }),
    [products, defaultLow],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (filter === "low") return availability(p, defaultLow) === "low";
        if (filter === "out") return p.stockPieces <= 0;
        if (filter === "hidden") return !p.visible;
        return true;
      })
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, filter, categoryId, search, defaultLow]);

  const usedCategories = categories.filter((c) => products.some((p) => p.categoryId === c.id));

  async function doExport() {
    setExporting(true);
    try {
      await exportProducts(products, categories, branch?.name ?? "branch");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't create the spreadsheet.");
    } finally {
      setExporting(false);
    }
  }

  async function toggleVisible(p: Product) {
    try {
      await updateDoc(doc(db, "products", p.id), { visible: !p.visible, updatedAt: serverTimestamp() });
      toast.success(p.visible ? `${p.name} hidden from the shop` : `${p.name} is back in the shop`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description={branch ? `${branch.name} · prices and stock for this branch only.` : "Choose a branch."}
        actions={
          <>
            {!fixedBranchId && <BranchSelect branches={branches} value={branchId} onChange={setPicked} allowAll={false} />}
            {branchId && <SheetButtons onImport={() => setImportOpen(true)} onExport={doExport} exporting={exporting} />}
            {!fixedBranchId && branches.length > 1 && (
              <Button variant="secondary" disabled={!filtered.length} onClick={() => setBulkOpen(true)}>
                <Copy className="size-4" /> Copy to branch
              </Button>
            )}
            <Button
              variant="cta"
              disabled={!branchId}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" /> Add product
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? products.length : counts[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition",
                  filter === f.key ? "bg-navy-700 text-white" : "bg-white text-navy-800 ring-1 ring-inset ring-line hover:bg-navy-50",
                )}
              >
                {f.label}
                <span className={cn("ml-1.5 text-[12px]", filter === f.key ? "text-navy-200" : "text-ink-soft")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            placeholder="Name or code"
            className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[15px] ring-1 ring-inset ring-line placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-navy-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {usedCategories.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", !categoryId ? "bg-fresh-soft text-fresh-ink" : "text-ink-soft hover:bg-white")}
          >
            All categories
          </button>
          {usedCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-[13px] font-medium",
                categoryId === c.id ? "bg-fresh-soft text-fresh-ink" : "text-ink-soft hover:bg-white",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="size-6" />}
            title={products.length === 0 ? "No products yet" : "Nothing matches"}
            body={products.length === 0 ? "Add the first product for this branch. Customers see it in the shop straight away." : "Try another filter or search."}
            action={
              products.length === 0 && branchId ? (
                <Button
                  variant="cta"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add product
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtered.map((p) => {
              const av = availability(p, defaultLow);
              return (
                <li key={p.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap", !p.visible && "bg-surface/60")}>
                  <button type="button" onClick={() => { setEditing(p); setFormOpen(true); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ProductImage src={p.thumbUrl ?? p.imageUrl} alt={p.name} className={cn("size-14 shrink-0 rounded-xl", !p.visible && "opacity-50")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium text-navy-900">{p.name}</span>
                        {giftStatus(p.freeGift) && giftStatus(p.freeGift) !== "ended" && (
                          <Badge tone={giftStatus(p.freeGift) === "active" ? "alert" : "neutral"}>
                            <Gift className="size-3" aria-hidden /> {p.freeGift!.name}
                          </Badge>
                        )}
                        {p.tags?.includes("hot") && <Badge tone="sun">Hot</Badge>}
                        {p.tags?.includes("new") && <Badge tone="navy">New</Badge>}
                        {!p.visible && <Badge tone="neutral">Hidden</Badge>}
                      </span>
                      <span className="block text-[13px] text-ink-soft">
                        {p.code} · {isSingle(p.qtyPerBox) ? `${ghs(p.boxPrice)} each` : `${p.qtyPerBox} ${p.unitLabel}s/box · ${ghs(p.boxPrice)}/box`}
                        {p.sellByPiece && p.piecePrice != null ? ` · ${ghs(p.piecePrice)}/${p.unitLabel}` : ""}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                        <AvailabilityBadge value={av} />
                        <span className="text-navy-900">{stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) || "0"}</span>
                      </span>
                    </span>
                  </button>
                  <div className="flex w-full shrink-0 justify-end gap-1 sm:w-auto">
                    <Button variant="secondary" size="sm" onClick={() => setStockId(p.id)}>
                      <Boxes className="size-4" /> Stock
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setFormOpen(true); }} aria-label={`Edit ${p.name}`}>
                      <Pencil className="size-4" />
                      <span className="sm:hidden">Edit</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleVisible(p)} aria-label={p.visible ? `Hide ${p.name}` : `Show ${p.name}`} title={p.visible ? "Hide from shop" : "Show in shop"}>
                      {p.visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    {!fixedBranchId && branches.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setCopying(p)} aria-label={`Copy ${p.name} to other branches`} title="Copy to other branches">
                        <Copy className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {branchId && (
        <ProductForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          branchId={branchId}
          branchName={branch?.name ?? ""}
          product={editing}
          categories={categories}
        />
      )}
      <StockDialog product={stockProduct} onClose={() => setStockId(null)} />
      <CopyDialog product={copying} branches={branches} onClose={() => setCopying(null)} />
      {!fixedBranchId && (
        <BulkCopyDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          products={filtered}
          narrowed={filtered.length !== products.length}
          source={branch}
          branches={branches}
        />
      )}
      {branchId && <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} branchId={branchId} branchName={branch?.name ?? ""} products={products} />}
    </div>
  );
}

/** Admin: copies a product (details, prices, photo) to other branches with zero stock. */
function CopyDialog({ product, branches, onClose }: { product: Product | null; branches: Branch[]; onClose: () => void }) {
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const others = branches.filter((b) => b.id !== product?.branchId);
  const code = product?.code ?? "";

  // Branches that already carry this code are skipped.
  const { data: existing } = useQueryData<Product>(code ? query(collection(db, "products"), where("code", "==", code)) : null, `copy:${code}`);
  const hasIt = new Set(existing.map((p) => p.branchId));

  useEffect(() => setTargets([]), [product?.id]);

  if (!product) return null;

  async function copy() {
    if (!product || !targets.length) return;
    setBusy(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, branchId, stockPieces, updatedAt, ...rest } = product;
      await Promise.all(
        targets.map((b) =>
          addDoc(collection(db, "products"), {
            ...rest,
            branchId: b,
            stockPieces: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      );
      toast.success(`Copied to ${targets.length} branch${targets.length === 1 ? "" : "es"}. Stock starts at 0.`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      title="Copy to other branches"
      description={`${product.name} · ${product.code}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!targets.length} onClick={copy}>
            Copy
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-ink-soft">Name, prices, photo and settings are copied. Stock starts at 0; each branch can then change its own prices.</p>
      <ul className="space-y-2">
        {others.map((b) => {
          const already = hasIt.has(b.id);
          const checked = targets.includes(b.id);
          return (
            <li key={b.id}>
              <label className={cn("flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset ring-line", already ? "opacity-60" : "cursor-pointer hover:bg-surface")}>
                <input
                  type="checkbox"
                  className="size-4 accent-navy-700"
                  disabled={already}
                  checked={checked}
                  onChange={(e) => setTargets((t) => (e.target.checked ? [...t, b.id] : t.filter((x) => x !== b.id)))}
                />
                <span className="flex-1 text-sm font-medium">{b.name}</span>
                {already && <Badge tone="neutral">Already has it</Badge>}
                {!b.active && <Badge tone="neutral">Inactive</Badge>}
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export function ProductsPanel({ fixedBranchId }: { fixedBranchId: string | null }) {
  return (
    <Suspense fallback={<Spinner />}>
      <ProductsInner fixedBranchId={fixedBranchId} />
    </Suspense>
  );
}

/**
 * Admin: copies every product currently shown (all, or whatever the search/filters narrow it to)
 * into another branch in one go. Photos, prices and settings come along; stock starts at 0.
 * Products the target branch already has (same code) are skipped.
 */
function BulkCopyDialog({
  open,
  onClose,
  products,
  narrowed,
  source,
  branches,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  narrowed: boolean;
  source: Branch | null;
  branches: Branch[];
}) {
  const others = branches.filter((b) => b.id !== source?.id);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (open) {
      setTarget(others.length === 1 ? others[0].id : "");
      setProgress(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: targetProducts, loading } = useQueryData<Product>(
    open && target ? query(collection(db, "products"), where("branchId", "==", target)) : null,
    `bulkcopy:${target}`,
  );
  const existingCodes = useMemo(() => new Set(targetProducts.map((p) => p.code.trim().toUpperCase())), [targetProducts]);
  const toCopy = useMemo(() => products.filter((p) => !existingCodes.has(p.code.trim().toUpperCase())), [products, existingCodes]);
  const skipped = products.length - toCopy.length;
  const targetName = branches.find((b) => b.id === target)?.name ?? "";

  async function copyAll() {
    if (!target || !toCopy.length) return;
    setBusy(true);
    setProgress(0);
    try {
      // Firestore batches hold up to 500 writes; stay well under.
      for (let i = 0; i < toCopy.length; i += 200) {
        const batch = writeBatch(db);
        for (const product of toCopy.slice(i, i + 200)) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, branchId, stockPieces, updatedAt, ...rest } = product;
          batch.set(doc(collection(db, "products")), {
            ...rest,
            branchId: target,
            stockPieces: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        setProgress(Math.min(i + 200, toCopy.length));
      }
      toast.success(`${toCopy.length} product${toCopy.length === 1 ? "" : "s"} copied to ${targetName}. Stock starts at 0.`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Copy products to another branch"
      description={source ? `From ${source.name}` : undefined}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          {busy && (
            <span className="mr-auto text-[13px] text-ink-soft">
              {progress} / {toCopy.length}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!target || loading || !toCopy.length} onClick={copyAll}>
            {target && !loading ? `Copy ${toCopy.length} product${toCopy.length === 1 ? "" : "s"}` : "Copy"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          {narrowed
            ? `Copies the ${products.length} product${products.length === 1 ? "" : "s"} shown in the list right now (your search or filters). Clear them to copy everything.`
            : `Copies all ${products.length} product${products.length === 1 ? "" : "s"} from this branch.`}{" "}
          Names, codes, photos, prices and promos come along. Stock starts at 0, and the other branch can change its own prices afterwards.
        </p>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-navy-900">Copy to</legend>
          {others.map((b) => (
            <label key={b.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 ring-inset", target === b.id ? "bg-navy-50/60 ring-2 ring-navy-600" : "ring-line hover:bg-surface")}>
              <input type="radio" name="bulk-target" className="size-4 accent-navy-700" checked={target === b.id} onChange={() => setTarget(b.id)} disabled={busy} />
              <span className="flex-1 text-sm font-medium">{b.name}</span>
              {!b.active && <Badge tone="neutral">Inactive</Badge>}
            </label>
          ))}
        </fieldset>
        {target && !loading && (
          <div className="rounded-xl bg-surface p-3 text-sm">
            <p>
              <span className="font-semibold text-navy-900">{toCopy.length}</span> will be copied to {targetName}.
            </p>
            {skipped > 0 && (
              <p className="mt-0.5 text-ink-soft">
                {skipped} skipped: {targetName} already has a product with the same code.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
