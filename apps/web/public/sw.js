/* jey.net offline shell. API responses are never cached: they are private. */
const CACHE = "jey-shell-v7";
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function cacheable(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/og.png" ||
    url.pathname === OFFLINE
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/health")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        if (!self.navigator.onLine) {
          return (await caches.match(OFFLINE)) || Response.redirect(OFFLINE, 302);
        }
        try {
          const response = await fetch(request, { cache: "no-store" });
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        } catch {
          return (await caches.match(OFFLINE)) || Response.redirect(OFFLINE, 302);
        }
      })(),
    );
    return;
  }

  if (cacheable(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          }),
      ),
    );
  }
});


self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "jey.net";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((windows) => {
          for (const client of windows) {
            client.postMessage({ type: "jey:notification" });
          }
        }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.includes(new URL(url, self.location.origin).pathname));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    }),
  );
});
