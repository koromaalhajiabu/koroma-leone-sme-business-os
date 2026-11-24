/* Koroma Leone SME OS — network-first application updates with offline fallback. */
const CACHE_NAME='koroma-leone-sme-v309';
const APP_SHELL=[
  './',
  './index.html',
  './install.html',
  './login-premium.css?v=3',
  './workspace-polish.css?v=4',
  './dynamic-themes.css?v=3',
  './dynamic-themes.js?v=2',
  './motion-2026.css?v=2',
  './ui-80-refresh.css?v=2',
  './signature-2026.css?v=1',
  './night-sky.css?v=1',
  './motion-2026.js?v=2',
  './night-sky.js?v=1',
  './school-management.js?v=47',
  './school-analytics.js?v=2',
  './student-portal.html',
  './student-portal.js?v=5',
  './campus-management.js?v=4',
  './hospital-management.js?v=9',
  './parent-portal.html',
  './teacher-portal.html',
  './teacher-portal.js?v=2',
  './campus-student-portal.html',
  './campus-student-portal.js?v=2',
  './campus-lecturer-portal.html',
  './campus-lecturer-portal.js?v=2',
  './parent-portal.webmanifest?v=2',
  './parent-portal.js?v=4',
  './storefront-admin.js?v=2',
  './delivery-admin.js?v=2',
  './delivery-tracking.html',
  './storefront.html',
  './device-services.html',
  './device-services-public.js?v=1',
  './storefront-public.js?v=1',
  './manifest.webmanifest?v=49',
  './shared.js?v=2',
  './affiliate-marketing.js?v=4',
  './external-affiliate-networks.js?v=2',
  './platform-referrals.js?v=1',
  './i18n.js?v=11',
  './cloud.js?v=68',
  './operations.js?v=25',
  './documents.js?v=3',
  './phone-unlocking.js?v=2',
  './icons/white-lion-icon.svg',
  './icons/white-lion-192.png',
  './icons/white-lion-512.png',
  './icons/white-lion-official.webp',
  './icons/koroma-leone-tech-crest.svg?v=3',
  './league.js?v=6',
  './football-club-website.js?v=6',
  './football-club-onboarding-admin.js?v=1',
  './football-club-operations-centre.js?v=6',
  './football-club-apply.html',
  './club-website.html',
  './football-scouting.html',
  './football-clubs.html',
  './billing.js?v=12',
  './subscription-notifications.js?v=4',
  './executive-intelligence.js?v=2',
  './supplier-intelligence.js?v=1',
  './smart-reorder.js?v=2',
  './action-centre.js?v=4',
  './automation-centre.js?v=2',
  './premium-hr-loyalty.js?v=2',
  './premium-experience.js?v=1',
  './dynamic-login.js?v=3',
  './public-leagues.html',
  './public-league.html',
  './public-leagues.webmanifest?v=3'
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
      .filter(key => (key.startsWith('white-lion-sme-') || key.startsWith('koroma-leone-sme-')) && key !== CACHE_NAME)
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
      if (request.mode === 'navigate' && /\/student-portal\.html$/i.test(url.pathname)) {
        const studentPage = await cache.match('./student-portal.html', {ignoreSearch:true});
        return studentPage || Response.error();
      }
      if (request.mode === 'navigate' && /\/teacher-portal\.html$/i.test(url.pathname)) {
        const teacherPage = await cache.match('./teacher-portal.html', {ignoreSearch:true});
        return teacherPage || Response.error();
      }
      if (request.mode === 'navigate' && /\/campus-student-portal\.html$/i.test(url.pathname)) {
        const campusStudentPage = await cache.match('./campus-student-portal.html', {ignoreSearch:true});
        return campusStudentPage || Response.error();
      }
      if (request.mode === 'navigate' && /\/campus-lecturer-portal\.html$/i.test(url.pathname)) {
        const lecturerPage = await cache.match('./campus-lecturer-portal.html', {ignoreSearch:true});
        return lecturerPage || Response.error();
      }
      // Keep the public leagues app on its own entry page, including offline launches.
      if (request.mode === 'navigate' && /\/public-leagues\.html$/i.test(url.pathname)) {
        const publicPage = await cache.match('./public-leagues.html', {ignoreSearch:true});
        return publicPage || Response.error();
      }
      // Keep a club's public website on its own entry page when offline.
      if (request.mode === 'navigate' && /\/club-website\.html$/i.test(url.pathname)) {
        const clubPage = await cache.match('./club-website.html', {ignoreSearch:true});
        return clubPage || Response.error();
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
