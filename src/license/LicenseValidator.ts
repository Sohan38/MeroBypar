/**
 * @file license/LicenseValidator.ts
 * @description Pure, stateless validation functions for license state computation.
 *
 * Design decisions:
 * - Pure functions only: no side effects, no React, no storage access.
 * - All status/expiry/feature logic lives here — nowhere else.
 * - Tests can be written against these functions directly with zero mocking.
 * - LicenseService calls these; UI never calls them directly.
 *
 * Feature permission model:
 *   During `trial`, `active`, `grace` → all modules in license.enabledModules allowed.
 *   During `expired`, `suspended`, `invalid`, `none`, `trial_expired`,
 *         `offline_expired` → all locked.
 *
 *   The system evaluates the module identifier string against the array.
 *   There is no plan name logic, no hardcoded feature names.
 */

import { StoredLicense, LicenseStatus, TrialInfo, LicenseState } from './types';
import {
  TRIAL_DURATION_DAYS,
  DEFAULT_GRACE_PERIOD_DAYS,
  MAX_OFFLINE_DAYS,
  MAX_CLOCK_DRIFT_HOURS,
  ALL_MODULES,
} from './constants';

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** Returns current UTC timestamp as ISO 8601 string. */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Computes the number of whole days between two ISO timestamps. Negative = past. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to   = new Date(toISO).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

/** Computes the number of hours between two ISO timestamps. Negative = past. */
export function hoursBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime();
  const to   = new Date(toISO).getTime();
  return (to - from) / (1000 * 60 * 60);
}

/** Adds `days` to an ISO timestamp and returns the new ISO string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

// ─── Trial ────────────────────────────────────────────────────────────────────

/**
 * Computes trial information from the stored trial start timestamp.
 * Returns null if no trial has been started yet.
 */
export function computeTrialInfo(trialStart: string | null): TrialInfo | null {
  if (!trialStart) return null;

  const expiresAt     = addDays(trialStart, TRIAL_DURATION_DAYS);
  const now           = nowISO();
  const daysRemaining = Math.max(0, daysBetween(now, expiresAt));
  const isActive      = now < expiresAt;

  return { isActive, startedAt: trialStart, expiresAt, daysRemaining };
}

// ─── Offline Enforcement ──────────────────────────────────────────────────────

/**
 * Returns true if the license has not been verified by the server for
 * longer than the allowed offline window.
 *
 * This prevents "go offline forever" abuse — after MAX_OFFLINE_DAYS without
 * a successful server check, the license is no longer trusted.
 *
 * @param lastVerifiedAt - ISO 8601 timestamp of last successful verification
 * @param maxDays        - Maximum allowed offline days (default: MAX_OFFLINE_DAYS)
 */
export function isOfflineTooLong(
  lastVerifiedAt: string | null,
  maxDays: number = MAX_OFFLINE_DAYS,
): boolean {
  if (!lastVerifiedAt) return true; // Never verified = treated as offline too long
  const daysSince = daysBetween(lastVerifiedAt, nowISO());
  return daysSince >= maxDays;
}

// ─── Clock Manipulation Detection ─────────────────────────────────────────────

/**
 * Returns true if the system clock appears to have been rolled back.
 *
 * Detection: if `now` is MORE than `maxDriftHours` BEFORE a previously
 * recorded timestamp, the clock has been manipulated.
 *
 * A small tolerance (MAX_CLOCK_DRIFT_HOURS) accounts for timezone changes,
 * NTP corrections, and DST transitions.
 *
 * @param lastKnownTimestamp - ISO 8601 of the last recorded system time
 * @param maxDriftHours      - Tolerance threshold in hours
 */
export function isClockRolledBack(
  lastKnownTimestamp: string | null,
  maxDriftHours: number = MAX_CLOCK_DRIFT_HOURS,
): boolean {
  if (!lastKnownTimestamp) return false; // No baseline → can't detect
  const drift = hoursBetween(nowISO(), lastKnownTimestamp);
  // drift > 0 means lastKnown is in the future relative to now → clock went back
  return drift > maxDriftHours;
}

// ─── Status Computation ───────────────────────────────────────────────────────

/**
 * Determines the authoritative license status from the stored license and trial.
 *
 * Evaluation order (highest to lowest priority):
 *   1. Suspended (server-reported; cannot be overridden locally)
 *   2. Invalid (signature mismatch detected by LicenseService before this call)
 *   3. Clock rollback detected → 'invalid'
 *   4. Offline too long (no server verification within MAX_OFFLINE_DAYS) → 'offline_expired'
 *   5. Active (not expired)
 *   6. Grace period (expired but within grace window)
 *   7. Expired (past grace period)
 *   8. Trial (no license but trial is active)
 *   9. Trial expired
 *  10. None
 *
 * NOTE: Signature verification is intentionally NOT performed here because it
 * is async. LicenseService runs the async verify first, then passes the result
 * through the `signatureValid` parameter.
 */
export function computeLicenseStatus(
  license: StoredLicense | null,
  trialStart: string | null,
  signatureValid: boolean,
  lastKnownTimestamp?: string | null,
): LicenseStatus {
  // ── No license stored ───────────────────────────────────────────────────
  if (!license) {
    const trial = computeTrialInfo(trialStart);
    if (!trial) return 'none';
    return trial.isActive ? 'trial' : 'trial_expired';
  }

  // ── Suspended (server flag; not overrideable offline) ───────────────────
  if (license.status === 'suspended') return 'suspended';

  // ── Tamper detected ─────────────────────────────────────────────────────
  if (!signatureValid) return 'invalid';

  // ── Clock rollback detected ─────────────────────────────────────────────
  if (lastKnownTimestamp && isClockRolledBack(lastKnownTimestamp)) {
    return 'invalid';
  }

  // ── Offline too long ────────────────────────────────────────────────────
  if (isOfflineTooLong(license.lastVerifiedAt)) {
    return 'offline_expired';
  }

  const now = nowISO();

  // ── Active: no expiry OR expiry is in the future ─────────────────────────
  if (!license.expiresAt || now < license.expiresAt) return 'active';

  // ── Grace period: within gracePeriodDays after expiry ────────────────────
  const graceDays = license.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS;
  const graceEnd  = addDays(license.expiresAt, graceDays);
  if (now < graceEnd) return 'grace';

  // ── Fully expired ────────────────────────────────────────────────────────
  return 'expired';
}

// ─── Usability ────────────────────────────────────────────────────────────────

/**
 * Returns true when the app is fully functional under the current license status.
 * All usable states: trial, active, grace.
 */
export function isLicenseUsable(status: LicenseStatus): boolean {
  return status === 'trial' || status === 'active' || status === 'grace';
}

// ─── Feature Permission ───────────────────────────────────────────────────────

/**
 * Checks whether a specific module is permitted under the current license.
 *
 * Rules:
 * - If license is usable (trial/active/grace) AND the module is in
 *   `enabledModules`, the feature is allowed.
 * - During trial: ALL modules are allowed (full feature trial).
 * - During grace: modules allowed as per the stored license (no lockout).
 * - During expired/suspended/invalid/none/trial_expired/offline_expired: nothing is allowed.
 *
 * The function takes a flat module ID string (e.g. "inventory.batches")
 * and compares against the `enabledModules` array. No plan names are evaluated.
 *
 * @param license - The stored license (null if no license activated)
 * @param status  - Computed status from computeLicenseStatus()
 * @param moduleId - The feature module identifier to check (e.g. "sales.discounts")
 */
export function isModuleAllowed(
  license: StoredLicense | null,
  status: LicenseStatus,
  moduleId: string,
): boolean {
  if (!isLicenseUsable(status)) return false;

  // Trial: all modules are enabled (full access trial)
  if (status === 'trial') return true;

  // Grace or active: check the stored enabledModules list
  if (!license) return false;
  return license.enabledModules.includes(moduleId);
}

/**
 * Checks a feature using the domain+flag convention that matches FeatureConfig.
 * Converts the pair into a moduleId string for `isModuleAllowed`.
 *
 * @param license   - Stored license
 * @param status    - Computed license status
 * @param domain    - e.g. "inventory", "sales"
 * @param flag      - e.g. "batches", "discounts"
 */
export function isDomainFeatureAllowed(
  license: StoredLicense | null,
  status: LicenseStatus,
  domain: string,
  flag: string,
): boolean {
  const moduleId = `${domain}.${flag}`;
  return isModuleAllowed(license, status, moduleId);
}

// ─── Expiry Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the number of days until the license expires.
 * Negative means already expired.
 * Returns null if the license is perpetual (no expiresAt).
 */
export function daysUntilExpiry(license: StoredLicense | null): number | null {
  if (!license?.expiresAt) return null;
  return daysBetween(nowISO(), license.expiresAt);
}

// ─── State Builder ────────────────────────────────────────────────────────────

/**
 * Builds the complete LicenseState object from its parts.
 * Called by LicenseService after async signature verification is complete.
 */
export function buildLicenseState(
  license: StoredLicense | null,
  trialStart: string | null,
  signatureValid: boolean,
  isLoading: boolean = false,
  lastKnownTimestamp?: string | null,
): LicenseState {
  const status      = computeLicenseStatus(license, trialStart, signatureValid, lastKnownTimestamp);
  const trial       = computeTrialInfo(trialStart);
  const expiry      = license?.expiresAt ?? null;
  const daysLeft    = daysUntilExpiry(license);

  return {
    status,
    license,
    trial,
    isLoading,
    isUsable:        isLicenseUsable(status),
    hasAnyLicense:   license !== null,
    expiresAt:       expiry,
    daysUntilExpiry: daysLeft,
    lastVerifiedAt:  license?.lastVerifiedAt ?? null,
  };
}

// ─── Verification Need ────────────────────────────────────────────────────────

/**
 * Returns true if the license should attempt a background server re-verification.
 * Called on app focus / boot when internet may be available.
 *
 * @param license          - The stored license
 * @param verifyIntervalDays - How many days between verifications
 */
export function needsServerVerification(
  license: StoredLicense,
  verifyIntervalDays: number,
): boolean {
  if (!license.lastVerifiedAt) return true;
  const daysSinceVerify = daysBetween(license.lastVerifiedAt, nowISO());
  return daysSinceVerify >= verifyIntervalDays;
}

// ─── Entitlement Snapshot ─────────────────────────────────────────────────────

/**
 * Returns a full map of all known modules with their allowed state.
 * Useful for rendering the License UI (showing locked vs enabled features).
 *
 * @param license - The stored license (null = trial or no license)
 * @param status  - The computed license status
 */
export function getEntitlementMap(
  license: StoredLicense | null,
  status: LicenseStatus,
): Record<string, boolean> {
  return Object.fromEntries(
    ALL_MODULES.map((moduleId) => [moduleId, isModuleAllowed(license, status, moduleId)])
  );
}
