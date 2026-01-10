/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Precache assets injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  const title = data.title || 'Puzzle Update'
  const options: NotificationOptions = {
    body: data.body || 'Someone made changes to your puzzle',
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    tag: 'puzzle-update', // Replaces existing notification with same tag
    data: {
      url: data.url || '/',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url)
    }),
  )
})
