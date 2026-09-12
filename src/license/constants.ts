/**
 * @file license/constants.ts
 * @description All configuration constants for the licensing system.
 *
 * Centralizing these means behaviour changes (e.g., longer trial, shorter grace)
 * require editing exactly one place with no risk of inconsistency.
 *
 * These are the defaults. The backend may override per-license values
 * (e.g., `gracePeriodDays`) in the stored license object.
 */

// ─── Storage Keys ─────────────────────────────────────────────────────────────

/** localStorage key for the signed license object. */
export const LICENSE_STORAGE_KEY = 'sohan_license';

/** localStorage key for the trial period start timestamp. */
export const TRIAL_INSTALL_KEY = 'sohan_trial_start';

/** localStorage key for a stable device identifier UUID. */
export const DEVICE_ID_KEY = 'sohan_device_id';

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * Current license schema version.
 * Increment this when StoredLicense shape changes in a breaking way.
 * LicenseStorage will handle migration when a lower version is detected.
 */
export const LICENSE_SCHEMA_VERSION = 1;

// ─── Durations ────────────────────────────────────────────────────────────────

/** Number of days from first install before the trial expires. */
export const TRIAL_DURATION_DAYS = 7;

/**
 * Default grace period in days after license expiry.
 * The backend may override this per-license via `StoredLicense.gracePeriodDays`.
 */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

/**
 * How many days between background re-verification attempts.
 * If the last verification was more than this many days ago AND the device
 * has internet, the app will silently call the verification endpoint.
 */
export const VERIFY_INTERVAL_DAYS = 3;

/**
 * Maximum number of days the app can operate without a successful
 * server-side license verification. After this threshold, the license
 * is downgraded to `offline_expired` to prevent "go offline forever" abuse.
 */
export const MAX_OFFLINE_DAYS = 30;

/**
 * How often (in hours) the in-app heartbeat timer fires to trigger a
 * silent background re-verification while the app is running.
 */
export const HEARTBEAT_INTERVAL_HOURS = 4;

/**
 * Maximum tolerated clock drift in hours.
 * If the current system time is more than this many hours BEFORE
 * the last-known timestamp, the system flags it as clock manipulation
 * and marks the license `invalid`.
 */
export const MAX_CLOCK_DRIFT_HOURS = 2;

/** localStorage key for the last-known system timestamp (clock-drift detection). */
export const LAST_KNOWN_TIMESTAMP_KEY = 'sohan_last_ts';

// ─── Module Identifiers ───────────────────────────────────────────────────────

/**
 * Canonical flat list of all feature module identifiers.
 * Format: "<domain>.<flag>" — mirrors the FeatureConfig key structure.
 *
 * Extending the app with a new feature:
 *   1. Add the flag to FeatureConfig in types/index.ts
 *   2. Add the module id string here
 *   3. Implement the feature in the UI
 *   No other licensing code changes are needed.
 *
 * Future modules (WhatsApp Orders, Payroll, CRM, etc.) follow the same pattern.
 */
export const ALL_MODULES = [
  // Inventory
  'inventory.batches',
  'inventory.expiry',
  'inventory.variants',
  'inventory.serialNumbers',
  'inventory.barcodeSupport',
  'inventory.multiUnits',

  // Sales / POS
  'sales.returns',
  'sales.creditSales',
  'sales.discounts',
  'sales.layaway',
  'sales.quotations',

  // Customers
  'customers.loyalty',
  'customers.membership',

  // Hospitality
  'hospitality.hotelGrid',
  'hospitality.restaurantBilling',

  // Production / Transformation
  'production.enabled',

  // Consumption
  'consumption.enabled',
] as const;

/** Type-safe module identifier union. */
export type ModuleId = typeof ALL_MODULES[number];

// ─── Plan Definitions ─────────────────────────────────────────────────────────

/**
 * Plan definitions are for reference and display only.
 * They do NOT gate features on the client side.
 *
 * Feature access is always determined by `enabledModules[]` in the stored
 * license — never by evaluating the plan name. This means the backend
 * can create custom plans and the client works without any code changes.
 *
 * Use these constants for display labels in the UI.
 */
export const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  starter: 'Starter',
  standard: 'Standard',
  pro: 'Professional',
  enterprise: 'Enterprise',
  custom: 'Custom',
};

/**
 * Human-readable error messages keyed by backend error codes.
 * Centralised here so the UI never contains error string logic.
 */
export const ACTIVATION_ERROR_MESSAGES: Record<string, string> = {
  // ── Frontend / Client-side codes ──────────────────────────────────────────
  INVALID_KEY: 'The activation key is invalid. Please check and try again.',
  KEY_ALREADY_USED: 'This key has already been used on another device.',
  DEVICE_LIMIT_REACHED: 'The maximum number of activations for this key has been reached.',
  LICENSE_SUSPENDED: 'This license has been suspended. Please contact support.',
  LICENSE_EXPIRED: 'This license has expired. Please renew to continue.',
  SERVER_ERROR: 'A server error occurred. Please try again in a few minutes.',
  NETWORK_ERROR: 'No internet connection. Please check your network and try again.',

  // ── Backend error codes (errors[].code) ────────────────────────────────────
  INVALID_ACTIVATION_KEY: 'The activation key is invalid or does not exist. Please check and try again.',
  SIGNING_DISABLED: 'License signing is currently unavailable. Please contact support.',
};
