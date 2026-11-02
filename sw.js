/* Mylo service worker — Web Push handler for in-browser notifications
   + precache of the static shell (API requests are never intercepted). */

const APP_BASE = new URL('./', self.registration.scope).href;
const LOGO_URL = new URL('mylogo.png', self.registration.scope).href;
const activeContexts = new Set();

/* ============================ STATIC SHELL CACHE ============================ */
// Bump this whenever index.html / app.js / style.css are redeployed.
// Must match the ?v= versions used in index.html.
const CACHE_VERSION = 'v2.0.1';
const CACHE_NAME = 'mylo-static-' + CACHE_VERSION;
const PRECACHE = [
  '',                       // the app shell (index.html)
  'app.js?v=2.0.1',
  'style.css?v=1.4.1',
  'background.webp',
  'background-lite.webp',
  'mylogo.png',
].map((p) => new URL(p, APP_BASE).href);

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch(() => { })));
}

async function cleanupOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('mylo-static-') && n !== CACHE_NAME).map((n) => caches.delete(n)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([cleanupOldCaches(), self.clients.claim()]));
});

// Cache policy (same-origin only, everything else is an exact passthrough):
//   - precached static assets  -> cache-first (their URLs are versioned/immutable)
//   - the app shell navigation -> network-first, cached copy as offline fallback
//   - everything else (API, uploads, cross-origin) -> untouched, network only.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  const isNavigation = req.mode === 'navigate' && req.url === APP_BASE;
  const isPrecached = !isNavigation && PRECACHE.includes(req.url);
  if (!isNavigation && !isPrecached) return;

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req.url, fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req.url);
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req.url);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      cache.put(req.url, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});

/* ============================ PUSH NOTIFICATIONS ============================ */

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'context-focus' && msg.contextId) {
    activeContexts.add(String(msg.contextId));
  } else if (msg.type === 'context-blur' && msg.contextId) {
    activeContexts.delete(String(msg.contextId));
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event));
});

async function handlePush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }

  if (data.context_id && activeContexts.has(String(data.context_id))) {
    const clientList = await self.clients.matchAll({ type: 'window' });
    if (clientList.some((c) => c.focused)) return;
  }

  const options = {
    body: data.body || '',
    icon: data.icon_url || LOGO_URL,
    badge: LOGO_URL,
    tag: data.tag || 'mylo',
    renotify: true,
    data: { url: data.url || APP_BASE, payload: data },
  };
  if (data.image_url) options.image = data.image_url;

  return self.registration.showNotification(data.title || 'Mylo', options);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(handleNotificationClick(event));
});

async function handleNotificationClick(event) {
  const payload = (event.notification.data && event.notification.data.payload) || null;
  const url = (event.notification.data && event.notification.data.url) || APP_BASE;

  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = clientList.find((c) => c.url.startsWith(APP_BASE));
  if (existing) {
    await existing.focus();
    if (payload) existing.postMessage({ type: 'PUSH_CLICK', payload });
    return;
  }

  let target = url;
  if (payload) {
    const p = new URLSearchParams();
    if (payload.target_type) p.set('ntt', payload.target_type);
    if (payload.target_id) p.set('ntid', payload.target_id);
    if (payload.circle_id) p.set('ncid', payload.circle_id);
    if (payload.source_handle) p.set('nsh', payload.source_handle);
    const s = p.toString();
    if (s) target = url + (url.indexOf('?') === -1 ? '?' : '&') + s;
  }
  await self.clients.openWindow(target);
}
