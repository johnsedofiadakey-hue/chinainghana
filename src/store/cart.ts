"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Unit } from "@/lib/types";

export interface CartEntry {
  productId: string;
  unit: Unit;
  qty: number;
}

interface CartState {
  /** Carts are kept per branch because each branch has its own products & prices. */
  carts: Record<string, Record<string, CartEntry>>;
  setQty: (branchId: string, productId: string, unit: Unit, qty: number) => void;
  remove: (branchId: string, productId: string, unit: Unit) => void;
  clear: (branchId: string) => void;
}

export const cartKey = (productId: string, unit: Unit) => `${productId}:${unit}`;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      carts: {},
      setQty: (branchId, productId, unit, qty) =>
        set((s) => {
          const cart = { ...(s.carts[branchId] ?? {}) };
          const key = cartKey(productId, unit);
          if (qty <= 0) delete cart[key];
          else cart[key] = { productId, unit, qty };
          return { carts: { ...s.carts, [branchId]: cart } };
        }),
      remove: (branchId, productId, unit) =>
        set((s) => {
          const cart = { ...(s.carts[branchId] ?? {}) };
          delete cart[cartKey(productId, unit)];
          return { carts: { ...s.carts, [branchId]: cart } };
        }),
      clear: (branchId) => set((s) => ({ carts: { ...s.carts, [branchId]: {} } })),
    }),
    {
      name: "cig.cart.v1",
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
      }),
    },
  ),
);

const EMPTY: Record<string, CartEntry> = {};

export function useBranchCart(branchId: string | null): Record<string, CartEntry> {
  return useCart((s) => (branchId ? (s.carts[branchId] ?? EMPTY) : EMPTY));
}
