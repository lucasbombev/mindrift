/* Web Push do Mindrift — importado pelo service worker gerado pelo vite-plugin-pwa. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || 'Mindrift';
  const sound = data.som || '/sounds/alarme.wav';
  const options = {
    body: data.body || 'Há uma atualização no seu aluguel.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'mindrift-timer',
    renotify: true,
    silent: false,
    sound,
    vibrate: [400, 150, 400],
    data: { url: data.url || '/dashboard', som: sound },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus();
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
