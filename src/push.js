// src/push.js — extracted verbatim from the original single-file app. Body is unchanged.
import { api } from './api.js';
// ===== injected by scripts/wire.js — do not edit below this line in the header =====
    /* ============================ PUSH NOTIFICATIONS ============================ */
    let swRegistration = null;

    const pushSupported = () =>
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(base64);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    }

    const tellSw = (type, contextId) => {
      try {
        const sw = (swRegistration && swRegistration.active) ||
          (navigator.serviceWorker && navigator.serviceWorker.controller);
        if (sw) sw.postMessage({ type, contextId: String(contextId) });
      } catch (e) { /* ignore */ }
    };

    async function ensureServiceWorker() {
      if (!('serviceWorker' in navigator)) return null;
      try {
        swRegistration = await navigator.serviceWorker.register('sw.js', { scope: './' });
        return swRegistration;
      } catch (e) {
        return null;
      }
    }

    async function subscribePush() {
      if (!pushSupported()) return { ok: false, reason: 'unsupported' };
      const reg = await ensureServiceWorker();
      if (!reg) return { ok: false, reason: 'sw-failed' };
      if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
      const { public_key } = await api.getPushVapidKey();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        });
      }
      await api.pushSubscribe({
        subscription: sub.toJSON(),
        platform: 'web',
        user_agent: navigator.userAgent,
      });
      return { ok: true };
    }

    async function enablePush() {
      if (!pushSupported()) return { ok: false, reason: 'unsupported' };
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return { ok: false, reason: perm };
      } else if (Notification.permission !== 'granted') {
        return { ok: false, reason: Notification.permission };
      }
      return subscribePush();
    }

    async function disablePush() {
      if (!pushSupported()) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            try { await api.pushUnsubscribe(sub.endpoint); } catch (e) { /* ignore */ }
            await sub.unsubscribe();
          }
        }
      } catch (e) { /* ignore */ }
    }

    async function refreshPushOnLogin() {
      if (!pushSupported() || Notification.permission !== 'granted') return;
      try { await subscribePush(); } catch (e) { /* ignore */ }
    }

export { pushSupported, tellSw, ensureServiceWorker, subscribePush, enablePush, disablePush, refreshPushOnLogin };
