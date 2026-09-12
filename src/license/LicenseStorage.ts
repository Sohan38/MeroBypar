/**
 * @file license/LicenseStorage.ts
 * @description Isolated, low-level read/write layer for license data.
 *
 * Design decisions:
 * - Completely independent from the app's StorageService / IStorageProvider.
 *   This ensures license data is never accidentally cleared by a data import,
 *   factory reset via the app's storage layer, or collection CRUD operations.
 * - Reads/writes localStorage directly using its own dedicated keys.
 * - Handles schema version migrations so future StoredLicense shape changes
 *   never corrupt existing installations.
 * - All methods are synchronous — license data is tiny and must be readable
 *   synchronously during app boot before React hydrates.
 */

import { StoredLicense } from './types';
import {
  LICENSE_STORAGE_KEY,
  TRIAL_INSTALL_KEY,
  LICENSE_SCHEMA_VERSION,
  LAST_KNOWN_TIMESTAMP_KEY,
} from './constants';

// ─── Migration Registry ───────────────────────────────────────────────────────

/**
 * Add migration functions here as the schema evolves.
 *
 * Each key is the schema version BEING MIGRATED FROM.
 * The function receives the raw object and should return a valid object
 * for the next version.
 *
 * Example (when schema v2 is introduced):
 *   1: (old: any) => ({ ...old, newField: 'defaultValue', version: 2 })
 */
const MIGRATIONS: Record<number, (data: any) => any> = {
  // Placeholder — no migrations needed yet at version 1
};

// ─── LicenseStorage ───────────────────────────────────────────────────────────

export class LicenseStorage {

  // ── License ───────────────────────────────────────────────────────────────

  /**
   * Load the stored license from localStorage.
   * Runs schema migrations if the stored version is lower than the current.
   * Returns null if no license is stored or if the data is irrecoverably corrupt.
   */
  loadLicense(): StoredLicense | null {
    try {
      const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (!raw) return null;

      let parsed: any = JSON.parse(raw);

      // Run any pending migrations
      parsed = this._migrate(parsed);

      // Basic structural validation — reject obviously malformed objects
      if (!this._isValidShape(parsed)) {
        console.warn('[LicenseStorage] Stored license failed shape validation — discarding.');
        return null;
      }

      return parsed as StoredLicense;
    } catch (err) {
      console.error('[LicenseStorage] Failed to load license:', err);
      return null;
    }
  }

  /**
   * Persist a license to localStorage.
   * Overwrites any previously stored license.
   */
  saveLicense(license: StoredLicense): void {
    try {
      localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify(license));
    } catch (err) {
      console.error('[LicenseStorage] Failed to save license:', err);
    }
  }

  /**
   * Partially update the stored license without rewriting the whole object.
   * Useful for updating `lastVerifiedAt` or `status` after a server check
   * without requiring a full re-activation.
   */
  patchLicense(patch: Partial<StoredLicense>): StoredLicense | null {
    const current = this.loadLicense();
    if (!current) return null;
    const updated = { ...current, ...patch };
    this.saveLicense(updated);
    return updated;
  }

  /**
   * Remove the stored license from localStorage.
   * Used on deactivation or factory reset.
   * Does NOT remove the trial start — that persists to prevent re-trial after deactivation.
   */
  removeLicense(): void {
    try {
      localStorage.removeItem(LICENSE_STORAGE_KEY);
    } catch (err) {
      console.error('[LicenseStorage] Failed to remove license:', err);
    }
  }

  // ── Trial ─────────────────────────────────────────────────────────────────

  /**
   * Returns the trial start timestamp (ISO 8601), or null if not yet recorded.
   * The trial start is set exactly once on first app launch and never updated.
   */
  getTrialStart(): string | null {
    try {
      return localStorage.getItem(TRIAL_INSTALL_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Records the trial start timestamp.
   * Should be called exactly once: the first time the app launches with no license.
   */
  setTrialStart(isoDate: string): void {
    try {
      localStorage.setItem(TRIAL_INSTALL_KEY, isoDate);
    } catch (err) {
      console.error('[LicenseStorage] Failed to set trial start:', err);
    }
  }

  /**
   * Clears the trial start. Only call this during a full factory reset where
   * the intent is to wipe all app data including licensing state.
   */
  clearTrialStart(): void {
    try {
      localStorage.removeItem(TRIAL_INSTALL_KEY);
    } catch (err) {
      console.error('[LicenseStorage] Failed to clear trial start:', err);
    }
  }

  // ── Clock-Drift Detection ─────────────────────────────────────────────────

  /**
   * Returns the last-known system timestamp (ISO 8601).
   * Used to detect if the user has rolled back the system clock.
   */
  getLastKnownTimestamp(): string | null {
    try {
      return localStorage.getItem(LAST_KNOWN_TIMESTAMP_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Records the current system timestamp.
   * Called on every successful license operation (init, verify, activate).
   */
  setLastKnownTimestamp(isoDate: string): void {
    try {
      localStorage.setItem(LAST_KNOWN_TIMESTAMP_KEY, isoDate);
    } catch (err) {
      console.error('[LicenseStorage] Failed to set last known timestamp:', err);
    }
  }

  // ── Migration ─────────────────────────────────────────────────────────────

  private _migrate(data: any): any {
    let current = data;
    let version: number = current?.version ?? 0;

    while (version < LICENSE_SCHEMA_VERSION) {
      const migrateFn = MIGRATIONS[version];
      if (migrateFn) {
        console.info(`[LicenseStorage] Migrating license from v${version} to v${version + 1}`);
        current = migrateFn(current);
        version = current?.version ?? version + 1;
      } else {
        // No migration registered for this version — bump version and continue
        version += 1;
      }
    }

    return current;
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Checks that the parsed object has the minimum required fields.
   * This guards against an empty object `{}` or a corrupt truncated write.
   */
  private _isValidShape(obj: any): boolean {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      typeof obj.licenseId === 'string' && obj.licenseId.length > 0 &&
      typeof obj.activationKey === 'string' &&
      typeof obj.plan === 'string' &&
      Array.isArray(obj.enabledModules) &&
      typeof obj.signature === 'string' && obj.signature.length > 0 &&
      typeof obj.version === 'number'
    );
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const licenseStorage = new LicenseStorage();
