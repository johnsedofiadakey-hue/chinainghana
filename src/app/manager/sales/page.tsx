"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { SalesPanel } from "@/components/console/Sales";

export default function ManagerSalesPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <SalesPanel fixedBranchId={branchId} basePath="/manager" />;
}
