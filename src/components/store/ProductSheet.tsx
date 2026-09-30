"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Download, Share2, ShoppingBag, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { db } from "@/lib/firebase";
import { availability, boxWord, ghs, isSingle, priceSuffix, stockLabel } from "@/lib/format";
import { giftStatus } from "@/lib/gift";
import { distanceKm, formatKm, type LatLng } from "@/lib/geo";
import type { Branch, Product, Unit } from "@/lib/types";
import { useBranchCart, useCart, cartKey } from "@/store/cart";
import { AvailabilityBadge, GiftPanel, ProductImage, QtyStepper, UnitToggle } from "./bits";

async function fetchImageFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = blob.type.split("/")[1]?.replace("svg+xml", "svg") || "jpg";
  return new File([blob], `${name.replace(/[^\w-]+/g, "-")}.${ext}`, { type: blob.type });
}

export function ProductSheet({
  product,
  branch,
  branches,
  position,
  defaultLow,
  onClose,
  onSwitchBranch,
}: {
  product: Product | null;
  branch: Branch | null;
  branches: Branch[];
  position: LatLng | null;
  defaultLow: number;
  onClose: () => void;
  onSwitchBranch: (branchId: string) => void;
}) {
  const cart = useBranchCart(branch?.id ?? null);
  const setQty = useCart((s) => s.setQty);
  const [unit, setUnit] = useState<Unit>("box");
  const [others, setOthers] = useState<{ branch: Branch; product: Product; km: number | null }[] | null>(null);

  useEffect(() => {
    if (!product) return;
    const inCart = cart[cartKey(product.id, "piece")] && !cart[cartKey(product.id, "box")];
    setUnit(inCart ? "piece" : "box");
    setOthers(null);
    let cancelled = false;
    getDocs(query(collection(db, "products"), where("code", "==", product.code), where("visible", "==", true)))
      .then((snap) => {
        if (cancelled) return;
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Product)
          .filter((p) => p.branchId !== product.branchId)
          .map((p) => {
            const b = branches.find((x) => x.id === p.branchId);
            return b ? { branch: b, product: p, km: position ? distanceKm(position, b) : null } : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
          .sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
        setOthers(list);
      })
      .catch(() => !cancelled && setOthers([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product || !branch) return null;

  const avail = availability(product, defaultLow);
  const qty = cart[cartKey(product.id, unit)]?.qty ?? 0;
  const perUnit = unit === "box" ? product.qtyPerBox : 1;
  const otherUnitPieces = (cart[cartKey(product.id, unit === "box" ? "piece" : "box")]?.qty ?? 0) * (unit === "box" ? 1 : product.qtyPerBox);
  const maxQty = Math.max(0, Math.floor((product.stockPieces - otherUnitPieces) / perUnit));
  const min = unit === "box" ? product.minBoxes || 1 : product.minPieces || 1;
  const price = unit === "box" ? product.boxPrice : (product.piecePrice ?? 0);
  const imageUrl = product.imageUrl ?? product.thumbUrl;

  async function share() {
    if (!product || !branch) return;
    const priceText = isSingle(product.qtyPerBox) ? `${ghs(product.boxPrice)} each` : `${ghs(product.boxPrice)} per box of ${product.qtyPerBox}`;
    const giftText = giftStatus(product.freeGift) === "active" ? ` + FREE ${product.freeGift!.name}` : "";
    const text = `${product.name} (${product.code}) — ${priceText}${giftText} at China-in-Ghana ${branch.name}`;
    const url = `${window.location.origin}/b/${branch.slug}`;
    try {
      if (imageUrl && navigator.canShare) {
        const file = await fetchImageFile(imageUrl, product.code);
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text}\n${url}` });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: product.name, text, url });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, "_blank", "noopener");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share. Try downloading the photo instead.");
    }
  }

  async function download() {
    if (!imageUrl || !product) return;
    try {
      const file = await fetchImageFile(imageUrl, `${product.code}-${product.name}`);
      const href = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = href;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
    } catch {
      window.open(imageUrl, "_blank", "noopener");
    }
  }

  return (
    <Modal open={!!product} onClose={onClose} title={product.name} description={<span className="font-mono text-xs">{product.code}</span>} size="lg">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="relative overflow-hidden rounded-2xl">
            {/* Shown uncropped: promo flyers are portrait and carry the offer details. */}
            <ProductImage
              src={imageUrl}
              alt={product.name}
              sizes="full"
              className={imageUrl ? "h-auto max-h-[70vh] w-full object-contain" : "aspect-square w-full"}
            />
          </div>
          {imageUrl && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={download}>
                <Download className="size-4" /> Save photo
              </Button>
              <Button variant="secondary" size="sm" onClick={share}>
                <Share2 className="size-4" /> Share
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            {/* Badges sit here, not on the photo, so they never cover a flyer's text. */}
            <div className="flex flex-wrap items-center gap-2">
              {giftStatus(product.freeGift) === "active" && <Badge tone="alert">🎁 Free gift</Badge>}
              {product.tags?.includes("hot") && <Badge tone="sun">🔥 Hot</Badge>}
              {product.tags?.includes("new") && <Badge tone="orange">New</Badge>}
              <AvailabilityBadge
                value={avail}
                lowCount={avail === "low" ? stockLabel(product.stockPieces, product.qtyPerBox, product.unitLabel) : undefined}
              />
              {!isSingle(product.qtyPerBox) && (
                <span className="text-[13px] text-ink-soft">
                  {product.qtyPerBox} {product.unitLabel}s per box
                </span>
              )}
            </div>
            {product.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{product.description}</p>}
          </div>

          <GiftPanel gift={product.freeGift} perWhat={boxWord(product.qtyPerBox, product.unitLabel)} />

          {isSingle(product.qtyPerBox) ? (
            <div className="rounded-2xl bg-brand-orange-soft p-3">
              <p className="text-[12px] font-medium text-brand-orange-dark">Price</p>
              <p className="font-display text-2xl font-black text-navy-900">
                {ghs(product.boxPrice)} <span className="font-sans text-sm font-normal text-ink-soft">each</span>
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-brand-orange-soft p-3">
                <p className="text-[12px] font-medium text-brand-orange-dark">Box price</p>
                <p className="font-display text-xl font-black text-navy-900">{ghs(product.boxPrice)}</p>
                <p className="text-[12px] text-ink-soft">
                  ≈ {ghs(Math.round((product.boxPrice / Math.max(product.qtyPerBox, 1)) * 100) / 100)} / {product.unitLabel}
                </p>
              </div>
              {product.sellByPiece && product.piecePrice != null ? (
                <div className="rounded-2xl bg-navy-50 p-3">
                  <p className="text-[12px] font-medium text-navy-600">Per {product.unitLabel}</p>
                  <p className="font-display text-xl font-black text-navy-900">{ghs(product.piecePrice)}</p>
                  <p className="text-[12px] text-ink-soft">
                    Min. {product.minPieces || 1} {product.unitLabel}s
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-navy-50 p-3">
                  <p className="text-[12px] font-medium text-navy-600">Sold by</p>
                  <p className="font-display text-lg font-bold text-navy-900">Box only</p>
                  <p className="text-[12px] text-ink-soft">Min. {product.minBoxes || 1} box</p>
                </div>
              )}
            </div>
          )}

          {avail !== "out" ? (
            <div className="space-y-3 rounded-2xl bg-surface p-3 ring-1 ring-inset ring-line">
              {product.sellByPiece && product.piecePrice != null && (
                <UnitToggle value={unit} onChange={setUnit} qtyPerBox={product.qtyPerBox} unitLabel={product.unitLabel} />
              )}
              <div className="flex items-center justify-between gap-3">
                <QtyStepper
                  label={unit === "box" ? (isSingle(product.qtyPerBox) ? "Quantity" : "Boxes") : `${product.unitLabel}s`}
                  value={qty}
                  min={min}
                  max={maxQty}
                  onChange={(v) => setQty(branch.id, product.id, unit, v)}
                />
                <div className="text-right">
                  <p className="text-[12px] text-ink-soft">Subtotal</p>
                  <p className="font-display text-lg font-bold text-navy-900">{ghs(qty * price)}</p>
                </div>
              </div>
              {qty === 0 ? (
                <Button block variant="cta" onClick={() => setQty(branch.id, product.id, unit, Math.min(min, maxQty) || 0)} disabled={maxQty < min}>
                  <ShoppingBag className="size-4" />
                  {unit === "box" && isSingle(product.qtyPerBox) && min === 1
                    ? "Add to order"
                    : `Add ${min > 1 ? `${min} ` : ""}${unit === "box" ? boxWord(product.qtyPerBox, product.unitLabel, min) : `${product.unitLabel}s`} to order`}
                </Button>
              ) : (
                <Button block variant="primary" onClick={onClose}>
                  Done — continue shopping
                </Button>
              )}
              {maxQty < min && <p className="text-[13px] text-alert-ink">Not enough stock for the minimum order at this branch.</p>}
            </div>
          ) : (
            <div className="rounded-2xl bg-alert-soft p-3 text-sm text-alert-ink">This item is out of stock at {branch.name}.</div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-navy-900">
              <Store className="size-4" /> Other branches
            </p>
            {others === null ? (
              <p className="text-[13px] text-ink-soft">Checking…</p>
            ) : others.length === 0 ? (
              <p className="text-[13px] text-ink-soft">Not listed at other branches.</p>
            ) : (
              <ul className="space-y-1.5">
                {others.map((o) => {
                  const a = availability(o.product, defaultLow);
                  return (
                    <li key={o.branch.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-line">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-900">
                          {o.branch.name}
                          {o.km != null && <span className="font-normal text-ink-soft"> · {formatKm(o.km)}</span>}
                        </p>
                        <p className="text-[12px] text-ink-soft">
                          {ghs(o.product.boxPrice)} {priceSuffix(o.product.qtyPerBox)} · {a === "out" ? "Out of stock" : a === "low" ? "Low stock" : "In stock"}
                        </p>
                      </div>
                      {a !== "out" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            onSwitchBranch(o.branch.id);
                            onClose();
                          }}
                        >
                          Switch
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
