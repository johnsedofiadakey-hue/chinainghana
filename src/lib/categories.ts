import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";
import type { Category } from "./types";

/** Compares category names ignoring case, spacing and "&" vs "and". */
export function sameCategoryName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export type CategoryResult = { id: string; created: boolean; name: string };

/**
 * Finds or creates a category by name, without ever overwriting another one.
 * - A category with the same name (ignoring case/spacing) is reused.
 * - Otherwise a new document is created under a free id ("kitchen", "kitchen-2", …) inside a
 *   transaction, so an existing category can't be renamed by accident.
 */
export async function findOrCreateCategory(rawName: string, existing: Category[]): Promise<CategoryResult> {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (name.length < 2) throw new Error("Category names need at least 2 characters.");
  if (name.length > 50) throw new Error("Keep the category name under 50 characters.");

  const match = existing.find((c) => sameCategoryName(c.name, name));
  if (match) return { id: match.id, created: false, name: match.name };

  const base = categorySlug(name) || "category";
  const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder ?? 0), 0) + 1;

  return runTransaction(db, async (tx) => {
    for (let n = 1; n <= 50; n++) {
      const id = n === 1 ? base : `${base}-${n}`;
      const ref = doc(db, "categories", id);
      const snap = await tx.get(ref);
      if (snap.exists()) {
        // Someone else just created the same name: reuse it instead of making a duplicate.
        if (sameCategoryName(String(snap.get("name") ?? ""), name)) return { id, created: false, name: String(snap.get("name")) };
        continue;
      }
      tx.set(ref, { name, sortOrder });
      return { id, created: true, name };
    }
    throw new Error("Couldn't find a free name for this category. Try a different name.");
  });
}
