"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { NewSale } from "@/components/console/NewSale";

export default function ManagerNewSalePage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <NewSale fixedBranchId={branchId} basePath="/manager" />;
}
