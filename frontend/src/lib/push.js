import { api } from './api.js';

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;
}

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function getPushRegistration() {
  if (!pushSupported()) return null;
  const ready = await withTimeout(navigator.serviceWorker.ready, 6000, null);
  if (ready) return ready;
  return withTimeout(navigator.serviceWorker.getRegistration(), 1500, null);
}

export async function getCurrentSubscription() {
  const reg = await getPushRegistration();
  if (!reg) return null;
  return withTimeout(reg.pushManager.getSubscription(), 3500, null);
}

export async function syncSubscription(subscription) {
  if (!subscription) return null;
  return api.post('/push/subscribe', { subscription: subscription.toJSON() });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export async function subscribeCurrentDevice() {
  if (!pushSupported()) throw new Error('Este navegador não suporta Web Push.');
  const reg = await getPushRegistration();
  if (!reg) {
    throw new Error('O service worker ainda não está pronto. Feche e abra o PWA instalado e tente novamente.');
  }
  const key = await api.get('/push/public-key');
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.publicKey),
    }));
  await syncSubscription(subscription);
  return subscription;
}

export async function unsubscribeCurrentDevice() {
  const subscription = await getCurrentSubscription();
  if (!subscription) return false;
  await api.delete('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
  return true;
}

export async function pushStatusForCurrentDevice() {
  const subscription = await getCurrentSubscription();
  if (!subscription) return { ativo: false, subscription: null };
  const status = await api.get(
    `/push/status?endpoint=${encodeURIComponent(subscription.endpoint)}`,
  );
  return { ...status, subscription };
}
