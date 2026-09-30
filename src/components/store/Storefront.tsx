"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, query, where } from "firebase/firestore";
import { ChevronDown, Flame, Gift, Info, Lock, MapPin, PackageSearch, Search, ShoppingBag, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Spinner } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/firebase";
import { availability, boxWord, cn, ghs, isSingle, priceSuffix, stockLabel } from "@/lib/format";
import { giftStatus } from "@/lib/gift";
import { distanceKm, formatKm, getDevicePosition, type LatLng } from "@/lib/geo";
import { useDocData, useLocalState, useQueryData } from "@/lib/hooks";
import type { AppSettings, Branch, Category, Product } from "@/lib/types";
import { cartKey, useBranchCart, useCart } from "@/store/cart";
import { AvailabilityBadge, GiftTag, ProductImage, QtyStepper } from "./bits";
import { BranchPicker, LocationPrompt, type BranchWithDistance, type LocateStep } from "./BranchPicker";
import { CartSheet, useResolvedCart } from "./CartSheet";
import { ProductSheet } from "./ProductSheet";

type LocStatus = "idle" | "ok" | "denied" | "error";

function readSessionPos(): LatLng | null {
  try {
    const raw = sessionStorage.getItem("cig.pos");
    return raw ? (JSON.parse(raw) as LatLng) : null;
  } catch {
    return null;
  }
}

export function Storefront({ initialSlug }: { initialSlug?: string }) {
  const settings = useDocData<AppSettings>("settings/app").data;
  const defaultLow = settings?.defaultLowStockPieces ?? 10;

  const branchesQ = useQueryData<Branch>(query(collection(db, "branches"), where("active", "==", true)), "branches:active");
  const categories = useQueryData<Category>(collection(db, "categories"), "categories").data;

  const [savedBranchId, setSavedBranchId, storageReady] = useLocalState<string | null>("cig.branch", null);
  const [pos, setPos] = useState<LatLng | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>("idle");
  const [locating, setLocating] = useState(false);
  const [promptStep, setPromptStep] = useState<LocateStep | null>(null);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);

  const branches: BranchWithDistance[] = useMemo(() => {
    const list = branchesQ.data.map((b) => ({ ...b, distanceKm: pos ? distanceKm(pos, b) : null }));
    return list.sort((a, b) =>
      a.distanceKm != null && b.distanceKm != null ? a.distanceKm - b.distanceKm : (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
  }, [branchesQ.data, pos]);

  // Restore a location found earlier in this session. If the visitor already allowed location
  // on an earlier visit, refresh it quietly (no prompt) so distances show again.
  useEffect(() => {
    const p = readSessionPos();
    if (p) {
      setPos(p);
      setLocStatus("ok");
      return;
    }
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((perm) => {
        if (perm.state !== "granted") return;
        return getDevicePosition().then((found) => {
          setPos(found);
          setLocStatus("ok");
          try {
            sessionStorage.setItem("cig.pos", JSON.stringify(found));
          } catch {
            /* ignore */
          }
        });
      })
      .catch(() => undefined);
  }, []);

  // Branch from the URL (/b/[slug]) wins, then the saved one; otherwise ask.
  useEffect(() => {
    if (!storageReady || branchesQ.loading) return;
    if (initialSlug) {
      const b = branchesQ.data.find((x) => x.slug === initialSlug);
      if (b) {
        if (b.id !== savedBranchId) setSavedBranchId(b.id);
        return;
      }
    }
    const saved = branchesQ.data.find((x) => x.id === savedBranchId);
    // First visit: ask for location straight away (even with one branch, to show the distance).
    if (!saved && branchesQ.data.length) void locate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageReady, branchesQ.loading, initialSlug]);

  const branch = branches.find((b) => b.id === savedBranchId) ?? null;

  /**
   * Finds the nearest branch. From the first-visit flow (`fromPrompt`) it walks the prompt through
   * asking → found / denied / error; from the branch list it just re-sorts and selects.
   */
  async function locate(fromPrompt = false) {
    setLocating(true);
    if (fromPrompt) setPromptStep("asking");
    try {
      const p = await getDevicePosition();
      setPos(p);
      setLocStatus("ok");
      try {
        sessionStorage.setItem("cig.pos", JSON.stringify(p));
      } catch {
        /* ignore */
      }
      const nearest = [...branchesQ.data].sort((a, b) => distanceKm(p, a) - distanceKm(p, b))[0];
      if (nearest) {
        setSavedBranchId(nearest.id);
        setSuggestedId(nearest.id);
        if (fromPrompt) setPromptStep("found");
        else toast.success(`Nearest branch: ${nearest.name} (${formatKm(distanceKm(p, nearest))} away)`);
      } else if (fromPrompt) {
        setPromptStep(null);
      }
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setLocStatus(denied ? "denied" : "error");
      if (fromPrompt) setPromptStep(denied ? "denied" : "error");
      else toast.error(denied ? "Location is blocked for this site. Choose your branch from the list." : "Couldn't get your location. Choose your branch from the list.");
    } finally {
      setLocating(false);
    }
  }

  const productsQ = useQueryData<Product>(
    branch ? query(collection(db, "products"), where("branchId", "==", branch.id), where("visible", "==", true)) : null,
    `products:${branch?.id ?? "none"}`,
  );

  const usedCategories = useMemo(() => {
    const ids = new Set(productsQ.data.map((p) => p.categoryId));
    return categories.filter((c) => ids.has(c.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, productsQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productsQ.data
      .filter((p) => !categoryId || p.categoryId === categoryId)
      .filter((p) => !inStockOnly || p.stockPieces > 0)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .sort((a, b) => {
        const ao = a.stockPieces > 0 ? 0 : 1;
        const bo = b.stockPieces > 0 ? 0 : 1;
        return ao - bo || a.name.localeCompare(b.name);
      });
  }, [productsQ.data, categoryId, inStockOnly, search]);

  const { lines, total } = useResolvedCart(branch?.id ?? null, productsQ.data);
  const itemCount = lines.length;

  return (
    <div className="min-h-dvh pb-28">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-30 bg-navy-900 text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="China-in-Ghana home">
            <Logo inverted />
          </Link>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative inline-flex size-11 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/15"
            aria-label={`Your order, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            <ShoppingBag className="size-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-brand-orange px-1 text-[11px] font-bold leading-5">
                {itemCount}
              </span>
            )}
          </button>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-white/8 px-3 py-2.5 text-left ring-1 ring-inset ring-white/10 transition hover:bg-white/12"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange">
              <MapPin className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] uppercase tracking-wider text-navy-200">Shopping at</span>
              <span className="block truncate font-display text-[15px] font-bold">
                {branch ? branch.name : branchesQ.loading ? "Loading branches…" : "Choose a branch"}
                {branch?.distanceKm != null && <span className="font-sans font-normal text-navy-200"> · {formatKm(branch.distanceKm)} away</span>}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[13px] font-medium text-sun">
              Change <ChevronDown className="size-4" />
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* ---------- Hero ---------- */}
        <section className="relative -mx-4 overflow-hidden bg-navy-900 px-4 pb-6 pt-2 text-white">
          <div className="absolute -right-16 -top-10 size-56 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="absolute -left-10 bottom-0 size-40 rounded-full bg-fresh/20 blur-3xl" />
          <div className="relative">
            <h1 className="max-w-md font-display text-[26px] font-black leading-tight md:text-4xl">
              Home appliances at <span className="text-sun">wholesale</span> prices
            </h1>
            <p className="mt-1.5 max-w-lg text-sm text-navy-200">
              Live prices and stock at your branch. Build your order and send it on WhatsApp in one tap.
            </p>
          </div>
        </section>

        {settings?.noticeText && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-sun-soft px-3.5 py-3 text-[13px] text-sun-ink">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>{settings.noticeText}</p>
          </div>
        )}

        {/* ---------- Search & filters ---------- */}
        <div className="sticky top-[132px] z-20 -mx-4 mt-4 bg-surface/95 px-4 pb-2 pt-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or code"
              className="h-12 w-full rounded-2xl bg-white pl-10 pr-10 text-[15px] shadow-[var(--shadow-card)] ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
              aria-label="Search products"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:bg-navy-50"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="no-scrollbar -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4">
            <Chip active={!categoryId} onClick={() => setCategoryId(null)}>
              All
            </Chip>
            {usedCategories.map((c) => (
              <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
            <Chip active={inStockOnly} onClick={() => setInStockOnly((v) => !v)} tone="fresh">
              In stock only
            </Chip>
          </div>
        </div>

        {/* ---------- Products ---------- */}
        <section className="mt-2" aria-live="polite">
          {!branch ? (
            branchesQ.loading ? (
              <Spinner />
            ) : (
              <EmptyState
                icon={<MapPin className="size-6" />}
                title="Choose a branch to see prices"
                body="Each branch has its own stock and prices."
                action={<Button onClick={() => setPickerOpen(true)}>Choose branch</Button>}
              />
            )
          ) : productsQ.loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<PackageSearch className="size-6" />}
              title={productsQ.data.length ? "No matching products" : "No products yet"}
              body={productsQ.data.length ? "Try a different search or filter." : `${branch.name} hasn't listed products yet.`}
              action={
                productsQ.data.length ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch("");
                      setCategoryId(null);
                      setInStockOnly(false);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="mb-2 text-[13px] text-ink-soft">
                {filtered.length} product{filtered.length === 1 ? "" : "s"} at {branch.name}
              </p>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <ProductCard product={p} branchId={branch.id} defaultLow={defaultLow} onOpen={() => setActiveProduct(p)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <footer className="mt-12 border-t border-line py-6 text-center text-[12px] text-ink-soft">
          <p>© {new Date().getFullYear()} China-in-Ghana. Prices in Ghana cedis (GH₵).</p>
          <p className="mt-1">Your location is only used on your device to find the nearest branch.</p>
          <Link
            href="/login"
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-navy-900 px-3.5 text-[12px] font-medium text-white opacity-40 transition-opacity duration-200 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 active:opacity-100"
          >
            <Lock className="size-3.5" aria-hidden /> Admin portal
          </Link>
        </footer>
      </main>

      {/* ---------- Sticky cart bar ---------- */}
      {itemCount > 0 && !cartOpen && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 px-4 pb-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-lg animate-slide-up items-center gap-3 rounded-2xl bg-navy-900 p-2 pl-4 text-left text-white shadow-[var(--shadow-float)]"
          >
            <span className="relative">
              <ShoppingBag className="size-5" />
              <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold leading-4">
                {itemCount}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-navy-200">
                {itemCount} item{itemCount === 1 ? "" : "s"} · {branch?.name}
              </span>
              <span className="block font-display text-lg font-black leading-tight">{ghs(total)}</span>
            </span>
            <span className="rounded-xl bg-brand-orange px-4 py-2.5 text-sm font-semibold">Review order</span>
          </button>
        </div>
      )}

      <LocationPrompt
        step={promptStep}
        suggested={branches.find((b) => b.id === suggestedId) ?? null}
        onRetry={() => void locate(true)}
        onConfirm={() => setPromptStep(null)}
        onManual={() => {
          setPromptStep(null);
          setPickerOpen(true);
        }}
        onSeeAll={() => {
          setPromptStep(null);
          setPickerOpen(true);
        }}
      />
      <BranchPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        branches={branches}
        selectedId={branch?.id ?? null}
        onSelect={(id) => setSavedBranchId(id)}
        onLocate={() => void locate()}
        locating={locating}
        locStatus={locStatus}
      />
      <ProductSheet
        product={activeProduct ? (productsQ.data.find((p) => p.id === activeProduct.id) ?? activeProduct) : null}
        branch={branch}
        branches={branchesQ.data}
        position={pos}
        defaultLow={defaultLow}
        onClose={() => setActiveProduct(null)}
        onSwitchBranch={(id) => {
          setSavedBranchId(id);
          const b = branchesQ.data.find((x) => x.id === id);
          if (b) toast.info(`Switched to ${b.name}`);
        }}
      />
      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} branch={branch} products={productsQ.data} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "navy",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "navy" | "fresh";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition",
        active
          ? tone === "fresh"
            ? "bg-fresh text-white ring-fresh"
            : "bg-navy-700 text-white ring-navy-700"
          : "bg-white text-navy-800 ring-line hover:ring-navy-200",
      )}
    >
      {children}
    </button>
  );
}

function ProductCard({
  product: p,
  branchId,
  defaultLow,
  onOpen,
}: {
  product: Product;
  branchId: string;
  defaultLow: number;
  onOpen: () => void;
}) {
  const cart = useBranchCart(branchId);
  const setQty = useCart((s) => s.setQty);
  const avail = availability(p, defaultLow);
  const boxQty = cart[cartKey(p.id, "box")]?.qty ?? 0;
  const pieceQty = cart[cartKey(p.id, "piece")]?.qty ?? 0;
  const maxBoxes = Math.max(0, Math.floor((p.stockPieces - pieceQty) / Math.max(p.qtyPerBox, 1)));
  const minBoxes = p.minBoxes || 1;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-[var(--shadow-card)] ring-1 ring-line/60">
      <button type="button" onClick={onOpen} className="relative block text-left" aria-label={`View ${p.name}`}>
        <ProductImage
          src={p.thumbUrl ?? p.imageUrl}
          alt={p.name}
          className={cn("aspect-square w-full transition duration-300 group-hover:scale-[1.03]", avail === "out" && "opacity-80")}
        />
        <span className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {giftStatus(p.freeGift) === "active" && <Badge tone="alert">
              <Gift className="size-3" aria-hidden /> Free gift
            </Badge>}
          {p.tags?.includes("hot") && <Badge tone="sun">
              <Flame className="size-3" aria-hidden /> Hot
            </Badge>}
          {p.tags?.includes("new") && <Badge tone="orange">New</Badge>}
        </span>
      </button>
      <div className="flex flex-1 flex-col p-3">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="line-clamp-2 font-sans text-[14px] font-semibold leading-snug text-navy-900">{p.name}</h3>
          <p className="mt-0.5 text-[12px] text-ink-soft">
            {p.code}
            {isSingle(p.qtyPerBox) ? "" : ` · ${p.qtyPerBox} ${p.unitLabel}s/box`}
          </p>
        </button>
        <GiftTag gift={p.freeGift} className="mt-2" />
        <div className="mt-2">
          <AvailabilityBadge value={avail} lowCount={avail === "low" ? stockLabel(p.stockPieces, p.qtyPerBox, p.unitLabel) : undefined} />
        </div>
        <div className="mt-auto pt-3">
          <p className="font-display text-lg font-black leading-none text-brand-orange-dark">
            {ghs(p.boxPrice)}
            <span className="ml-1 font-sans text-[12px] font-normal text-ink-soft">{priceSuffix(p.qtyPerBox)}</span>
          </p>
          {p.sellByPiece && p.piecePrice != null && (
            <p className="mt-0.5 text-[12px] text-ink-soft">
              or {ghs(p.piecePrice)} / {p.unitLabel}
            </p>
          )}
          <div className="mt-2.5">
            {avail === "out" ? (
              <Button size="sm" variant="secondary" block onClick={onOpen}>
                Check other branches
              </Button>
            ) : boxQty > 0 ? (
              <div className="flex justify-center">
                <QtyStepper size="sm" label={`${isSingle(p.qtyPerBox) ? "Quantity" : "Boxes"} of ${p.name}`} value={boxQty} min={minBoxes} max={maxBoxes} onChange={(v) => setQty(branchId, p.id, "box", v)} />
              </div>
            ) : (
              <Button
                size="sm"
                variant="cta"
                block
                disabled={maxBoxes < minBoxes && !p.sellByPiece}
                onClick={() => (maxBoxes >= minBoxes ? setQty(branchId, p.id, "box", minBoxes) : onOpen())}
              >
                {maxBoxes >= minBoxes ? (isSingle(p.qtyPerBox) ? "Add to order" : `Add ${boxWord(p.qtyPerBox, p.unitLabel)}`) : "Buy pieces"}
              </Button>
            )}
            {pieceQty > 0 && (
              <p className="mt-1.5 text-center text-[12px] text-navy-600">
                + {pieceQty} {p.unitLabel}
                {pieceQty === 1 ? "" : "s"} in order
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
