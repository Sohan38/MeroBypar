import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { isStaleChunkError, autoRecoverFromStaleChunk } from './lib/updateRecovery';
import { initPwa } from './lib/pwa';

// Global error handler to catch any boot or runtime crashes (e.g. chunk loading errors)
// and prevent showing a blank screen.
function showGlobalErrorOverlay(message: string) {
  if (document.getElementById('global-error-overlay')) return;

  const isDark = document.documentElement.classList.contains('dark') ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const bgColor = isDark ? '#09090b' : '#ffffff';
  const cardBg = isDark ? '#18181b' : '#ffffff';
  const borderColor = isDark ? '#27272a' : '#e4e4e7';
  const textColor = isDark ? '#fafafa' : '#09090b';
  const textMuted = isDark ? '#a1a1aa' : '#71717a';
  const primaryBg = isDark ? '#fafafa' : '#18181b';
  const primaryFg = isDark ? '#18181b' : '#ffffff';

  const overlay = document.createElement('div');
  overlay.id = 'global-error-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.zIndex = '999999';
  overlay.style.backgroundColor = bgColor;
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '1rem';
  overlay.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  overlay.innerHTML = `
    <div style="width: 100%; max-w: 28rem; padding: 2rem; border-radius: 1rem; border: 1px solid ${borderColor}; background-color: ${cardBg}; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.5rem;">
      <div style="height: 4rem; width: 4rem; border-radius: 9999px; background-color: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; color: #ef4444; flex-shrink: 0;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 2rem; height: 2rem;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0; color: ${textColor};">Something went wrong</h2>
        <p style="font-size: 0.875rem; color: ${textMuted}; margin: 0; line-height: 1.5;">
          The application encountered an unexpected error. Tap below to reload the app.
        </p>
      </div>
      <button id="global-reload-btn" style="width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem; background-color: ${primaryBg}; color: ${primaryFg}; font-weight: 600; font-size: 0.875rem; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        Reload Application
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const btn = document.getElementById('global-reload-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      btn.innerHTML = 'Reloading...';
      btn.setAttribute('disabled', 'true');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    });
  }
}

// Standard Vite preload error listener to catch chunk load failures early
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  console.warn('[Vite Preload Error] Caught dynamic preload failure');
  autoRecoverFromStaleChunk('vite:preloadError');
});

window.addEventListener('error', (event) => {
  console.error('[Global Error Listener] Caught error:', event.error || event.message);
  if (isStaleChunkError(event.error || event.message)) {
    if (autoRecoverFromStaleChunk('window:error')) return;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Promise rejection] Caught error:', event.reason);
  if (isStaleChunkError(event.reason)) {
    event.preventDefault();
    autoRecoverFromStaleChunk('window:unhandledrejection');
  }
});

// Initialize environment-aware PWA (Web service worker or native cleanup)
initPwa();

createRoot(document.getElementById('root')!).render(<App />);
