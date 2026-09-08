/* Mylo service worker — Web Push handler for in-browser notifications */

const APP_BASE = new URL('./', self.registration.scope).href;
const LOGO_URL = new URL('mylogo.png', self.registration.scope).href;
const activeContexts = new Set();

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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
