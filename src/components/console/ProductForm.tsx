"use client";

import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Camera, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ProductImage } from "@/components/store/bits";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { uploadProductImage } from "@/lib/images";
import type { Category, Product } from "@/lib/types";

interface FormState {
  name: string;
  code: string;
  categoryId: string;
  newCategory: string;
  description: string;
  qtyPerBox: string;
  unitLabel: string;
  boxPrice: string;
  sellByPiece: boolean;
  piecePrice: string;
  minBoxes: string;
  minPieces: string;
  lowStockPieces: string;
  hot: boolean;
  isNew: boolean;
  visible: boolean;
  openingBoxes: string;
  openingPieces: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  hasGift: boolean;
  giftName: string;
  giftImageUrl: string | null;
  giftStartsAt: string;
  giftEndsAt: string;
}

function fromProduct(p: Product | null): FormState {
  return {
    name: p?.name ?? "",
    code: p?.code ?? "",
    categoryId: p?.categoryId ?? "",
    newCategory: "",
    description: p?.description ?? "",
    qtyPerBox: p ? String(p.qtyPerBox) : "",
    unitLabel: p?.unitLabel ?? "pc",
    boxPrice: p ? String(p.boxPrice) : "",
    sellByPiece: p?.sellByPiece ?? true,
    piecePrice: p?.piecePrice != null ? String(p.piecePrice) : "",
    minBoxes: p ? String(p.minBoxes || 1) : "1",
    minPieces: p ? String(p.minPieces || 1) : "1",
    lowStockPieces: p?.lowStockPieces != null ? String(p.lowStockPieces) : "",
    hot: p?.tags?.includes("hot") ?? false,
    isNew: p?.tags?.includes("new") ?? false,
    visible: p?.visible ?? true,
    openingBoxes: "",
    openingPieces: "",
    imageUrl: p?.imageUrl ?? null,
    thumbUrl: p?.thumbUrl ?? null,
    hasGift: !!p?.freeGift?.name,
    giftName: p?.freeGift?.name ?? "",
    giftImageUrl: p?.freeGift?.imageUrl ?? null,
    giftStartsAt: p?.freeGift?.startsAt ?? "",
    giftEndsAt: p?.freeGift?.endsAt ?? "",
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function ProductForm({
  open,
  onClose,
  branchId,
  branchName,
  product,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  branchId: string;
  branchName: string;
  product: Product | null;
  categories: Category[];
}) {
  const [f, setF] = useState<FormState>(fromProduct(product));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [giftUploading, setGiftUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const giftFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setF(fromProduct(product));
      setErrors({});
    }
  }, [open, product]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function onPickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { imageUrl, thumbUrl } = await uploadProductImage(branchId, file);
      setF((s) => ({ ...s, imageUrl, thumbUrl }));
    } catch (e) {
      toast.error((e as Error).message || "Couldn't upload the photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onPickGiftImage(file: File | undefined) {
    if (!file) return;
    setGiftUploading(true);
    try {
      const { thumbUrl } = await uploadProductImage(branchId, file);
      setF((s) => ({ ...s, giftImageUrl: thumbUrl }));
    } catch (e) {
      toast.error((e as Error).message || "Couldn't upload the photo.");
    } finally {
      setGiftUploading(false);
      if (giftFileRef.current) giftFileRef.current.value = "";
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter the product name.";
    if (!f.code.trim()) e.code = "Enter the product code.";
    if (!(num(f.qtyPerBox) >= 1) || !Number.isInteger(num(f.qtyPerBox))) e.qtyPerBox = "Whole number, 1 or more.";
    if (!(num(f.boxPrice) >= 0)) e.boxPrice = "Enter the box price.";
    if (f.sellByPiece && !(num(f.piecePrice) >= 0)) e.piecePrice = "Enter the price per piece.";
    if (!(num(f.minBoxes) >= 1)) e.minBoxes = "At least 1.";
    if (f.sellByPiece && !(num(f.minPieces) >= 1)) e.minPieces = "At least 1.";
    if (f.lowStockPieces.trim() && !(num(f.lowStockPieces) >= 0)) e.lowStockPieces = "Enter a number or leave empty.";
    if (f.categoryId === "__new" && f.newCategory.trim().length < 2) e.newCategory = "Name the new category.";
    if (f.hasGift && f.giftName.trim().length < 2) e.giftName = "Name the free gift, e.g. 2-in-1 Blender.";
    if (f.hasGift && f.giftStartsAt && f.giftEndsAt && f.giftEndsAt < f.giftStartsAt) e.giftEndsAt = "The end date is before the start date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    try {
      let categoryId: string | null = f.categoryId || null;
      if (f.categoryId === "__new") {
        const id = f.newCategory.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        await setDoc(doc(db, "categories", id), { name: f.newCategory.trim(), sortOrder: categories.length + 1 }, { merge: true });
        categoryId = id;
      }
      const data = {
        name: f.name.trim(),
        code: f.code.trim().toUpperCase(),
        categoryId,
        description: f.description.trim(),
        qtyPerBox: num(f.qtyPerBox),
        unitLabel: f.unitLabel.trim() || "pc",
        boxPrice: num(f.boxPrice),
        sellByPiece: f.sellByPiece,
        piecePrice: f.sellByPiece ? num(f.piecePrice) : null,
        minBoxes: num(f.minBoxes),
        minPieces: f.sellByPiece ? num(f.minPieces) : 1,
        lowStockPieces: f.lowStockPieces.trim() ? num(f.lowStockPieces) : null,
        tags: [f.hot && "hot", f.isNew && "new"].filter(Boolean) as string[],
        freeGift: f.hasGift
          ? { name: f.giftName.trim(), imageUrl: f.giftImageUrl, startsAt: f.giftStartsAt || null, endsAt: f.giftEndsAt || null }
          : null,
        visible: f.visible,
        imageUrl: f.imageUrl,
        thumbUrl: f.thumbUrl,
        searchText: `${f.name} ${f.code}`.toLowerCase(),
        updatedAt: serverTimestamp(),
      };

      if (product) {
        await updateDoc(doc(db, "products", product.id), data);
        toast.success("Product updated");
      } else {
        const ref = await addDoc(collection(db, "products"), { ...data, branchId, stockPieces: 0, createdAt: serverTimestamp() });
        const boxes = Math.max(0, Math.floor(num(f.openingBoxes) || 0));
        const pieces = Math.max(0, Math.floor(num(f.openingPieces) || 0));
        if (boxes || pieces) {
          await api.adjustStock({ productId: ref.id, type: "receive", boxes, pieces, reason: "Opening stock" });
        }
        toast.success("Product added");
      }
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
      onClose={onClose}
      title={product ? "Edit product" : "Add product"}
      description={`${branchName} branch`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={uploading || giftUploading} onClick={save}>
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative block w-full overflow-hidden rounded-2xl ring-1 ring-inset ring-line"
            aria-label="Upload product photo"
          >
            <ProductImage src={f.thumbUrl ?? f.imageUrl} alt="Product photo" className="aspect-square w-full" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-navy-900/75 py-2 text-[13px] font-medium text-white">
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {uploading ? "Uploading…" : f.imageUrl ? "Change photo" : "Add photo"}
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickImage(e.target.files?.[0])} />
          <p className="mt-1.5 text-[12px] text-ink-soft">Resized on your phone to save data.</p>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Product name" required error={errors.name} className="sm:col-span-2">
              {(id) => <Input id={id} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="2.5L 2-in-1 Blender" />}
            </Field>
            <Field label="Code" required error={errors.code}>
              {(id) => <Input id={id} value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="BD-2901" className="uppercase" />}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              {(id) => (
                <Select id={id} value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new">+ New category…</option>
                </Select>
              )}
            </Field>
            {f.categoryId === "__new" && (
              <Field label="New category name" required error={errors.newCategory}>
                {(id) => <Input id={id} value={f.newCategory} onChange={(e) => set("newCategory", e.target.value)} placeholder="Fans & cooling" />}
              </Field>
            )}
          </div>

          <Field label="Description" hint="Optional">
            {(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />}
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Pieces per box" required error={errors.qtyPerBox} hint="1 for single items (fridges, freezers)">
              {(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={f.qtyPerBox} onChange={(e) => set("qtyPerBox", e.target.value)} placeholder="6" />}
            </Field>
            <Field label="Unit name">
              {(id) => <Input id={id} value={f.unitLabel} onChange={(e) => set("unitLabel", e.target.value)} placeholder="pc" />}
            </Field>
            <Field label={Number(f.qtyPerBox) === 1 ? "Price each (GH₵)" : "Box price (GH₵)"} required error={errors.boxPrice}>
              {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={f.boxPrice} onChange={(e) => set("boxPrice", e.target.value)} placeholder="960" />}
            </Field>
            <Field label="Min. boxes" error={errors.minBoxes}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={f.minBoxes} onChange={(e) => set("minBoxes", e.target.value)} />}
            </Field>
          </div>

          <Toggle checked={f.sellByPiece} onChange={(v) => set("sellByPiece", v)} label="Also sell by the piece" description="Customers can order single pieces as well as full boxes." />
          {f.sellByPiece && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Price per ${f.unitLabel || "pc"} (GH₵)`} required error={errors.piecePrice}>
                {(id) => <Input id={id} type="number" inputMode="decimal" min={0} step="0.01" value={f.piecePrice} onChange={(e) => set("piecePrice", e.target.value)} placeholder="170" />}
              </Field>
              <Field label="Min. pieces" error={errors.minPieces}>
                {(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={f.minPieces} onChange={(e) => set("minPieces", e.target.value)} />}
              </Field>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Low-stock alert at (pieces)" hint="Empty = use the default from Settings." error={errors.lowStockPieces}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={f.lowStockPieces} onChange={(e) => set("lowStockPieces", e.target.value)} placeholder="Default" />}
            </Field>
            {!product && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Opening boxes">
                  {(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={f.openingBoxes} onChange={(e) => set("openingBoxes", e.target.value)} placeholder="0" />}
                </Field>
                <Field label="+ pieces">
                  {(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={f.openingPieces} onChange={(e) => set("openingPieces", e.target.value)} placeholder="0" />}
                </Field>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl bg-sun-soft/50 p-3 ring-1 ring-inset ring-sun/30">
            <Toggle
              checked={f.hasGift}
              onChange={(v) => set("hasGift", v)}
              label="🎁 Comes with a free gift"
              description={`Shown on the product and added to the WhatsApp order: 1 gift per ${Number(f.qtyPerBox) === 1 ? (f.unitLabel || "unit") : "box"}.`}
            />
            {f.hasGift && (
              <div className="grid gap-3 sm:grid-cols-[88px_1fr]">
                <div>
                  <button
                    type="button"
                    onClick={() => giftFileRef.current?.click()}
                    className="relative block size-[88px] overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-line"
                    aria-label="Upload gift photo"
                  >
                    {f.giftImageUrl ? (
                      <ProductImage src={f.giftImageUrl} alt="Gift photo" className="size-full" />
                    ) : (
                      <span className="flex size-full flex-col items-center justify-center gap-1 text-[11px] text-ink-soft">
                        {giftUploading ? <Loader2 className="size-5 animate-spin" /> : <Gift className="size-5 text-brand-orange" />}
                        {giftUploading ? "Uploading" : "Gift photo"}
                      </span>
                    )}
                  </button>
                  <input ref={giftFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickGiftImage(e.target.files?.[0])} />
                  {f.giftImageUrl && (
                    <button type="button" className="mt-1 text-[12px] text-ink-soft hover:underline" onClick={() => set("giftImageUrl", null)}>
                      Remove photo
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <Field label="Free gift" required error={errors.giftName}>
                    {(id) => <Input id={id} value={f.giftName} onChange={(e) => set("giftName", e.target.value)} placeholder="2-in-1 Blender" />}
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Promo starts" hint="Empty = now">
                      {(id) => <Input id={id} type="date" value={f.giftStartsAt} onChange={(e) => set("giftStartsAt", e.target.value)} />}
                    </Field>
                    <Field label="Promo ends" hint="Empty = no end" error={errors.giftEndsAt}>
                      {(id) => <Input id={id} type="date" value={f.giftEndsAt} onChange={(e) => set("giftEndsAt", e.target.value)} />}
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle checked={f.visible} onChange={(v) => set("visible", v)} label="Show in shop" />
            <Toggle checked={f.hot} onChange={(v) => set("hot", v)} label="🔥 Hot deal" />
            <Toggle checked={f.isNew} onChange={(v) => set("isNew", v)} label="New arrival" />
          </div>
          {product && <p className="text-[13px] text-ink-soft">To change stock, use the Stock button on the product list.</p>}
        </div>
      </div>
    </Modal>
  );
}
