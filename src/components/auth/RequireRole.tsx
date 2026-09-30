"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/misc";
import type { Role } from "@/lib/types";
import { homeForRole, useAuth } from "./AuthProvider";

/** Client-side route guard. Real enforcement is in Security Rules & Functions. */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, role, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const allowed = !!user && !!role && roles.includes(role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!allowed) {
      router.replace(homeForRole(role));
      return;
    }
    if (profile?.mustChangePassword && pathname !== "/account/password") {
      router.replace(`/account/password?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, allowed, role, profile?.mustChangePassword, pathname, router]);

  if (loading || !allowed) return <Spinner className="min-h-dvh" />;
  return <>{children}</>;
}
