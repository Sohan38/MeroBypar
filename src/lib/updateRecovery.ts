const STALE_CHUNK_RECOVERY_KEY = 'merobyapar:auto-recover-from-stale-chunk';
const RECOVERY_COOLDOWN_MS = 10000; // 10 seconds

/**
 * Checks whether an error is caused by a missing, stale, or failed dynamic chunk import.
 * Recognizes Vite, Webpack, Chromium, Safari, and Firefox module preload/fetch errors
 * without flagging generic API / fetch errors.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : typeof (error as any)?.message === 'string'
      ? (error as any).message
      : String(error);

  const name = error instanceof Error ? error.name : '';

  // Specific chunk error names
  if (name === 'ChunkLoadError') return true;

  // Targeted pattern for dynamic import / chunk / module fetch failures
  return /Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module|Loading chunk|Loading CSS chunk|CSS preload failure|Failed to preload|preloadError|ChunkLoadError|failed to load module|module script failed|Unable to preload CSS/i.test(
    message
  );
}

/**
 * Checks if recovery can be triggered (based on timestamp cooldown)
 * and executes a single page reload.
 * Returns true if reload was initiated, false if prevented by cooldown.
 */
export function autoRecoverFromStaleChunk(source = 'unknown'): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const now = Date.now();
    let lastRecovery = 0;

    try {
      const stored = sessionStorage.getItem(STALE_CHUNK_RECOVERY_KEY);
      if (stored) {
        lastRecovery = Number(stored) || 0;
      }
    } catch {
      // Ignore sessionStorage access errors (e.g. strict private mode)
    }

    if (now - lastRecovery < RECOVERY_COOLDOWN_MS) {
      console.warn(
        `[updateRecovery] Stale chunk error from "${source}" ignored because recovery was already attempted within the last 10s.`
      );
      return false;
    }

    try {
      sessionStorage.setItem(STALE_CHUNK_RECOVERY_KEY, String(now));
    } catch {
      // Continue even if sessionStorage is unavailable
    }

    console.warn(`[updateRecovery] Stale chunk detected from "${source}". Reloading to fetch updated assets...`);
    window.location.reload();
    return true;
  } catch (err) {
    console.error('[updateRecovery] Failed to initiate auto-recovery reload:', err);
    return false;
  }
}

/**
 * Retries a dynamic module loader once after a transient ~250ms pause.
 * If it still fails with a stale chunk error, triggers silent auto-recovery
 * and holds the promise pending so React Suspense remains active while the page reloads.
 */
export async function retryLazy<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (firstError) {
    // Wait ~250ms for transient cold-start / WebView network binding
    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      return await loader();
    } catch (secondError) {
      if (isStaleChunkError(secondError)) {
        const reloaded = autoRecoverFromStaleChunk('retryLazy');
        if (reloaded) {
          // Keep promise pending so React Suspense/SplashScreen stays visible during reload
          return new Promise<T>(() => {});
        }
      }
      throw secondError;
    }
  }
}

