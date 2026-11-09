/* Service worker v2 : hors-ligne complet (application + bibliothèques CDN), page de secours,
   Supabase jamais mis en cache (données toujours fraîches ; l'app garde sa copie locale). */
const CACHE = 'comores-v2', TILES = 'comores-tiles-v1';
const SHELL = ['./', './index.html', './offline.html', './config.js', './extensions.js',
  './politique-confidentialite.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    // Les CDN sont mis en cache un par un (en "no-cors") : un échec n'empêche pas l'installation.
    await Promise.allSettled(CDN.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE && x !== TILES).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('open-meteo')) return; // réseau direct
  if (url.hostname.endsWith('tile.openstreetmap.org')) {          // tuiles de carte : cache plafonné
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const r = await fetch(req); c.put(req, r.clone()); c.keys().then(k => k.length > 300 && c.delete(k[0])); return r; }
      catch { return Response.error(); }
    }));
    return;
  }
  if (req.mode === 'navigate') {                                   // pages : réseau d'abord
    e.respondWith(fetch(req).then(r => { caches.open(CACHE).then(c => c.put(req, r.clone())); return r; })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')) || caches.match('./offline.html')));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {               // assets : cache d'abord + mise à jour
    const cached = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => cached);
    return cached || net;
  }));
});
