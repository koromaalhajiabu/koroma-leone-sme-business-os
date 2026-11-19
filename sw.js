/* White Lion SME OS — network-first application updates with offline fallback. */
const CACHE_NAME='white-lion-sme-v216';
const APP_SHELL=[
  './',
  './index.html',
  './login-premium.css?v=3',
  './workspace-polish.css?v=3',
  './school-management.js?v=27',
  './campus-management.js?v=1',
  './parent-portal.html',
  './teacher-portal.html',
  './teacher-portal.js?v=1',
  './parent-portal.webmanifest?v=1',
  './parent-portal.js?v=4',
  './storefront-admin.js?v=2',
  './delivery-admin.js?v=2',
  './delivery-tracking.html',
  './storefront.html',
  './storefront-public.js?v=1',
  './manifest.webmanifest?v=46',
  './shared.js?v=2',
  './i18n.js?v=11',
  './cloud.js?v=61',
  './operations.js?v=22',
  './documents.js?v=3',
  './phone-unlocking.js?v=2',
  './icons/white-lion-icon.svg',
  './icons/white-lion-192.png',
  './icons/white-lion-512.png',
  './icons/white-lion-official.webp',
  './league.js?v=5',
  './billing.js?v=10',
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
    await Promise.all(APP_SHELL.map(async path => {
      try {
        const response = await fetch(path, {cache:'reload'});
        if (response && response.ok) await cache.put(path, response);
      } catch (_) {}
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

  const path = url.pathname.toLowerCase();
  const isAppCode = request.mode === 'navigate' ||
    /\.(html|js|css|webmanifest)$/.test(path);

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isAppCode) {
      // Always try the deployed version first. Use the cached copy only offline.
      try {
        const fresh = await fetch(request, {cache:'no-store'});
        if (fresh && fresh.ok) {
          await cache.put(request, fresh.clone());
          return fresh;
        }
        if (fresh) return fresh;
      } catch (_) {}
      // Keep the parent portal on its own entry page, including offline app launches.
      if (request.mode === 'navigate' && /\/parent-portal\.html$/i.test(url.pathname)) {
        const parentPage = await cache.match('./parent-portal.html', {ignoreSearch:true});
        return parentPage || Response.error();
      }
      if (request.mode === 'navigate' && /\/teacher-portal\.html$/i.test(url.pathname)) {
        const teacherPage = await cache.match('./teacher-portal.html', {ignoreSearch:true});
        return teacherPage || Response.error();
      }
      // Keep the public leagues app on its own entry page, including offline launches.
      if (request.mode === 'navigate' && /\/public-leagues\.html$/i.test(url.pathname)) {
        const publicPage = await cache.match('./public-leagues.html', {ignoreSearch:true});
        return publicPage || Response.error();
      }
      const cached = await cache.match(request) ||
        (request.mode === 'navigate' ? await cache.match('./index.html') : null);
      return cached || Response.error();
    }

    // Static media can be served from cache immediately.
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    } catch (_) {
      return Response.error();
    }
  })());
});
