"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { homeForRole, useAuth } from "@/components/auth/AuthProvider";
import { RequireRole } from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

function ChangePasswordForm() {
  const { changePassword, role, profile } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (pw !== confirm) return setError("The new passwords don't match.");
    if (pw === current) return setError("Choose a password different from the current one.");
    setBusy(true);
    try {
      await changePassword(current, pw);
      toast.success("Password updated");
      router.replace(next && next.startsWith("/") && next !== "/account/password" ? next : homeForRole(role));
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(code.includes("wrong-password") || code.includes("invalid-credential") ? "Your current password is wrong." : "Couldn't update the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">
          <KeyRound className="size-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">{profile?.mustChangePassword ? "Set your own password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {profile?.mustChangePassword
            ? "You're using a temporary password. Choose a new one only you know."
            : "Keep your account safe with a strong password."}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="Current password">
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}
          </Field>
          <Field label="Confirm new password" error={error}>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
          <Button type="submit" block size="lg" loading={busy}>
            Save password
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function ChangePasswordPage() {
  return (
    <RequireRole roles={["superadmin", "admin", "manager"]}>
      <Suspense>
        <ChangePasswordForm />
      </Suspense>
    </RequireRole>
  );
}
