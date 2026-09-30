"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { MyBranch } from "@/components/console/MyBranch";

export default function ManagerBranchPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <MyBranch branchId={branchId} />;
}
