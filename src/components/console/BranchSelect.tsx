"use client";

import { Building2 } from "lucide-react";
import type { Branch } from "@/lib/types";

export function BranchSelect({
  branches,
  value,
  onChange,
  allowAll = true,
}: {
  branches: Branch[];
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
}) {
  return (
    <label className="relative inline-flex items-center">
      <Building2 className="pointer-events-none absolute left-3 size-4 text-navy-600" />
      <span className="sr-only">Branch</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-xl bg-white pl-9 pr-9 text-sm font-medium text-navy-900 ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-navy-500"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235b6785' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          backgroundSize: "16px",
        }}
      >
        {allowAll && <option value="all">All branches</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
    </label>
  );
}
