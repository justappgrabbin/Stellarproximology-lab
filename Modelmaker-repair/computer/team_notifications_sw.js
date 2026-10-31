// Notifications from actual Modelmaker backend receipts only.
// This service worker does not pretend to run the four models or poll in the background.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = self.location.origin + '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const window = windows.find(client => client.url.startsWith(target));
    if (window) return window.focus();
    return self.clients.openWindow(target);
  })());
});
