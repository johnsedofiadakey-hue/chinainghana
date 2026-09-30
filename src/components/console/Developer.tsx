"use client";

import { useEffect, useState } from "react";
import { collection, doc, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { Building2, KeyRound, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { displayPhone, ghs, normalizeGhanaPhone } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import type { License, StaffUser } from "@/lib/types";
import { useAllBranches } from "./data";
import { CredentialsDialog, tempPassword, type Credentials } from "./Managers";

/** Super Admin (developer) only: branch licence, unlock contact and the Admin login. */
export function DeveloperPanel() {
  const license = useDocData<License>("settings/license").data;
  const { branches } = useAllBranches();
  const users = useQueryData<StaffUser>(query(collection(db, "users"), where("role", "in", ["admin", "manager"])), "dev:users").data;
  const admins = users.filter((u) => u.role === "admin");

  const [limit, setLimit] = useState("");
  const [price, setPrice] = useState("");
  const [support, setSupport] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!license) return;
    setLimit(String(license.branchLimit ?? 5));
    setPrice(String(license.unlockPriceGHS ?? 1700));
    setSupport(displayPhone(license.supportWhatsApp));
  }, [license]);

  async function saveLicense() {
    const e: Record<string, string> = {};
    const l = Number(limit);
    const p = Number(price);
    const s = support.trim() ? normalizeGhanaPhone(support) : null;
    if (!Number.isInteger(l) || l < 1 || l > 100) e.limit = "Whole number from 1 to 100.";
    if (l < branches.length) e.limit = `There are already ${branches.length} branches (including inactive ones).`;
    if (!(p >= 0)) e.price = "Enter an amount.";
    if (support.trim() && !s) e.support = "Enter a valid Ghana number.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await setDoc(doc(db, "settings", "license"), { branchLimit: l, unlockPriceGHS: p, supportWhatsApp: s ?? "", updatedAt: serverTimestamp() }, { merge: true });
      toast.success("Licence saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const used = branches.length;
  const cap = license?.branchLimit ?? 5;

  return (
    <div>
      <PageHeader title="Developer" description="Only you can see this page. The client never sees the branch limit or pricing until they hit it." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Branches used" value={`${used} / ${cap}`} sub={used >= cap ? "At the limit" : `${cap - used} left`} icon={<Building2 className="size-4" />} tone={used >= cap ? "orange" : "fresh"} />
        <StatCard label="Active branches" value={branches.filter((b) => b.active).length} icon={<Building2 className="size-4" />} />
        <StatCard label="Managers" value={users.filter((u) => u.role === "manager").length} sub={`${users.filter((u) => u.role === "manager" && !u.active).length} suspended`} icon={<Users className="size-4" />} />
        <StatCard label="Unlock fee" value={ghs(license?.unlockPriceGHS ?? 1700)} sub="per extra branch" icon={<ShieldCheck className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-lg font-bold">Branch licence</h2>
            <p className="text-sm text-ink-soft">Raise the limit after the client pays to unlock another branch.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch limit" error={errors.limit}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />}
            </Field>
            <Field label="Unlock fee (GH₵)" error={errors.price}>
              {(id) => <Input id={id} type="number" inputMode="decimal" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />}
            </Field>
          </div>
          <Field label="Support WhatsApp" error={errors.support} hint="Shown in the unlock popup when the client tries to add one branch too many.">
            {(id) => <Input id={id} type="tel" inputMode="tel" value={support} onChange={(e) => setSupport(e.target.value)} placeholder="054 773 8678" />}
          </Field>
          <div className="flex justify-end">
            <Button loading={busy} onClick={saveLicense}>
              Save licence
            </Button>
          </div>
        </Card>

        <AdminAccountCard admins={admins} />
      </div>
    </div>
  );
}

function AdminAccountCard({ admins }: { admins: StaffUser[] }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("admin");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);

  async function submit() {
    const u = username.trim().toLowerCase();
    if (name.trim().length < 2) return setErr("Enter the owner's name.");
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) return setErr("Username: 3–30 letters, numbers, dots or dashes.");
    setErr(null);
    setBusy(true);
    const password = tempPassword();
    try {
      const res = await api.setAdminAccount({ name: name.trim(), username: u, password });
      toast.success(res.created ? "Admin login created" : "Admin login restored");
      setCreds({ name: name.trim(), username: u, password, phone: "" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-bold">Admin login</h2>
        <p className="text-sm text-ink-soft">Create the owner&apos;s login, or restore it if they&apos;re locked out. Restoring sets a new temporary password.</p>
      </div>
      {admins.length > 0 && (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-inset ring-line">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <button
                type="button"
                className="text-left"
                onClick={() => {
                  setName(a.name);
                  setUsername(a.username);
                }}
              >
                <span className="font-medium">{a.name}</span> <span className="text-ink-soft">@{a.username}</span>
              </button>
              {a.active ? <Badge tone="fresh">Active</Badge> : <Badge tone="alert">Suspended</Badge>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Owner's name">
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Owner (Admin)" />}
        </Field>
        <Field label="Username">
          {(id) => <Input id={id} value={username} autoCapitalize="none" spellCheck={false} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))} />}
        </Field>
      </div>
      {err && (
        <p className="text-[13px] text-alert-ink" role="alert">
          {err}
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" loading={busy} onClick={submit}>
          <KeyRound className="size-4" /> Create or restore
        </Button>
      </div>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </Card>
  );
}
