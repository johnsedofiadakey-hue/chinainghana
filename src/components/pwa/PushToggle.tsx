"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/pwa";

function usePushState() {
  const [state, setState] = useState<PushState>("unavailable");
  useEffect(() => {
    pushState().then(setState, () => setState("unavailable"));
  }, []);
  return [state, setState] as const;
}

async function toggle(state: PushState, set: (s: PushState) => void) {
  try {
    const next = state === "on" ? await disablePush() : await enablePush();
    set(next);
    if (next === "on") toast.success("Notifications are on for this device");
    else if (next === "blocked") toast.error("Notifications are blocked. Allow them in your browser settings.");
    else toast.info("Notifications are off for this device");
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

/** Dashboard card inviting staff to turn on alerts. Hidden once on, or when push isn't set up. */
export function PushPrompt() {
  const [state, setState] = usePushState();
  const [busy, setBusy] = useState(false);
  if (state !== "off") return null;
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 print:hidden">
      <span className="flex size-10 items-center justify-center rounded-xl bg-brand-orange-soft text-brand-orange-dark">
        <BellRing className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Get alerts on this device</p>
        <p className="text-[13px] text-ink-soft">New WhatsApp orders and low stock, even when the app is closed.</p>
      </div>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await toggle(state, setState);
          setBusy(false);
        }}
      >
        Turn on
      </Button>
    </Card>
  );
}

/** Compact switch for the sidebar. */
export function PushMenuItem() {
  const [state, setState] = usePushState();
  if (state === "unavailable") return null;
  const Icon = state === "on" ? Bell : BellOff;
  return (
    <button
      type="button"
      onClick={() => toggle(state, setState)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-navy-200 hover:bg-white/8"
      title={state === "blocked" ? "Blocked in browser settings" : undefined}
    >
      <Icon className="size-4" /> Notifications: {state === "on" ? "on" : state === "blocked" ? "blocked" : "off"}
    </button>
  );
}
