"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MoonStar,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
  Warehouse,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { LogoMark } from "@/components/brand/logo";
import { PushMenuItem } from "@/components/pwa/PushToggle";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useDocData } from "@/lib/hooks";
import type { Branch } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  mobile?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, mobile: true },
  { href: "/admin/sales", label: "Sales", icon: Receipt, mobile: true },
  { href: "/admin/products", label: "Products", icon: Package, mobile: true },
  { href: "/admin/branches", label: "Branches", icon: Building2 },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/stock-takes", label: "Stock takes", icon: ClipboardCheck },
  { href: "/admin/close", label: "Daily close", icon: MoonStar },
  { href: "/admin/staff", label: "Managers", icon: Users },
  { href: "/admin/activity", label: "Activity log", icon: History },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/help", label: "Help", icon: CircleHelp },
];

const MANAGER_NAV: NavItem[] = [
  { href: "/manager", label: "Today", icon: LayoutDashboard, mobile: true },
  { href: "/manager/orders", label: "Orders", icon: ShoppingCart, mobile: true },
  { href: "/manager/sales", label: "Sales", icon: Receipt, mobile: true },
  { href: "/manager/products", label: "Products", icon: Package, mobile: true },
  { href: "/manager/branch", label: "My branch", icon: Store },
  { href: "/manager/stock-take", label: "Stock take", icon: ClipboardCheck },
  { href: "/manager/close", label: "Daily close", icon: MoonStar },
  { href: "/manager/reports", label: "Reports", icon: BarChart3 },
  { href: "/manager/help", label: "Help", icon: CircleHelp },
];

const SUPER_NAV: NavItem[] = [{ href: "/super", label: "Developer", icon: ShieldCheck }];

export function ConsoleShell({ area, children }: { area: "admin" | "manager"; children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, role, branchId, signOut } = useAuth();
  const branch = useDocData<Branch>(area === "manager" && branchId ? `branches/${branchId}` : null).data;

  const nav = area === "admin" ? [...ADMIN_NAV, ...(role === "superadmin" ? SUPER_NAV : [])] : MANAGER_NAV;
  const isActive = (href: string) => (href === "/admin" || href === "/manager" ? pathname === href : pathname.startsWith(href));
  const subtitle = area === "admin" ? (role === "superadmin" ? "Developer" : "Admin · All branches") : `Manager · ${branch?.name ?? "…"}`;
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = nav.filter((n) => n.mobile);
  const more = nav.filter((n) => !n.mobile);
  const onMorePage = more.some((n) => isActive(n.href));

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-navy-900 text-white md:flex print:hidden">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark variant="orange" />
          <div className="leading-tight">
            <p className="font-display text-[15px] font-black">
              China<span className="text-brand-orange">-in-</span>Ghana
            </p>
            <p className="text-[12px] text-navy-200">{subtitle}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive(item.href) ? "bg-white text-navy-900" : "text-navy-100 hover:bg-white/8",
              )}
            >
              <item.icon className={cn("size-[18px]", isActive(item.href) ? "text-brand-orange" : "")} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-white/10 p-3">
          <PushMenuItem />
          <Link href="/" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/8">
            <ExternalLink className="size-4" /> View shop
          </Link>
          <Link href="/account/password" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/8">
            <KeyRound className="size-4" /> Change password
          </Link>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/8">
            <LogOut className="size-4" /> Sign out
          </button>
          <p className="truncate px-3 pt-2 text-[12px] text-navy-300">Signed in as {profile?.name ?? profile?.username ?? "…"}</p>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-3 text-white md:hidden print:hidden">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" variant="orange" />
          <div className="leading-tight">
            <p className="font-display text-sm font-black">China-in-Ghana</p>
            <p className="text-[11px] text-navy-200">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/${area}/help`}
            aria-label="Help"
            className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-white/10"
          >
            <CircleHelp className="size-5" />
          </Link>
          <button type="button" onClick={signOut} aria-label="Sign out" className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-white/10">
            <LogOut className="size-5" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Bottom tabs (mobile) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white md:hidden print:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-lg">
          {tabs.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive(item.href) ? "text-navy-700" : "text-ink-soft",
              )}
            >
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", isActive(item.href) && "bg-navy-50")}>
                <item.icon className={cn("size-5", isActive(item.href) && "text-brand-orange")} />
              </span>
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", onMorePage || moreOpen ? "text-navy-700" : "text-ink-soft")}
          >
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", (onMorePage || moreOpen) && "bg-navy-50")}>
              <Menu className={cn("size-5", onMorePage && "text-brand-orange")} />
            </span>
            More
          </button>
        </div>
      </nav>

      {/* Everything that doesn't fit in the bottom bar (mobile) */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu" description={subtitle} size="sm">
        <div className="grid grid-cols-3 gap-2">
          {more.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center text-[13px] font-medium ring-1 ring-inset",
                isActive(item.href) ? "bg-navy-50 text-navy-900 ring-navy-200" : "bg-white text-navy-800 ring-line hover:bg-surface",
              )}
            >
              <item.icon className={cn("size-6", isActive(item.href) ? "text-brand-orange" : "text-navy-500")} />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 divide-y divide-line rounded-2xl ring-1 ring-inset ring-line">
          <Link href="/" target="_blank" className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-navy-800">
            <ExternalLink className="size-4 text-navy-500" /> View shop
          </Link>
          <Link href="/account/password" onClick={() => setMoreOpen(false)} className="flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-navy-800">
            <KeyRound className="size-4 text-navy-500" /> Change password
          </Link>
          <button type="button" onClick={signOut} className="flex min-h-12 w-full items-center gap-3 px-4 text-sm font-medium text-alert-ink">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <p className="mt-3 truncate text-center text-[12px] text-ink-soft">Signed in as {profile?.name ?? profile?.username ?? "…"}</p>
      </Modal>
    </div>
  );
}
