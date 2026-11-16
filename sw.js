/* White Lion SME OS — network-first application updates with offline fallback. */
const CACHE_NAME='white-lion-sme-v180';
const APP_SHELL=[
  './',
  './index.html',
  './login-premium.css?v=4',
  './workspace-polish.css?v=3',
  './workspace-navigation.js?v=1',
  './storefront-admin.js?v=2',
  './delivery-admin.js?v=2',
  './delivery-tracking.html',
  './storefront.html',
  './storefront-public.js?v=1',
  './device-services.html',
  './device-services-public.js?v=8',
  './manifest.webmanifest?v=46',
  './shared.js?v=2',
  './i18n.js?v=11',
  './cloud.js?v=49',
  './phone-unlocking.js?v=24',
  './operations.js?v=22',
  './documents.js?v=3',
  './icons/white-lion-icon.svg',
  './icons/white-lion-192.png',
  './icons/white-lion-512.png',
  './icons/white-lion-official.webp',
  './league.js?v=5',
  './billing.js?v=9',
  './executive-intelligence.js?v=2',
  './supplier-intelligence.js?v=1',
  './smart-reorder.js?v=2',
  './action-centre.js?v=4',
  './premium-experience.js?v=1',
  './dynamic-login.js?v=3',
  './public-leagues.html',
  './public-leagues.webmanifest?v=2'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const critical = [
      './',
      './index.html',
      './login-premium.css?v=4',
      './workspace-polish.css?v=3'
    ];
    await Promise.all(critical.map(async path => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(path, {cache:'reload', signal:controller.signal});
        if (response && response.ok) await cache.put(path, response);
      } catch (_) {
        // Installation must not hang indefinitely on a slow mobile connection.
      } finally {
        clearTimeout(timeout);
      }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('white-lion-sme-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      // Serve the last verified app asset immediately on repeat visits.
      // Refresh it in the background so a slow mobile connection does not
      // hold the screen open while GitHub Pages responds.
      event.waitUntil(fetch(request, {cache:'no-store'}).then(response => {
        if (response && response.ok) return cache.put(request, response.clone());
      }).catch(() => {}));
      return cached;
    }

    // First visit or newly-versioned asset: use the network, then save it.
    try {
      const fresh = await fetch(request, {cache:'no-store'});
      if (fresh && fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    } catch (_) {
      if (request.mode === 'navigate') {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
