// Offline support: cache the app shell; always go to the network first so content and sign-in stay current.
const VERSION = '2026-11-28-6';
const CACHE = 'leadership-lab-' + VERSION;
const SHELL = ['/', '/css/fonts.css', '/css/app.css', '/app.js', '/lessons.js', '/decks.js', '/diagrams.js', '/icons.js', '/photos.js', '/qr.js', '/vendor/qrcode.js', '/assessment.js', '/i18n/index.js', '/i18n/en.js', '/i18n/dv.js', '/i18n/content/dv.js', '/assets/fonts/noto-sans-thaana-thaana-400-normal.woff2', '/assets/fonts/noto-sans-thaana-thaana-700-normal.woff2', '/assets/icon.svg', '/manifest.webmanifest',
  '/assets/fonts/ibm-plex-sans.woff2', '/assets/fonts/barlow-condensed-600.woff2', '/assets/fonts/barlow-condensed-700.woff2', '/assets/fonts/ibm-plex-mono-500.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/login' || url.pathname === '/join') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request.mode === 'navigate' ? '/' : e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request.mode === 'navigate' ? '/' : e.request))
  );
});
