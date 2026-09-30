/* China-in-Ghana service worker: offline shell + web push.
 * Registered as /sw.js (production) or /sw.js?dev=1 (development: push only, no caching). */
const VERSION = "v1";
const STATIC = `cig-static-${VERSION}`;
const PAGES = `cig-pages-${VERSION}`;
const IMAGES = `cig-images-${VERSION}`;
const CACHING = !new URL(self.location.href).searchParams.has("dev");
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/badge-96.png"];
const MAX_IMAGES = 300;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cig-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!CACHING || req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: network first, then the last copy, then the offline page. Staff areas are never cached.
  if (req.mode === "navigate") {
    const privatePath = /^\/(admin|manager|super|account|login|console)(\/|$)/.test(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!privatePath && res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/offline.html"))),
    );
    return;
  }

  // Build assets are content-hashed: cache first.
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/placeholders/"))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Product photos: show the cached copy straight away, refresh in the background.
  if (req.destination === "image") {
    event.respondWith(
      caches.open(IMAGES).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              cache.put(req, res.clone());
              trim(IMAGES, MAX_IMAGES);
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
  }
});

// Data-only FCM messages sent by the notify functions: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { title: "China-in-Ghana", body: event.data ? event.data.text() : "" } };
  }
  const d = payload.data || payload;
  const title = d.title || (payload.notification && payload.notification.title) || "China-in-Ghana";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || (payload.notification && payload.notification.body) || "",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: d.url || "/console" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/console", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
