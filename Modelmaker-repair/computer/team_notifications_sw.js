// Notifications from actual Modelmaker backend receipts only.
// This service worker does not pretend to run the four models or poll in the background.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.projectId;
  const target = self.location.origin + '/?team=1' +
    (id ? '&project_id=' + encodeURIComponent(id) : '');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const current = windows.find(client => client.url.startsWith(self.location.origin + '/'));
    if (current) {
      await current.navigate(target);
      return current.focus();
    }
    return self.clients.openWindow(target);
  })());
});
