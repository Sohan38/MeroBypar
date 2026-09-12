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

import { StoredLicense, LicenseState, ActivationResponse, DeactivationResponse } from './types';
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
   * Silent background server verification.
   *
   * Calls POST /license/verify with { licenseId, deviceId }.
   * On success: updates lastVerifiedAt and syncs any server-side status changes.
   * On suspended response: immediately downgrades the license.
   * On network failure: silently continues — offline grace period handles this.
   *
   * This is called:
   *   1. Once at app boot (via LicenseContext init)
   *   2. Periodically by the heartbeat interval (every HEARTBEAT_INTERVAL_HOURS)
   *   3. On tab/app visibility change (returning from background)
   *   4. On network reconnection (online event)
   */
  async refreshIfNeeded(): Promise<LicenseState | null> {
    if (this._isRefreshing) return null;
    const current = this.getState();
    if (!current.license) return null;

    // Skip if status is terminal and non-recoverable locally
    if (current.status === 'invalid') return null;

    // For offline_expired, we MUST try to verify (that's the only way to recover)
    const isOfflineExpired = current.status === 'offline_expired';

    // For active/grace, only verify if the interval has elapsed
    if (!isOfflineExpired && current.status !== 'suspended') {
      if (!needsServerVerification(current.license, VERIFY_INTERVAL_DAYS)) {
        return null;
      }
    }

    this._isRefreshing = true;
    try {
      /**
       * Backend verify response shape.
       * The server checks license + subscription status and upserts the device.
       */
      interface ServerVerifyResponse {
        success: boolean;
        data?: {
          status?: string;
          expiresAt?: string | null;
          entitlements?: Record<string, boolean>;
          gracePeriodDays?: number;
        };
        error?: string;
      }

      const resData = await apiClient.post<ServerVerifyResponse>('/license/verify', {
        licenseId: current.license.licenseId,
        deviceId: deviceService.getDeviceId(),
      });

      const now = nowISO();

      if (resData.success) {
        // Build the patch from server response
        const patch: Partial<StoredLicense> = {
          lastVerifiedAt: now,
        };

        // Sync server-reported status if provided
        if (resData.data?.status) {
          const serverStatus = resData.data.status;
          if (serverStatus === 'suspended') {
            patch.status = 'suspended';
          } else if (serverStatus === 'expired') {
            patch.status = 'expired';
          } else if (serverStatus === 'active') {
            patch.status = 'active';
          }
        }

        // Sync updated expiry if provided
        if (resData.data?.expiresAt !== undefined) {
          patch.expiresAt = resData.data.expiresAt;
        }

        // Sync updated grace period if provided
        if (typeof resData.data?.gracePeriodDays === 'number') {
          patch.gracePeriodDays = resData.data.gracePeriodDays;
        }

        // Sync updated entitlements if provided
        if (resData.data?.entitlements) {
          patch.enabledModules = Object.keys(resData.data.entitlements).filter(
            (modId) => resData.data!.entitlements![modId] === true
          );
        }

        const updated = licenseStorage.patchLicense(patch);

        // Update clock-drift baseline on successful verification
        licenseStorage.setLastKnownTimestamp(now);

        if (updated) {
          const lastKnownTimestamp = licenseStorage.getLastKnownTimestamp();
          this._cachedState = buildLicenseState(
            updated,
            licenseStorage.getTrialStart(),
            true,
            false,
            lastKnownTimestamp,
          );
        }
      } else {
        // Server explicitly rejected the verification
        console.warn('[LicenseService] Server verification rejected:', resData.error);

        // If the server says the license is no longer valid, update local state
        // but don't wipe the license — user might still be within grace period
      }
    } catch (err) {
      if (err instanceof ApiError && err.status > 0) {
        // Server responded with an HTTP error (not a network issue)
        console.warn('[LicenseService] Server verification failed with status:', err.status, err.message);
      } else {
        // Network error — silently continue, offline grace handles this
        console.info('[LicenseService] Silent verification skipped (offline).');
      }
    } finally {
      this._isRefreshing = false;
    }

    return this._cachedState;
  }
}

export const licenseService = new LicenseService();
