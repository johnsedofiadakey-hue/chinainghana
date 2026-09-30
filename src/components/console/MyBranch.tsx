"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Copy, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card, PageHeader, Spinner } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { displayPhone, normalizeGhanaPhone, waLink } from "@/lib/format";
import { directionsUrl } from "@/lib/geo";
import { useDocData } from "@/lib/hooks";
import type { Branch } from "@/lib/types";

/** Manager: edit own branch's WhatsApp number, other phone and opening hours. */
export function MyBranch({ branchId }: { branchId: string }) {
  const { data: branch, loading } = useDocData<Branch>(`branches/${branchId}`);
  const [whatsapp, setWhatsapp] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setWhatsapp(displayPhone(branch.whatsapp));
    setPhone(branch.phone ?? "");
    setHours(branch.hours ?? "");
  }, [branch]);

  if (loading) return <Spinner />;
  if (!branch) return <p className="text-sm text-ink-soft">Branch not found. Ask the admin to check your account.</p>;

  const wa = normalizeGhanaPhone(whatsapp);
  const shopLink = typeof window !== "undefined" ? `${window.location.origin}/b/${branch.slug}` : `/b/${branch.slug}`;

  async function save() {
    if (!branch) return;
    if (!wa) {
      setErr("Enter a valid Ghana WhatsApp number.");
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, "branches", branch.id), { whatsapp: wa, phone: phone.trim(), hours: hours.trim(), updatedAt: serverTimestamp() });
      toast.success("Branch details saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="My branch" description={`${branch.name} · code ${branch.code}`} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="space-y-4 p-5 lg:col-span-3">
          <Field label="WhatsApp number for orders" required error={err} hint="Customer orders for your branch arrive on this number.">
            {(id) => (
              <div className="flex gap-2">
                <Input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  value={whatsapp}
                  onChange={(e) => {
                    setWhatsapp(e.target.value);
                    setErr(null);
                  }}
                />
                <a href={wa ? waLink(wa, "Test message from China-in-Ghana.") : undefined} target="_blank" rel="noopener noreferrer" className={wa ? "" : "pointer-events-none opacity-50"}>
                  <Button variant="whatsapp" className="h-11">
                    Test
                  </Button>
                </a>
              </div>
            )}
          </Field>
          <Field label="Other phone" hint="Optional">
            {(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Opening hours">
            {(id) => <Input id={id} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Mon–Sat 8:00am – 6:00pm" />}
          </Field>
          <div className="flex justify-end">
            <Button loading={busy} onClick={save}>
              Save
            </Button>
          </div>
        </Card>

        <Card className="space-y-3 p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Share your shop</h2>
          <p className="text-sm text-ink-soft">Send this link to customers. It opens straight to your branch&apos;s prices and stock.</p>
          <p className="break-all rounded-xl bg-surface p-3 text-sm font-medium">{shopLink}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(shopLink).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"))}>
              <Copy className="size-4" /> Copy
            </Button>
            <a href={`/b/${branch.slug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" block>
                <ExternalLink className="size-4" /> Open
              </Button>
            </a>
          </div>
          <div className="border-t border-line pt-3 text-sm text-ink-soft">
            <p className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {branch.address}
              {branch.landmark ? ` · ${branch.landmark}` : ""}
            </p>
            <a href={directionsUrl(branch)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-medium text-navy-600 hover:underline">
              View on map
            </a>
            <p className="mt-2 text-[13px]">To change the name, address or map location, ask the admin.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
