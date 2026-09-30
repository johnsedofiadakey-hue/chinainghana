"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { homeForRole, useAuth } from "@/components/auth/AuthProvider";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

function LoginForm() {
  const { signIn, user, role, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && role) router.replace(next && next.startsWith("/") ? next : homeForRole(role));
  }, [loading, user, role, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      const r = await signIn(username, password);
      if (!r) setError("This account doesn't have staff access.");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(
        code === "auth/user-disabled"
          ? "This account is suspended. Contact the admin."
          : code === "auth/too-many-requests"
            ? "Too many attempts. Wait a minute and try again."
            : code === "auth/network-request-failed"
              ? "No connection. Check your internet and try again."
              : "Wrong username or password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-navy-900">
      <div className="relative overflow-hidden px-6 pb-16 pt-10">
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-brand-orange/20 blur-2xl" />
        <div className="absolute -left-16 top-24 size-40 rounded-full bg-sun/15 blur-2xl" />
        <div className="relative mx-auto max-w-md">
          <Link href="/" aria-label="Back to shop" className="-my-2 inline-flex py-2">
            <Logo inverted />
          </Link>
          <h1 className="mt-8 font-display text-3xl font-black text-white">Staff sign in</h1>
          <p className="mt-1 text-navy-200">Admins and branch managers.</p>
        </div>
      </div>
      <div className="-mt-8 flex-1 rounded-t-[28px] bg-surface px-6 pt-8">
        <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-4" noValidate>
          <Field label="Username" error={null}>
            {(id) => (
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                <Input
                  id={id}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="accra.manager"
                  className="pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}
          </Field>
          <Field label="Password" error={error}>
            {(id) => (
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                <Input
                  id={id}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  className="px-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-soft hover:bg-navy-50"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            )}
          </Field>
          <Button type="submit" size="lg" block loading={busy}>
            Sign in
          </Button>
          <p className="pt-2 text-center text-[13px] text-ink-soft">Forgot your password? Ask the admin to reset it.</p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
