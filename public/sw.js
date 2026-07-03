/* Service Worker für die SK Kommandozentrale (PWA + Web-Push). */

// Sofort aktiv werden, kein Warten auf alte Clients.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Passthrough-Fetch — nötig, damit Browser die App als installierbar werten.
// (Kein Offline-Caching; die App braucht ohnehin Live-Daten.)
self.addEventListener("fetch", () => {});

// Push empfangen → Systembenachrichtigung anzeigen.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "SK Kommandozentrale", body: event.data && event.data.text() };
  }
  const title = data.title || "SK Kommandozentrale";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/dashboard" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klick auf die Benachrichtigung → App fokussieren oder öffnen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        for (const client of clientsArr) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
