self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "Novo chamado — Givova TI";
  const path = typeof payload.url === "string" && payload.url.startsWith("/ti") ? payload.url : "/ti";
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || "Há uma nova solicitação aguardando atendimento.",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || "givova-ti-new-ticket",
    renotify: true,
    requireInteraction: true,
    data: { path },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const path = event.notification.data?.path || "/ti";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
