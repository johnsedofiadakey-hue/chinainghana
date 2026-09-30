"use client";

import { useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { Copy, KeyRound, MessageCircle, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { cn, displayPhone, normalizeGhanaPhone, waLink } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import type { Branch, StaffUser } from "@/lib/types";
import { useAllBranches } from "./data";

/** Readable temporary password, e.g. "Mango-4827". Staff must change it on first login. */
export function tempPassword(): string {
  const words = ["Mango", "Kente", "Cocoa", "Palm", "Volta", "Adinkra", "Gold", "Baobab", "Shea", "Akwaaba"];
  const n = new Uint32Array(2);
  crypto.getRandomValues(n);
  return `${words[n[0] % words.length]}-${1000 + (n[1] % 9000)}`;
}

function copy(text: string, label = "Copied") {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(label),
    () => toast.error("Couldn't copy"),
  );
}

export interface Credentials {
  name: string;
  username: string;
  password: string;
  phone: string;
}

export function ManagersPanel() {
  const { branches, byId } = useAllBranches();
  const { data: managers, loading } = useQueryData<StaffUser>(query(collection(db, "users"), where("role", "==", "manager")), "managers");
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = branches
    .map((b) => ({ branch: b, list: managers.filter((m) => m.branchId === b.id).sort((a, c) => a.name.localeCompare(c.name)) }))
    .filter((g) => g.list.length || g.branch.active);

  async function setActive(m: StaffUser, active: boolean) {
    setBusyId(m.id);
    try {
      await api.updateStaff({ uid: m.id, active });
      toast.success(active ? `${m.name} can sign in again` : `${m.name} is suspended and signed out`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(m: StaffUser) {
    const password = tempPassword();
    setBusyId(m.id);
    try {
      await api.updateStaff({ uid: m.id, newPassword: password });
      setCreds({ name: m.name, username: m.username, password, phone: m.phone ?? "" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Managers"
        description="Branch managers sign in with a username. They can only see and change their own branch."
        actions={
          <Button
            variant="cta"
            disabled={!branches.some((b) => b.active)}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add manager
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : managers.length === 0 ? (
        <Card>
          <EmptyState icon={<Users className="size-6" />} title="No managers yet" body="Create a login for each branch manager. They'll set their own password when they first sign in." />
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ branch, list }) => (
            <Card key={branch.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-surface/60 px-4 py-2.5">
                <p className="font-display font-bold">{branch.name}</p>
                {!branch.active && <Badge tone="neutral">Inactive branch</Badge>}
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">No manager for this branch yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full font-display font-bold",
                          m.active ? "bg-navy-50 text-navy-700" : "bg-alert-soft text-alert-ink",
                        )}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {m.name}
                          {!m.active && <Badge tone="alert">Suspended</Badge>}
                          {m.active && m.mustChangePassword && <Badge tone="sun">Hasn&apos;t set password</Badge>}
                        </p>
                        <p className="text-[13px] text-ink-soft">
                          @{m.username}
                          {m.phone ? ` · ${displayPhone(m.phone)}` : ""}
                        </p>
                      </div>
                      <div className="flex w-full justify-end gap-1 sm:w-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(m);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busyId === m.id} onClick={() => resetPassword(m)}>
                          <KeyRound className="size-4" /> Reset password
                        </Button>
                        {m.active ? (
                          <Button variant="ghost" size="sm" className="text-alert-ink hover:bg-alert-soft" disabled={busyId === m.id} onClick={() => setActive(m, false)}>
                            <UserX className="size-4" /> Suspend
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled={busyId === m.id} onClick={() => setActive(m, true)}>
                            <UserCheck className="size-4" /> Reactivate
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
          {managers.some((m) => !m.branchId || !byId.has(m.branchId)) && (
            <p className="text-sm text-ink-soft">Some managers are linked to a branch that no longer exists. Edit them to move them to a branch.</p>
          )}
        </div>
      )}

      <ManagerForm
        open={formOpen}
        manager={editing}
        branches={branches}
        onClose={() => setFormOpen(false)}
        onCreated={(c) => {
          setFormOpen(false);
          setCreds(c);
        }}
      />
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} />
    </div>
  );
}

function ManagerForm({
  open,
  manager,
  branches,
  onClose,
  onCreated,
}: {
  open: boolean;
  manager: StaffUser | null;
  branches: Branch[];
  onClose: () => void;
  onCreated: (c: Credentials) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(manager?.name ?? "");
    setUsername(manager?.username ?? "");
    setPhone(manager?.phone ? displayPhone(manager.phone) : "");
    setBranchId(manager?.branchId ?? branches.find((b) => b.active)?.id ?? "");
    setErrors({});
  }, [open, manager, branches]);

  // Suggest a username from the branch, e.g. "kaneshie.manager".
  useEffect(() => {
    if (manager || !open || username) return;
    const b = branches.find((x) => x.id === branchId);
    if (b) setUsername(`${b.slug.split("-")[0]}.manager`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, open]);

  async function save() {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter the manager's name.";
    if (!manager && !/^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase())) e.username = "3–30 letters, numbers, dots or dashes. No spaces.";
    const normPhone = phone.trim() ? normalizeGhanaPhone(phone) : "";
    if (normPhone === null) e.phone = "Enter a valid Ghana number or leave it empty.";
    if (!branchId) e.branchId = "Choose a branch.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      if (manager) {
        await api.updateStaff({
          uid: manager.id,
          name: name.trim(),
          phone: normPhone ?? "",
          branchId: branchId !== manager.branchId ? branchId : undefined,
        });
        toast.success(branchId !== manager.branchId ? `${name.trim()} moved. They'll need to sign in again.` : "Manager updated");
        onClose();
      } else {
        const password = tempPassword();
        const u = username.trim().toLowerCase();
        await api.createStaff({ name: name.trim(), username: u, password, phone: normPhone ?? "", branchId });
        onCreated({ name: name.trim(), username: u, password, phone: normPhone ?? "" });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={manager ? `Edit ${manager.name}` : "Add manager"}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            {manager ? "Save" : "Create login"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Branch" required error={errors.branchId}>
          {(id) => (
            <Select id={id} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches
                .filter((b) => b.active || b.id === manager?.branchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Full name" required error={errors.name}>
          {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Abena Owusu" />}
        </Field>
        <Field label="Username" required={!manager} error={errors.username} hint={manager ? "Usernames can't be changed." : "They type this to sign in."}>
          {(id) => (
            <Input
              id={id}
              value={username}
              disabled={!!manager}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ""))}
              placeholder="kaneshie.manager"
            />
          )}
        </Field>
        <Field label="Phone / WhatsApp" hint="Optional — to send them their login" error={errors.phone}>
          {(id) => <Input id={id} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 123 4567" />}
        </Field>
        {!manager && <p className="text-[13px] text-ink-soft">A temporary password is created for you. They choose their own password the first time they sign in.</p>}
      </div>
    </Modal>
  );
}

export function CredentialsDialog({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  if (!creds) return null;
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const message = `Hello ${creds.name}, here is your China-in-Ghana staff login.\n\nSign in: ${loginUrl}\nUsername: ${creds.username}\nTemporary password: ${creds.password}\n\nYou'll be asked to choose your own password after signing in.`;

  return (
    <Modal open={!!creds} onClose={onClose} title="Login ready" description={`Give these details to ${creds.name}.`} size="sm">
      <div className="space-y-3 pb-1">
        <div className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-inset ring-line">
          {[
            ["Username", creds.username],
            ["Temporary password", creds.password],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[12px] text-ink-soft">{label}</p>
                <p className="font-mono text-[15px] font-semibold text-navy-900">{value}</p>
              </div>
              <button type="button" onClick={() => copy(value, `${label} copied`)} className="inline-flex size-9 items-center justify-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label={`Copy ${label}`}>
                <Copy className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-ink-soft">This password is shown only once. They must change it when they first sign in.</p>
        {creds.phone ? (
          <a href={waLink(creds.phone, message)} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="whatsapp" block>
              <MessageCircle className="size-4" /> Send on WhatsApp
            </Button>
          </a>
        ) : (
          <Button variant="secondary" block onClick={() => copy(message, "Login details copied")}>
            <Copy className="size-4" /> Copy message
          </Button>
        )}
        <Button variant="ghost" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
