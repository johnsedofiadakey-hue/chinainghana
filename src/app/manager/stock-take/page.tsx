"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { StockTakeSheet } from "@/components/console/StockTakes";

export default function ManagerStockTakePage() {
  const { branchId } = useAuth();
  if (!branchId) return null;
  return <StockTakeSheet branchId={branchId} />;
}
