import { Capacitor } from '@capacitor/core';

/**
 * PWA & Service Worker Lifecycle Management.
 *
 * Architecture:
 * - NORMAL WEB: Serves via HTTP(S). Service Worker provides offline caching.
 * - CAPACITOR APK / ELECTRON: Assets are bundled natively on disk.
 *   Registering a Service Worker inside a WebView causes stale-chunk conflicts
 *   after APK updates. Therefore, Service Workers are strictly disabled and any
 *   legacy Service Workers from previous installs are cleaned up.
 */
export function initPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const isNative = Capacitor.isNativePlatform();
  const isElectron = window.location.protocol === 'file:' || !!(window as any).electronAPI;

  if (isNative || isElectron) {
    // Best-effort cleanup of any lingering Service Workers in native shells
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().catch(() => {});
        }
      })
      .catch(() => {
        // Safe to ignore in restricted WebView environments
      });
    return;
  }

  // Normal Web Browser: register PWA service worker once window loads
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Optional update checking
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New content available; will be used on next visit or refresh.');
              }
            });
          }
        });
      })
      .catch((err) => {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      });
  });
}
