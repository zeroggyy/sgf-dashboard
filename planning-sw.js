const PLANNING_CACHE = 'sgf-planning-shell-v1';
const PLANNING_FILES = ['index.html', 'style.css?v=1.2.3', 'dashboard-api.js?v=1.0.0', 'dashboard-shared.js?v=1.3.0', 'app_v10.js?v=1.5.0', 'planning-offline.js?v=1.0.0', 'dashboard-navigation.js?v=1.3.0'];
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type !== 'PREPARE_PLANNING') return;
  event.waitUntil((async () => {
    try { const cache = await caches.open(PLANNING_CACHE); await cache.addAll(PLANNING_FILES); event.ports[0].postMessage({ ok: true }); }
    catch (error) { event.ports[0].postMessage({ ok: false, error: error.message }); }
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url), base = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== base.origin) return;
  const relative = url.pathname.slice(base.pathname.length);
  if (!['', ...PLANNING_FILES.map(file => file.split('?')[0])].includes(relative)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(PLANNING_CACHE);
    return await cache.match(relative === '' ? new URL('index.html', base).href : event.request) || Response.error();
  }));
});
