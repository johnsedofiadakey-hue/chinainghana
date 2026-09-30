"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { OrdersPanel } from "@/components/console/Orders";

export default function ManagerOrdersPage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <OrdersPanel fixedBranchId={branchId} />;
}
