"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { ProductsPanel } from "@/components/console/Products";

export default function ManagerProductsPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <ProductsPanel fixedBranchId={branchId} />;
}
