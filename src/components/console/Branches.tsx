"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Building2, Clock, Crosshair, ExternalLink, Link2, MapPin, MessageCircle, Pencil, Plus, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorDetails, errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { displayPhone, ghs, normalizeGhanaPhone, waLink } from "@/lib/format";
import { directionsUrl, getDevicePosition, inGhana, parseCoordinates, type LatLng } from "@/lib/geo";
import type { Branch } from "@/lib/types";
import { useAllBranches } from "./data";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-2xl bg-navy-50" />,
});

interface LimitDetails {
  reason: "LIMIT_REACHED";
  limit: number;
  unlockPriceGHS: number;
  supportWhatsApp: string | null;
}

export function BranchesPanel() {
  const { branches, loading } = useAllBranches();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [limit, setLimit] = useState<LimitDetails | null>(null);
  const [toggling, setToggling] = useState<Branch | null>(null);

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Each branch has its own products, prices, stock and WhatsApp number."
        actions={
          <Button
            variant="cta"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add branch
          </Button>
        }
      />

      {loading ? (
        <Spinner />
      ) : branches.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-6" />} title="No branches yet" body="Add your first branch to start taking orders." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map((b) => (
            <Card key={b.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{b.name}</h2>
                    <Badge tone="navy">{b.code}</Badge>
                    {!b.active && <Badge tone="alert">Inactive</Badge>}
                  </div>
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-soft">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {b.address}
                      {b.landmark ? ` · ${b.landmark}` : ""}
                      {b.ghanaPostGps ? ` · ${b.ghanaPostGps}` : ""}
                    </span>
                  </p>
                  {b.hours && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                      <Clock className="size-4 shrink-0" /> {b.hours}
                    </p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                    <MessageCircle className="size-4 shrink-0 text-wa-dark" /> Orders go to {displayPhone(b.whatsapp)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(b);
                    setFormOpen(true);
                  }}
                >
                  <Pencil className="size-4" /> Edit
                </Button>
                <a href={`/b/${b.slug}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="size-4" /> Shop link
                  </Button>
                </a>
                <a href={directionsUrl(b)} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm">
                    <MapPin className="size-4" /> Map
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  className={b.active ? "ml-auto text-alert-ink hover:bg-alert-soft" : "ml-auto"}
                  onClick={() => setToggling(b)}
                >
                  <Power className="size-4" /> {b.active ? "Deactivate" : "Reactivate"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <BranchForm
        open={formOpen}
        branch={editing}
        onClose={() => setFormOpen(false)}
        onLimit={(d) => {
          setFormOpen(false);
          setLimit(d);
        }}
      />
      <UnlockDialog details={limit} onClose={() => setLimit(null)} />
      <ToggleActiveDialog branch={toggling} onClose={() => setToggling(null)} />
    </div>
  );
}

interface FormState {
  name: string;
  address: string;
  landmark: string;
  ghanaPostGps: string;
  whatsapp: string;
  phone: string;
  hours: string;
  location: LatLng | null;
  paste: string;
}

function fromBranch(b: Branch | null): FormState {
  return {
    name: b?.name ?? "",
    address: b?.address ?? "",
    landmark: b?.landmark ?? "",
    ghanaPostGps: b?.ghanaPostGps ?? "",
    whatsapp: b ? displayPhone(b.whatsapp) : "",
    phone: b?.phone ?? "",
    hours: b?.hours ?? "Mon–Sat 8:00am – 6:00pm",
    location: b ? { lat: b.lat, lng: b.lng } : null,
    paste: "",
  };
}

function BranchForm({
  open,
  branch,
  onClose,
  onLimit,
}: {
  open: boolean;
  branch: Branch | null;
  onClose: () => void;
  onLimit: (d: LimitDetails) => void;
}) {
  const [f, setF] = useState<FormState>(fromBranch(branch));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (open) {
      setF(fromBranch(branch));
      setErrors({});
    }
  }, [open, branch]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  function setLocation(p: LatLng) {
    if (!inGhana(p)) {
      setErrors((e) => ({ ...e, location: "That point is outside Ghana. Pick the branch's location on the map." }));
      return;
    }
    set("location", p);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      setLocation(await getDevicePosition());
    } catch {
      setErrors((e) => ({ ...e, location: "Couldn't get your location. Allow location access, or tap the map instead." }));
    } finally {
      setLocating(false);
    }
  }

  function applyPaste(text: string) {
    set("paste", text);
    if (!text.trim()) return;
    const p = parseCoordinates(text);
    if (p) setLocation(p);
    else setErrors((e) => ({ ...e, location: "Couldn't find coordinates in that link. Open the place in Google Maps and copy the link from the address bar." }));
  }

  const wa = normalizeGhanaPhone(f.whatsapp);

  function validate() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter the branch name.";
    if (f.address.trim().length < 3) e.address = "Enter the address.";
    if (!wa) e.whatsapp = "Enter a valid Ghana WhatsApp number, e.g. 024 123 4567.";
    if (!f.location) e.location = "Set the branch location. Customers are matched to the nearest branch.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate() || !f.location || !wa) return;
    setBusy(true);
    const data = {
      name: f.name.trim(),
      address: f.address.trim(),
      landmark: f.landmark.trim(),
      ghanaPostGps: f.ghanaPostGps.trim().toUpperCase(),
      lat: f.location.lat,
      lng: f.location.lng,
      whatsapp: wa,
      phone: f.phone.trim(),
      hours: f.hours.trim(),
    };
    try {
      if (branch) {
        await updateDoc(doc(db, "branches", branch.id), { ...data, updatedAt: serverTimestamp() });
        toast.success("Branch updated");
      } else {
        const res = await api.createBranch(data);
        toast.success(`${data.name} added · code ${res.code}`);
      }
      onClose();
    } catch (e) {
      const d = errorDetails<LimitDetails>(e);
      if (d?.reason === "LIMIT_REACHED") onLimit(d);
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={branch ? `Edit ${branch.name}` : "Add branch"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            {branch ? "Save changes" : "Add branch"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Branch name" required error={errors.name}>
            {(id) => <Input id={id} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Kaneshie" />}
          </Field>
          <Field label="Opening hours">
            {(id) => <Input id={id} value={f.hours} onChange={(e) => set("hours", e.target.value)} placeholder="Mon–Sat 8:00am – 6:00pm" />}
          </Field>
        </div>

        <Field label="Address" required error={errors.address}>
          {(id) => <Input id={id} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Winneba Road, Kaneshie, Accra" />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Landmark" hint="Helps customers find you">
            {(id) => <Input id={id} value={f.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder="Opposite Kaneshie Market" />}
          </Field>
          <Field label="GhanaPost GPS" hint="Optional">
            {(id) => <Input id={id} value={f.ghanaPostGps} onChange={(e) => set("ghanaPostGps", e.target.value)} placeholder="GA-123-4567" className="uppercase" />}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="WhatsApp number for orders" required error={errors.whatsapp} hint="Customer orders for this branch are sent here.">
            {(id) => (
              <div className="flex gap-2">
                <Input id={id} type="tel" inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="024 123 4567" />
                <a
                  href={wa ? waLink(wa, "Test message from the China-in-Ghana admin.") : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!wa}
                  className={wa ? "" : "pointer-events-none opacity-50"}
                >
                  <Button variant="whatsapp" className="h-11">
                    Test
                  </Button>
                </a>
              </div>
            )}
          </Field>
          <Field label="Other phone" hint="Optional">
            {(id) => <Input id={id} type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="030 222 3333" />}
          </Field>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-navy-900">
              Location on the map<span className="ml-0.5 text-brand-orange">*</span>
            </p>
            <Button variant="secondary" size="sm" loading={locating} onClick={useMyLocation}>
              <Crosshair className="size-4" /> I&apos;m at the branch now
            </Button>
          </div>
          <MapPicker value={f.location} onChange={setLocation} />
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <Input
              className="pl-9"
              value={f.paste}
              onChange={(e) => applyPaste(e.target.value)}
              placeholder="…or paste a Google Maps link"
              aria-label="Google Maps link"
            />
          </div>
          {errors.location ? (
            <p className="text-[13px] text-alert-ink" role="alert">
              {errors.location}
            </p>
          ) : (
            <p className="text-[13px] text-ink-soft">
              {f.location ? `Pinned at ${f.location.lat.toFixed(5)}, ${f.location.lng.toFixed(5)}. Drag the pin to adjust.` : "Tap the map to drop a pin."}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Shown only when the licence limit blocks a new branch. */
function UnlockDialog({ details, onClose }: { details: LimitDetails | null; onClose: () => void }) {
  if (!details) return null;
  const message = `Hello, I'd like to unlock an extra branch for China-in-Ghana (currently ${details.limit} branches).`;
  return (
    <Modal open={!!details} onClose={onClose} title="Add more branches" size="sm">
      <div className="space-y-3 pb-1 text-[15px]">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-orange-soft text-brand-orange-dark">
          <Building2 className="size-7" />
        </div>
        <p className="text-center">
          Your current setup supports <strong>{details.limit} branches</strong>. Adding another branch is a one-time fee of{" "}
          <strong>{ghs(details.unlockPriceGHS)}</strong>.
        </p>
        {details.supportWhatsApp ? (
          <a href={waLink(details.supportWhatsApp, message)} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="whatsapp" size="lg" block>
              <MessageCircle className="size-5" /> Contact us on WhatsApp to unlock
            </Button>
          </a>
        ) : (
          <p className="text-center text-sm text-ink-soft">Contact your developer to unlock more branches.</p>
        )}
        <Button variant="ghost" block onClick={onClose}>
          Not now
        </Button>
      </div>
    </Modal>
  );
}

function ToggleActiveDialog({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!branch) return null;
  const deactivating = branch.active;

  async function confirm() {
    if (!branch) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "branches", branch.id), { active: !branch.active, updatedAt: serverTimestamp() });
      toast.success(deactivating ? `${branch.name} deactivated` : `${branch.name} is active again`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!branch}
      onClose={onClose}
      title={deactivating ? `Deactivate ${branch.name}?` : `Reactivate ${branch.name}?`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={deactivating ? "danger" : "primary"} loading={busy} onClick={confirm}>
            {deactivating ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      }
    >
      <p className="text-[15px] text-ink-soft">
        {deactivating
          ? "Customers won't see this branch in the shop. Its products, orders and sales are kept, and you can reactivate it at any time."
          : "The branch and its visible products will show in the shop again."}
      </p>
    </Modal>
  );
}
