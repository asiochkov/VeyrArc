/* Web push for VeyrArc (imported into the Workbox service worker). */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'VeyrArc', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'VeyrArc', {
    body: d.body || '', tag: d.tag || 'veyrarc', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
