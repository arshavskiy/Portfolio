/* Custom service worker — precache via Workbox injectManifest + Web Push handlers. */
import {precacheAndRoute} from 'workbox-precaching'

// Injected at build time by vite-plugin-pwa (injectManifest).
precacheAndRoute(self.__WB_MANIFEST)

// API requests are intentionally not cached/intercepted here — they always
// go straight to the network so the app shows live data, with no fallback
// cache layer to go stale. (Offline use of API data is not supported.)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// ── Web Push ──
self.addEventListener('push', (event) => {
    let payload = {}
    try {
        payload = event.data ? event.data.json() : {}
    } catch {
        payload = {title: 'StockFolio', body: event.data ? event.data.text() : ''}
    }
    
    const title = payload.title || 'StockFolio'
    const options = {
        body: payload.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: payload.data?.ticker || 'stockfolio-alert',
        data: payload.data || {},
        vibrate: [100, 50, 100],
    }
    event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification.data?.url || '/'
    event.waitUntil(
        self.clients.matchAll({type: 'window', includeUncontrolled: true}).then((clients) => {
            for (const client of clients) {
                if ('focus' in client) {
                    client.navigate(url)
                    return client.focus()
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url)
        })
    )
})
