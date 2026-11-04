/* Givova TI — Web Push service worker (notifications only; no caching). */
self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "Novo chamado — Givova TI";
  // Only same-site technician paths are allowed as click targets.
  const path = typeof payload.url === "string" && /^\/ti(\/|\?|$)/.test(payload.url) ? payload.url : "/ti/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof payload.body === "string" ? payload.body.slice(0, 240) : "Há uma nova solicitação aguardando atendimento.",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: typeof payload.tag === "string" ? payload.tag : "givova-ti-new-ticket",
      renotify: true,
      requireInteraction: true,
      data: { path },
    }),
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.path || "/ti/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
