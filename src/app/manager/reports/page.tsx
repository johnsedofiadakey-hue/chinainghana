"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { ReportsPanel } from "@/components/console/Reports";

export default function ManagerReportsPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <ReportsPanel fixedBranchId={branchId} />;
}
