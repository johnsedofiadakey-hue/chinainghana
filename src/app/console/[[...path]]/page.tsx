"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Spinner } from "@/components/ui/misc";

/** Role-neutral links (used by push notifications): /console/orders → /admin/orders or /manager/orders. */
function Redirect() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const params = useParams<{ path?: string[] }>();
  const search = useSearchParams();

  useEffect(() => {
    if (loading) return;
    const rest = (params.path ?? []).map(encodeURIComponent).join("/");
    const qs = search.toString();
    const target = `${rest ? `/${rest}` : ""}${qs ? `?${qs}` : ""}`;
    if (!user || !role) {
      router.replace(`/login?next=${encodeURIComponent(`/console${target}`)}`);
      return;
    }
    router.replace(`${role === "manager" ? "/manager" : "/admin"}${target}`);
  }, [loading, user, role, params.path, search, router]);

  return <Spinner className="min-h-dvh" />;
}

export default function ConsoleRedirectPage() {
  return (
    <Suspense fallback={<Spinner className="min-h-dvh" />}>
      <Redirect />
    </Suspense>
  );
}
