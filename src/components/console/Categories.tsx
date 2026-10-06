"use client";

import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { findOrCreateCategory, sameCategoryName } from "@/lib/categories";
import { db } from "@/lib/firebase";
import type { Category } from "@/lib/types";
import { useCategories } from "./data";

const message = (e: unknown) => (e instanceof Error && !("code" in e) ? e.message : errorMessage(e));

/**
 * Add, rename and delete product categories (admin). Categories are shared by every branch.
 * Deleting asks what to do with the products in it, so no product points at a missing category.
 */
export function CategoriesManager() {
  const categories = useCategories();
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  useEffect(() => setNames(Object.fromEntries(categories.map((c) => [c.id, c.name]))), [categories]);

  async function rename(c: Category) {
    const name = (names[c.id] ?? "").replace(/\s+/g, " ").trim();
    if (name === c.name) return;
    if (name.length < 2) {
      setNames((n) => ({ ...n, [c.id]: c.name }));
      toast.error("Category names need at least 2 characters.");
      return;
    }
    if (categories.some((o) => o.id !== c.id && sameCategoryName(o.name, name))) {
      setNames((n) => ({ ...n, [c.id]: c.name }));
      toast.error(`There's already a category called "${name}".`);
      return;
    }
    setBusy(c.id);
    try {
      await updateDoc(doc(db, "categories", c.id), { name });
      toast.success("Category renamed");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const name = newName.trim();
    if (name.length < 2) return;
    setBusy("__new");
    try {
      const res = await findOrCreateCategory(name, categories);
      setNewName("");
      if (res.created) toast.success(`Category "${res.name}" added`);
      else toast.info(`"${res.name}" already exists, so nothing new was added.`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Tag className="size-4 shrink-0 text-fresh" aria-hidden />
            <Input
              className="h-10"
              value={names[c.id] ?? ""}
              onChange={(e) => setNames((n) => ({ ...n, [c.id]: e.target.value }))}
              onBlur={() => rename(c)}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              disabled={busy === c.id}
              aria-label={`Category name: ${c.name}`}
            />
            <button
              type="button"
              onClick={() => setDeleting(c)}
              aria-label={`Delete category ${c.name}`}
              title="Delete category"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-soft transition hover:bg-alert-soft hover:text-alert-ink"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {categories.length === 0 && <li className="text-sm text-ink-soft">No categories yet. Add your first one below.</li>}
      </ul>
      <div className="mt-3 flex gap-2 border-t border-line pt-3">
        <Input
          className="h-10"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New category, e.g. Washing machines"
          aria-label="New category name"
        />
        <Button variant="secondary" className="h-10" loading={busy === "__new"} onClick={add} disabled={newName.trim().length < 2}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-ink-soft">Tap a name to rename it. Changes apply to every branch straight away.</p>

      <DeleteCategoryDialog category={deleting} categories={categories} onClose={() => setDeleting(null)} />
    </div>
  );
}

/** Settings-page card wrapper. */
export function CategoriesCard() {
  return (
    <Card className="p-5 lg:col-span-2">
      <h2 className="font-display text-lg font-bold">Categories</h2>
      <p className="mb-3 mt-0.5 text-sm text-ink-soft">Shared by all branches. Customers filter by these.</p>
      <CategoriesManager />
    </Card>
  );
}

/** Products-page button that opens the same manager. */
export function CategoriesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Tag className="size-4" /> Categories
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Categories" description="Shared by all branches. Customers filter by these." size="sm">
        <CategoriesManager />
      </Modal>
    </>
  );
}

function DeleteCategoryDialog({ category, categories, onClose }: { category: Category | null; categories: Category[]; onClose: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const others = categories.filter((c) => c.id !== category?.id);

  useEffect(() => {
    if (!category) return;
    setCount(null);
    setMoveTo("");
    let cancelled = false;
    getDocs(query(collection(db, "products"), where("categoryId", "==", category.id)))
      .then((snap) => !cancelled && setCount(snap.size))
      .catch(() => !cancelled && setCount(-1));
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (!category) return null;

  async function confirm() {
    if (!category) return;
    setBusy(true);
    try {
      // Re-read at the moment of deleting so products added meanwhile are included.
      const snap = await getDocs(query(collection(db, "products"), where("categoryId", "==", category.id)));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of snap.docs.slice(i, i + 400)) batch.update(d.ref, { categoryId: moveTo || null, updatedAt: serverTimestamp() });
        await batch.commit();
      }
      await deleteDoc(doc(db, "categories", category.id));
      const target = categories.find((c) => c.id === moveTo)?.name;
      toast.success(
        snap.size === 0
          ? `"${category.name}" deleted`
          : target
            ? `"${category.name}" deleted. ${snap.size} product${snap.size === 1 ? "" : "s"} moved to "${target}".`
            : `"${category.name}" deleted. ${snap.size} product${snap.size === 1 ? " is" : "s are"} now without a category.`,
      );
      onClose();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!category}
      onClose={busy ? () => undefined : onClose}
      title={`Delete "${category.name}"?`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={count === null || count === -1} onClick={confirm}>
            Delete category
          </Button>
        </div>
      }
    >
      {count === null ? (
        <p className="text-sm text-ink-soft">Checking which products use this category…</p>
      ) : count === -1 ? (
        <p className="text-sm text-alert-ink">Couldn&apos;t check the products in this category. Check your connection and try again.</p>
      ) : count === 0 ? (
        <p className="text-sm text-ink-soft">No products use this category. It will be removed from every branch.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-navy-900">
            <strong>{count}</strong> product{count === 1 ? " uses" : "s use"} this category (across all branches). What should happen to {count === 1 ? "it" : "them"}?
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-navy-900">Move {count === 1 ? "it" : "them"} to</span>
            <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move products to category">
              <option value="">No category</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-[13px] text-ink-soft">The products themselves aren&apos;t deleted. They stay in the shop, just under the category you choose.</p>
        </div>
      )}
    </Modal>
  );
}
