"use client";

import { app } from "./firebase";
import { api } from "./api";

const DEV = process.env.NODE_ENV !== "production";
const SW_URL = DEV ? "/sw.js?dev=1" : "/sw.js";
export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "";
const TOKEN_KEY = "cig.pushToken";

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch((e) => {
    console.warn("[sw] registration failed", e);
    return null;
  });
}

export type PushState = "unavailable" | "off" | "on" | "blocked";

export async function pushState(): Promise<PushState> {
  if (!VAPID_KEY || typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unavailable";
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return "unavailable";
  if (Notification.permission === "denied") return "blocked";
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
  return Notification.permission === "granted" && saved ? "on" : "off";
}

/** Asks permission, gets an FCM token tied to our service worker, and saves it on the staff profile. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await registerServiceWorker();
  if (!reg) throw new Error("This browser can't receive notifications.");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: await navigator.serviceWorker.ready });
  await api.setPushToken({ token, enabled: true });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
  return "on";
}

export async function disablePush(): Promise<PushState> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
  if (token) await api.setPushToken({ token, enabled: false }).catch(() => undefined);
  return "off";
}
