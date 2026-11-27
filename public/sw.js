/* Service worker: shows notifications and brings the app to the front when one is clicked.
   It intentionally does not cache anything, so deployments are always up to date. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId || '';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        client.postMessage({ type: 'open-task', taskId });
      } else await self.clients.openWindow('/#today');
    })(),
  );
});
