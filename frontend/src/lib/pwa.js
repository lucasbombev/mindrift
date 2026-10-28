import { isSecureForServiceWorker } from './audio.js';

let deferredPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new Event('drift:install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new Event('drift:installed'));
  });
}

export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export function canInstall() {
  return Boolean(deferredPrompt);
}

export async function promptInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' };
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const choice = await prompt.userChoice;
  window.dispatchEvent(new Event('drift:install-ready'));
  return choice;
}

export function secureContextInfo() {
  return {
    secure: isSecureForServiceWorker(),
    protocol: window.location.protocol,
    host: window.location.host,
  };
}

export async function requestNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function showTimerNotification({ title, body, tag }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [400, 150, 400],
        requireInteraction: true,
        data: { url: '/' },
      });
      return true;
    }
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
    });
    notification.onclick = () => window.focus();
    return true;
  } catch {
    return false;
  }
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
      window.dispatchEvent(new CustomEvent('drift:sw-update'));
    }
  });
}
