/**
 * @file license/LicenseService.ts
 * @description Central public API layer for all licensing operations.
 *
 * Design Decisions:
 * - Responsible for orchestrating activation, validation, local storage caching,
 *   periodic verification checks, and deactivation.
 * - Connects to the device, signature, and storage abstractions.
 * - Uses the real backend verification endpoint (POST /license/verify).
 * - Enforces offline expiry (MAX_OFFLINE_DAYS) and clock rollback detection.
 * - Deactivation is local-only — the backend has no per-device revocation flow yet.
 */

import { StoredLicense, LicenseState, ActivationResponse, DeactivationResponse, SyncResult } from './types';
import { VERIFY_INTERVAL_DAYS } from './constants';
import { deviceService } from './DeviceService';
import { signatureService } from './SignatureService';
import { licenseStorage } from './LicenseStorage';
import { buildLicenseState, nowISO, needsServerVerification } from './LicenseValidator';
import { apiClient, ApiError } from '@/services/apiClient';

export class LicenseService {
  private _cachedState: LicenseState | null = null;
  private _isRefreshing = false;

  /**
   * Initializes the license system on app boot.
   * Checks for stored license, validates signature, ensures trial starts,
   * enforces offline expiry and clock rollback detection,
   * and builds the initial read-only state.
   */
  async initialize(): Promise<LicenseState> {
    if (this._cachedState) return this._cachedState;

    let license = licenseStorage.loadLicense();
    let trialStart = licenseStorage.getTrialStart();

    // Setup trial timestamp on first install
    if (!license && !trialStart) {
      trialStart = nowISO();
      licenseStorage.setTrialStart(trialStart);
    }

    let signatureValid = false;
    if (license) {
      try {
        signatureValid = await signatureService.verify(license);
      } catch (err) {
        console.error('[LicenseService] Signature check threw error:', err);
        signatureValid = false;
      }
    }

    // Read the last-known timestamp for clock-drift detection
    const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();

    const state = buildLicenseState(license, trialStart, signatureValid, false, lastKnownTimestamp);

    // Record the current system time as a baseline for future clock-drift checks
    licenseStorage.setLastKnownTimestamp(nowISO());

    this._cachedState = state;
    return state;
  }

  /**
   * Returns the current state.
   * Falls back to a default loading state if initialize() has not completed.
   */
  getState(): LicenseState {
    return this._cachedState || {
      status: 'none',
      license: null,
      trial: null,
      isLoading: true,
      isUsable: false,
      hasAnyLicense: false,
      expiresAt: null,
      daysUntilExpiry: null,
      lastVerifiedAt: null,
    };
  }

  /**
   * Triggers the activation flow.
   * Calls the backend activation endpoint, signs the returned license payload,
   * stores it locally, and updates runtime state cache.
   */
  async activate(key: string): Promise<ActivationResponse> {
    try {
      if (!key || key.trim().length === 0) {
        return { success: false, errorCode: 'INVALID_KEY' };
      }

      const deviceId = deviceService.getDeviceId();
      const platform = deviceService.getPlatform();
      const appVersion = '1.0.0';

      interface ServerActivationResponse {
        success: boolean;
        data?: {
          payload: {
            version: number;
            licenseId: string;
            businessName: string;
            plan: string;
            expiresAt: string | null;
            gracePeriodDays: number;
            entitlements: Record<string, boolean>;
            authorizedDevices: string[];
            issuedAt: string;
            metadata?: Record<string, unknown>;
          };
          signature: string;
        };
        error?: string;
        errorCode?: string;
      }

      const resData = await apiClient.post<ServerActivationResponse>('/license/activate', {
        activationKey: key.trim(),
        deviceId: deviceId,
        deviceMeta: {
          platform,
          appVersion,
        },
      });

      if (!resData.success || !resData.data) {
        return {
          success: false,
          errorCode: (resData.errorCode as any) || 'INVALID_KEY',
          error: resData.error
        };
      }

      const { payload, signature } = resData.data;
      if (!payload || !signature) {
        return { success: false, errorCode: 'SERVER_ERROR' };
      }

      const now = nowISO();

      // Map backend entitlements (object: { [featureId]: boolean }) to enabledModules (array: string[])
      const enabledModules = Object.keys(payload.entitlements || {}).filter(
        (modId) => payload.entitlements[modId] === true
      );

      const license: StoredLicense = {
        version: payload.version || 1,
        licenseId: payload.licenseId,
        activationKey: key.trim(),
        businessName: payload.businessName,
        plan: payload.plan || 'pro',
        enabledModules: enabledModules,
        deviceId: deviceId,
        activatedAt: now,
        issuedAt: payload.issuedAt || now,
        expiresAt: payload.expiresAt || null,
        gracePeriodDays: typeof payload.gracePeriodDays === 'number' ? payload.gracePeriodDays : 7,
        lastVerifiedAt: now,
        status: 'active',
        signature: signature,
        metadata: payload.metadata || {}
      };

      // Cache locally
      licenseStorage.saveLicense(license);

      // Update clock-drift baseline
      licenseStorage.setLastKnownTimestamp(now);

      // Re-hydrate state
      const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();
      this._cachedState = buildLicenseState(license, licenseStorage.getTrialStart(), true, false, lastKnownTimestamp);

      return { success: true, license };
    } catch (err) {
      console.error('[LicenseService] Activation error:', err);
      if (err instanceof ApiError) {
        return {
          success: false,
          errorCode: (err.errorCode as ActivationResponse['errorCode']) || 'SERVER_ERROR',
          error: err.message,
        };
      }
      return { success: false, errorCode: 'SERVER_ERROR' };
    }
  }

  /**
   * Deactivates the license locally.
   *
   * This is a LOCAL-ONLY operation — it clears the stored activation payload
   * and stops using the license on this device. The backend is NOT notified
   * because there is no safe per-device revocation flow yet.
   *
   * When server enforcement is needed, add a dedicated per-device revocation
   * endpoint and make verifyLicense() reject revoked devices.
   */
  async deactivate(): Promise<DeactivationResponse> {
    try {
      licenseStorage.removeLicense();

      // Re-initialize state (will revert to trial or trial_expired)
      this._cachedState = null;
      await this.initialize();

      return { success: true };
    } catch (err) {
      console.error('[LicenseService] Deactivation error:', err);
      return { success: false, error: 'Failed to deactivate license.' };
    }
  }

  /**
   * Synchronizes the license with the backend server.
   *
   * Industry-Grade Architecture:
   * 1. Atomic Re-lease: The server returns a signed payload. We verify the cryptographic
   *    signature *before* touching storage. If signature verification fails, existing
   *    working cache is preserved without corruption.
   * 2. Monotonic Rollback Defense: Incoming server payload must have an issuedAt >= the
   *    currently stored license issuedAt. Any older replay responses are discarded.
   * 3. Change Detection: Accurately detects:
   *    - Expiry extended or changed
   *    - Plan upgraded or downgraded
   *    - Modules unlocked (added)
   *    - Modules revoked (removed)
   * 4. Error Handling: Handles specific error codes like DEVICE_NOT_AUTHORIZED and
   *    LICENSE_SUSPENDED cleanly without crashing or corrupting state.
   *
   * @param force - If true, bypasses verify interval checks (used for on-demand user sync)
   */
  async syncWithServer(force: boolean = false): Promise<SyncResult> {
    if (this._isRefreshing) {
      return { success: false, updated: false, error: 'Verification check already in progress.' };
    }

    const current = this.getState();
    if (!current.license) {
      return { success: false, updated: false, error: 'No active license found to verify.' };
    }

    // Skip if status is permanently invalid and unrecoverable
    if (current.status === 'invalid' && !force) {
      return { success: false, updated: false, error: 'License is marked invalid.' };
    }

    const isOfflineExpired = current.status === 'offline_expired';
    const isSuspended = current.status === 'suspended';
    const daysLeft = current.daysUntilExpiry;
    const isNearExpiry = daysLeft !== null && daysLeft <= 7;
    const isGrace = current.status === 'grace';

    // Interval check: bypass if forced, offline-expired, suspended, in grace, or near expiry
    if (!force && !isOfflineExpired && !isSuspended && !isGrace && !isNearExpiry) {
      if (!needsServerVerification(current.license, VERIFY_INTERVAL_DAYS)) {
        return { success: true, updated: false, message: 'License verified recently.' };
      }
    }

    this._isRefreshing = true;

    interface ServerVerifySuccessResponse {
      success: boolean;
      data?: {
        payload: {
          version: number;
          licenseId: string;
          businessName: string;
          plan: string;
          expiresAt: string | null;
          gracePeriodDays: number;
          entitlements: Record<string, boolean | number>;
          authorizedDevices: string[];
          issuedAt: string;
          metadata?: Record<string, unknown>;
        };
        signature: string;
      };
      errors?: Array<{ code: string; message: string }>;
      meta?: { timestamp?: string; apiVersion?: string };
    }

    try {
      const resData = await apiClient.post<ServerVerifySuccessResponse>('/license/verify', {
        licenseId: current.license.licenseId,
        deviceId: deviceService.getDeviceId(),
      });

      const now = nowISO();

      // Handle server success
      if (resData.success && resData.data?.payload && resData.data?.signature) {
        const { payload, signature } = resData.data;

        // Monotonic check: Reject replayed or stale payloads
        if (current.license.issuedAt && payload.issuedAt) {
          const currentTime = new Date(current.license.issuedAt).getTime();
          const incomingTime = new Date(payload.issuedAt).getTime();
          if (incomingTime < currentTime) {
            console.warn('[LicenseService] Incoming server payload has older issuedAt than local cache — rejected.');
            return {
              success: false,
              updated: false,
              error: 'Server returned outdated license issuance data.'
            };
          }
        }

        // Map enabled modules (entitlements with true value)
        const incomingModules = Object.keys(payload.entitlements || {}).filter(
          (modId) => payload.entitlements[modId] === true
        );

        // Build candidate StoredLicense
        const candidateLicense: StoredLicense = {
          version: payload.version || current.license.version || 1,
          licenseId: payload.licenseId || current.license.licenseId,
          activationKey: current.license.activationKey,
          businessName: payload.businessName || current.license.businessName,
          plan: payload.plan || current.license.plan,
          enabledModules: incomingModules,
          deviceId: current.license.deviceId,
          activatedAt: current.license.activatedAt,
          issuedAt: payload.issuedAt || current.license.issuedAt || now,
          expiresAt: payload.expiresAt ?? null,
          gracePeriodDays: typeof payload.gracePeriodDays === 'number' ? payload.gracePeriodDays : current.license.gracePeriodDays,
          lastVerifiedAt: now,
          status: 'active',
          signature: signature,
          metadata: payload.metadata || current.license.metadata || {},
        };

        // Cryptographic signature check on candidate before writing to storage
        const isSignatureValid = await signatureService.verify(candidateLicense);
        if (!isSignatureValid) {
          console.error('[LicenseService] Server payload signature verification failed. Preserving local cache.');
          return {
            success: false,
            updated: false,
            error: 'Cryptographic signature validation failed on updated license payload.'
          };
        }

        // Detect meaningful changes between current and candidate
        const oldExpiresAt = current.license.expiresAt;
        const newExpiresAt = candidateLicense.expiresAt;
        const expiryExtended =
          Boolean(oldExpiresAt && newExpiresAt && new Date(newExpiresAt).getTime() > new Date(oldExpiresAt).getTime()) ||
          Boolean(oldExpiresAt && !newExpiresAt); // changed to perpetual

        const oldPlan = current.license.plan;
        const newPlan = candidateLicense.plan;
        const planChanged = oldPlan !== newPlan;

        const currentModulesSet = new Set(current.license.enabledModules);
        const incomingModulesSet = new Set(candidateLicense.enabledModules);

        const modulesAdded = candidateLicense.enabledModules.filter((m) => !currentModulesSet.has(m));
        const modulesRemoved = current.license.enabledModules.filter((m) => !incomingModulesSet.has(m));
        const modulesChanged = modulesAdded.length > 0 || modulesRemoved.length > 0;

        const hasSubstantiveChanges =
          expiryExtended ||
          planChanged ||
          modulesChanged ||
          oldExpiresAt !== newExpiresAt ||
          current.status !== 'active';

        // Atomically replace cached license
        licenseStorage.saveLicense(candidateLicense);
        licenseStorage.setLastKnownTimestamp(now);

        const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();
        this._cachedState = buildLicenseState(
          candidateLicense,
          licenseStorage.getTrialStart(),
          true,
          false,
          lastKnownTimestamp
        );

        // Build human-friendly notification message
        let changeMessage = 'License is up to date.';
        if (expiryExtended) {
          const dateStr = newExpiresAt ? new Date(newExpiresAt).toLocaleDateString() : 'Perpetual';
          changeMessage = `License renewed: Expiration extended to ${dateStr}.`;
        } else if (planChanged) {
          changeMessage = `Plan updated to ${newPlan}.`;
        } else if (modulesAdded.length > 0 && modulesRemoved.length > 0) {
          changeMessage = `License features updated (+${modulesAdded.length} added, -${modulesRemoved.length} removed).`;
        } else if (modulesAdded.length > 0) {
          changeMessage = `New features unlocked (+${modulesAdded.length} module${modulesAdded.length > 1 ? 's' : ''}).`;
        } else if (modulesRemoved.length > 0) {
          changeMessage = `License features updated (-${modulesRemoved.length} module${modulesRemoved.length > 1 ? 's' : ''} removed).`;
        } else if (hasSubstantiveChanges) {
          changeMessage = 'License terms updated successfully.';
        }

        return {
          success: true,
          updated: hasSubstantiveChanges,
          message: changeMessage,
          changes: {
            expiryExtended,
            oldExpiresAt,
            newExpiresAt,
            planChanged,
            oldPlan,
            newPlan,
            modulesAdded,
            modulesRemoved,
          },
        };
      }

      // Handle unsuccessful backend response
      const firstError = resData.errors?.[0];
      const errorCode = firstError?.code || 'VERIFICATION_REJECTED';
      const errorMessage = firstError?.message || 'Server rejected license verification.';

      console.warn('[LicenseService] Server verification error response:', errorCode, errorMessage);

      if (errorCode === 'DEVICE_NOT_AUTHORIZED' || errorCode === 'LICENSE_SUSPENDED') {
        const updated = licenseStorage.patchLicense({ status: 'suspended' });
        if (updated) {
          const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();
          this._cachedState = buildLicenseState(
            updated,
            licenseStorage.getTrialStart(),
            true,
            false,
            lastKnownTimestamp
          );
        }
      }

      return {
        success: false,
        updated: false,
        error: errorMessage,
      };
    } catch (err) {
      if (err instanceof ApiError) {
        console.warn('[LicenseService] Server verification failed:', err.status, err.message);
        if (err.errorCode === 'DEVICE_NOT_AUTHORIZED' || err.errorCode === 'LICENSE_SUSPENDED') {
          const updated = licenseStorage.patchLicense({ status: 'suspended' });
          if (updated) {
            const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();
            this._cachedState = buildLicenseState(
              updated,
              licenseStorage.getTrialStart(),
              true,
              false,
              lastKnownTimestamp
            );
          }
        }
        return {
          success: false,
          updated: false,
          error: err.message,
        };
      }

      // Network unreachable
      console.info('[LicenseService] Silent verification skipped (offline).');
      return {
        success: false,
        updated: false,
        error: 'Network error or server unreachable. Operating in offline mode.',
      };
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Silent background server verification helper.
   * Calls syncWithServer(false) and returns the updated state if available.
   */
  async refreshIfNeeded(): Promise<LicenseState | null> {
    await this.syncWithServer(false);
    return this.getState();
  }
}

export const licenseService = new LicenseService();

