/**
 * @file license/types.ts
 * @description Type contracts for the production licensing system.
 *
 * These types are designed to be:
 * - Backend-compatible: the shape of `StoredLicense` matches the future
 *   server activation response with zero changes.
 * - Extensible: new plans and modules never require type changes — they
 *   are simply new strings in `enabledModules[]`.
 * - Versioned: `StoredLicense.version` allows forward-compatible migrations.
 */

// ─── License Status ───────────────────────────────────────────────────────────

/**
 * All possible license states the application can be in.
 *
 * Transitions:
 *   install → trial → trial_expired → (activate) → active
 *                                                 → expired → grace → expired
 *                                                 → suspended
 *                                                 → offline_expired
 *   tamper / corrupt → invalid
 */
export type LicenseStatus =
  | 'none'              // No license and no trial start recorded
  | 'trial'             // Within the trial period, no activation key required
  | 'trial_expired'     // Trial window has passed; activation required
  | 'active'            // Valid, non-expired, signature-verified license
  | 'grace'             // License past expiry but within grace period
  | 'expired'           // License past expiry AND past grace period
  | 'suspended'         // Manually revoked by the license server
  | 'offline_expired'   // Too many days without successful server verification
  | 'invalid';          // Signature check failed or data corrupted / clock tampering

// ─── Core License Model ───────────────────────────────────────────────────────

/**
 * The canonical license object stored locally under `sohan_license`.
 *
 * This is both the format that the future backend will return and the
 * format stored in localStorage. Never store this inside `AppSettings`.
 */
export interface StoredLicense {
  /** Schema version for forward-compatible migrations. Currently 1. */
  version: number;

  /** Unique license identifier from the backend (UUID). */
  licenseId: string;

  /** The activation key the user entered. */
  activationKey: string;

  /**
   * Verified business name from the backend.
   * Displayed in the activation UI as proof of a valid license.
   */
  businessName: string;

  /**
   * Plan identifier string (e.g. "starter", "pro", "enterprise", "custom").
   * Used only for display. Feature access is driven by `enabledModules` only.
   * Adding future plans requires zero code changes.
   */
  plan: string;

  /**
   * Flat list of enabled feature module identifiers.
   * Format: "<domain>.<flag>" — matches the FeatureConfig key structure.
   *
   * Example: ["inventory.batches", "sales.discounts", "hospitality.hotelGrid"]
   *
   * This is the single source of truth for feature entitlement.
   * The system never evaluates plan names to determine access.
   */
  enabledModules: string[];

  /** Device identifier captured at the time of activation. */
  deviceId: string;

  /** ISO 8601 timestamp — when the user activated on this device. */
  activatedAt: string;

  /** ISO 8601 timestamp — when the license was issued by the backend. */
  issuedAt: string;

  /**
   * ISO 8601 expiry timestamp, or null for perpetual licenses.
   * The system checks this against the current date on every initialization.
   */
  expiresAt: string | null;

  /**
   * Days after `expiresAt` during which the app remains fully usable.
   * Configurable per-license by the backend.
   */
  gracePeriodDays: number;

  /**
   * ISO 8601 timestamp of the last successful server-side verification.
   * Used to determine when periodic re-verification is due.
   */
  lastVerifiedAt: string;

  /**
   * Last known server-reported status.
   * On offline starts, this is used alongside signature/expiry to infer status.
   */
  status: LicenseStatus;

  /**
   * Cryptographic signature of the license payload from the backend.
   * Verified locally to detect tampering of the stored license object.
   * Today: mocked. Future: HMAC-SHA256 or JWT signature.
   */
  signature: string;

  /**
   * Extensible metadata bag.
   * The backend can include arbitrary fields here without breaking the client
   * (e.g., activation count, max devices, custom branding).
   */
  metadata: Record<string, unknown>;
}

// ─── Trial Info ───────────────────────────────────────────────────────────────

/**
 * Computed trial state — never stored directly, always derived at runtime.
 */
export interface TrialInfo {
  isActive: boolean;
  startedAt: string;       // ISO 8601
  expiresAt: string;       // ISO 8601
  daysRemaining: number;   // 0 means expired today
}

// ─── License State (React-exposed) ───────────────────────────────────────────

/**
 * The complete license state exposed to the React application via context.
 * Computed fresh on every app initialization.
 */
export interface LicenseState {
  /** Current status — drives all UI and feature gate decisions. */
  status: LicenseStatus;

  /** Full stored license object, or null if not yet activated. */
  license: StoredLicense | null;

  /** Trial information if in trial or trial_expired state. */
  trial: TrialInfo | null;

  /** True while license is being loaded from storage or verified. */
  isLoading: boolean;

  /**
   * Convenience flag — true when the app is fully functional.
   * Covers: trial, active, grace.
   * False for: none, trial_expired, expired, suspended, invalid.
   */
  isUsable: boolean;

  /** True if any license record (even expired) exists in storage. */
  hasAnyLicense: boolean;

  /** ISO 8601 expiry date if applicable, null otherwise. */
  expiresAt: string | null;

  /** Days until expiry, or null if not applicable. Negative means past expiry. */
  daysUntilExpiry: number | null;

  /** ISO 8601 timestamp of the last successful server verification, or null. */
  lastVerifiedAt: string | null;
}

// ─── Activation Request / Response ───────────────────────────────────────────

/**
 * Shape of the activation request that will be sent to the backend.
 * Defined here now so future backend integration requires only a `fetch()` call.
 */
export interface ActivationRequest {
  activationKey: string;
  deviceId: string;
  appVersion: string;
  platform: 'android' | 'ios' | 'web' | 'desktop';
  timestamp: string;  // ISO 8601
}

/**
 * Shape of the backend activation response.
 * On success: contains the full signed license to be stored.
 * On failure: contains an error code for user-facing messaging.
 */
export interface ActivationResponse {
  success: boolean;
  license?: StoredLicense;
  error?: string;
  errorCode?:
    | 'INVALID_KEY'
    | 'KEY_ALREADY_USED'
    | 'DEVICE_LIMIT_REACHED'
    | 'LICENSE_SUSPENDED'
    | 'LICENSE_EXPIRED'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR';
}

// ─── Deactivation Response ────────────────────────────────────────────────────

export interface DeactivationResponse {
  success: boolean;
  error?: string;
}

// ─── Verification Response ────────────────────────────────────────────────────

/**
 * Shape of the backend verification response (periodic online check).
 * The backend may update the license (e.g., new expiry, revocation).
 */
export interface VerificationResponse {
  success: boolean;
  updatedLicense?: Partial<StoredLicense>;
  error?: string;
}
