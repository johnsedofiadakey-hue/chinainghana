"use client";

import { useMemo } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useDocData, useQueryData } from "@/lib/hooks";
import type { AppSettings, Branch, Category } from "@/lib/types";

/** All branches (staff can read inactive ones too). */
export function useAllBranches() {
  const q = useQueryData<Branch>(collection(db, "branches"), "console:branches");
  const sorted = useMemo(() => [...q.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)), [q.data]);
  const byId = useMemo(() => new Map(sorted.map((b) => [b.id, b])), [sorted]);
  return { branches: sorted, byId, loading: q.loading };
}

export function useCategories() {
  const q = useQueryData<Category>(collection(db, "categories"), "console:categories");
  return useMemo(() => [...q.data].sort((a, b) => a.sortOrder - b.sortOrder), [q.data]);
}

export function useSettings() {
  return useDocData<AppSettings>("settings/app").data;
}

/** "all" for admin across every branch, or a single branch id. */
export type Scope = "all" | string;

export function scopedQuery(col: string, scope: Scope, max = 200) {
  const ref = collection(db, col);
  return scope === "all"
    ? query(ref, orderBy("createdAt", "desc"), limit(max))
    : query(ref, where("branchId", "==", scope), orderBy("createdAt", "desc"), limit(max));
}
