"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa";

/** Registers the service worker (offline shell + push) once per load. */
export function PwaRegister() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
