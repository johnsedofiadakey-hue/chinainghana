"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { DailyClosePanel } from "@/components/console/DailyClose";

export default function ManagerDailyClosePage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <DailyClosePanel fixedBranchId={branchId} />;
}
