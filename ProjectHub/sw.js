/* ==========================================================================
   PROJECTHUB - Service Worker (PWA & Offline Cache)
   Centro Educativo Nonogasta (C.E.N.) - La Rioja
   ========================================================================== */

const CACHE_NAME = 'projecthub-cen-cache-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './assets/css/styles.css',
    './assets/js/supabaseClient.js',
    './assets/js/app.js',
    './assets/img/ProjectHub.png',
    './assets/img/ProjectHub2.jpg'
];

// Instalación del Service Worker y precaché de recursos críticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activación y limpieza de cachés antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Estrategia Network-First con fallback a Caché para datos frescos y navegación offline
self.addEventListener('fetch', (event) => {
    // Solo interceptar peticiones GET
    if (event.request.method !== 'GET') return;

    // Ignorar peticiones no seguras o externas no cacheables
    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.headers.get('accept')?.includes('text/html')) {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});

