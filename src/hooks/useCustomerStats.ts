import { useMemo } from 'react';
import { useSales, useCredit } from '@/contexts/GlobalProviders';
import { isActiveSale } from '@/lib/saleUtils';

export interface CustomerStats {
    totalSpent: number;
    visitCount: number;
    lastPurchaseDate: string | null;
    avgOrderValue: number;
    outstandingCredit: number;
    /** Sales sorted newest-first for this customer */
    sales: ReturnType<typeof useSales>['items'];
}

const EMPTY_STATS: CustomerStats = {
    totalSpent: 0,
    visitCount: 0,
    lastPurchaseDate: null,
    avgOrderValue: 0,
    outstandingCredit: 0,
    sales: [],
};

/**
 * Computes per-customer stats from existing sales + credit data.
 * Returns a stable Map so consumers can look up a single customer
 * without re-subscribing to all data.
 */
export function useAllCustomerStats(): Map<string, CustomerStats> {
    const { items: sales } = useSales();
    const { items: credits } = useCredit();

    return useMemo(() => {
        const map = new Map<string, CustomerStats>();

        for (const sale of sales) {
            if (!sale.customerId || !isActiveSale(sale)) continue;
            const s: CustomerStats = map.get(sale.customerId) ?? { ...EMPTY_STATS, sales: [] };
            s.totalSpent += sale.grandTotal;
            s.visitCount += 1;
            s.sales = [...s.sales, sale];
            if (!s.lastPurchaseDate || sale.date > s.lastPurchaseDate) {
                s.lastPurchaseDate = sale.date;
            }
            map.set(sale.customerId, s);
        }

        for (const [, s] of map) {
            s.avgOrderValue = s.visitCount > 0 ? s.totalSpent / s.visitCount : 0;
            // Sort sales newest-first
            s.sales = [...s.sales].sort((a, b) => b.date.localeCompare(a.date));
        }

        for (const credit of credits) {
            if (!credit.customerId || credit.status === 'paid') continue;
            const s: CustomerStats = map.get(credit.customerId) ?? { ...EMPTY_STATS, sales: [] };
            s.outstandingCredit += Math.max(0, credit.amount - (credit.paidAmount ?? 0));
            map.set(credit.customerId, s);
        }

        return map;
    }, [sales, credits]);
}

/** Convenience hook for a single customer's stats. Returns null for unknown customers. */
export function useCustomerStats(customerId: string | null | undefined): CustomerStats | null {
    const all = useAllCustomerStats();
    if (!customerId) return null;
    return all.get(customerId) ?? null;
}
