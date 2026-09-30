"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Dashboard } from "@/components/console/Dashboard";

export default function ManagerTodayPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <Dashboard branchId={branchId} basePath="/manager" />;
}
