/* VBS Quick Bill – opens instantly and keeps working offline.
   Only the billing screen is cached. API calls always go to the network.
   Change CACHE name (v1 -> v2) whenever you update quickbill.html / quickbill.js. */
const CACHE = 'vbs-quickbill-v1';
const SHELL = ['/quickbill', '/quickbill.html', '/js/quickbill.js?v=1', '/manifest.json', '/images/VBS_logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const isShell = SHELL.some(s => s.split('?')[0] === url.pathname) || url.pathname === '/quickbill';
  if (!isShell) return;
  // cache first (instant open), refresh in the background
  e.respondWith(caches.match(req, { ignoreSearch: false }).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())); return r; }).catch(() => hit);
    return hit || net;
  }));
});
