import type { SaleInvoice } from '@/types';

/**
 * Returns true for sales that should count in financial metrics,
 * dashboard stats, customer stats, and reports.
 *
 * Voided sales are kept in the database for audit trail but excluded
 * from all business calculations.
 *
 * This is the single source of truth — if new statuses are added
 * (e.g. 'partially_returned'), update this one function.
 */
export function isActiveSale(sale: SaleInvoice): boolean {
  return sale.status !== 'voided';
}
