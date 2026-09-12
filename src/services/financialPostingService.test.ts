import { describe, expect, it } from 'vitest';
import type { IStorageProvider } from '@/storage/IStorageProvider';
import { FinancialPostingService } from './financialPostingService';

function makeStorage() {
    const data: Record<string, any[]> = {
        financialAccounts: [],
        financialTransactions: [],
        financialMovements: [],
    };
    const storage = {
        get: async <T>(key: string) => (data[key] ?? []) as T[],
        save: async <T extends { id: string }>(key: string, record: T) => {
            const rows = data[key] ?? (data[key] = []);
            const index = rows.findIndex(row => row.id === record.id);
            if (index >= 0) rows[index] = record;
            else rows.push(record);
            return record;
        },
        getSettings: async () => ({}),
        transaction: async <T>(_keys: string[], _mode: 'rw' | 'r', callback: () => Promise<T>) => callback(),
    } as unknown as IStorageProvider;
    return { storage, data };
}

describe('FinancialPostingService', () => {
    it('posts a cash sale once and is idempotent', async () => {
        const { storage, data } = makeStorage();
        const sale = {
            id: 'sale-1', date: '2026-08-22T10:00:00.000Z', grandTotal: 5000, paidAmount: 5000,
            paymentMethod: 'cash' as const,
        };

        await FinancialPostingService.postSale(storage, sale);
        await FinancialPostingService.postSale(storage, sale);

        expect(data.financialTransactions).toHaveLength(1);
        expect(data.financialMovements).toHaveLength(1);
        expect(data.financialMovements[0].amount).toBe(5000);
        expect(await FinancialPostingService.getAccountBalance(storage, 'financial-account-cash')).toBe(5000);
    });

    it('keeps a credit sale out of cash and posts only the due amount to receivables', async () => {
        const { storage, data } = makeStorage();
        await FinancialPostingService.postSale(storage, {
            id: 'sale-2', date: '2026-08-22T10:00:00.000Z', grandTotal: 5000, paidAmount: 2000,
            paymentMethod: 'credit', customerId: 'customer-1',
        });

        expect(data.financialMovements.map(row => [row.accountId, row.amount])).toEqual([
            ['financial-account-cash', 2000],
            ['financial-account-receivables', 3000],
        ]);
    });

    it('posts a customer payment as receivable reduction plus account inflow', async () => {
        const { storage, data } = makeStorage();
        await FinancialPostingService.ensureDefaultAccounts(storage);
        await FinancialPostingService.postCustomerPayment(storage, {
            id: 'customer-payment-1', creditId: 'credit-1', date: '2026-08-22T10:00:00.000Z',
            amount: 3000, paymentMethod: 'bank',
        });

        expect(data.financialMovements.map(row => [row.accountId, row.amount])).toEqual([
            ['financial-account-receivables', -3000],
            ['financial-account-bank', 3000],
        ]);
    });

    it('uses professional supplier payment descriptions without source IDs', async () => {
        const { storage, data } = makeStorage();
        await FinancialPostingService.ensureDefaultAccounts(storage);
        await FinancialPostingService.postSupplierPayment(storage, {
            id: 'payment-1', purchaseId: 'purchase-internal-id', date: '2026-08-22T10:00:00.000Z',
            amount: 1200, paymentMethod: 'cash', invoiceNumber: 'PUR-1042', supplierName: 'Acme Supplies',
        });

        expect(data.financialTransactions[0].description).toBe('Supplier payment · PUR-1042 · Acme Supplies');
        expect(data.financialTransactions[0].description).not.toContain('purchase-internal-id');
    });

    it('reverses movements without mutating the original movement', async () => {
        const { storage, data } = makeStorage();
        const original = await FinancialPostingService.postTransfer(storage, {
            id: 'transfer-1', date: '2026-08-22T10:00:00.000Z', amount: 1000,
            fromAccountId: 'financial-account-cash', toAccountId: 'financial-account-bank',
        }).catch(async () => {
            await FinancialPostingService.ensureDefaultAccounts(storage);
            return FinancialPostingService.postTransfer(storage, {
                id: 'transfer-1', date: '2026-08-22T10:00:00.000Z', amount: 1000,
                fromAccountId: 'financial-account-cash', toAccountId: 'financial-account-bank',
            });
        });

        await FinancialPostingService.reverse(storage, original.id, 'correction-1', 'reversal:transfer-1');

        expect(data.financialTransactions).toHaveLength(2);
        expect(data.financialMovements).toHaveLength(4);
        expect(data.financialMovements.slice(0, 2).map(row => row.amount)).toEqual([-1000, 1000]);
    });

    it('routes bank sale to explicitly selected bankAccountId when multiple banks exist', async () => {
        const { storage, data } = makeStorage();
        await FinancialPostingService.ensureDefaultAccounts(storage);
        // Add a secondary bank
        const customBank = {
            id: 'bank-nabil',
            name: 'Nabil Bank Account',
            type: 'bank',
            status: 'active',
            paymentMethods: ['bank'],
        };
        await storage.save('financialAccounts', customBank as any);

        await FinancialPostingService.postSale(storage, {
            id: 'sale-bank-1',
            date: '2026-08-22T10:00:00.000Z',
            grandTotal: 12000,
            paidAmount: 12000,
            paymentMethod: 'bank',
            bankAccountId: 'bank-nabil',
        });

        expect(data.financialMovements).toHaveLength(1);
        expect(data.financialMovements[0].accountId).toBe('bank-nabil');
        expect(data.financialMovements[0].amount).toBe(12000);
    });

    it('routes customer credit settlement to explicitly selected bankAccountId', async () => {
        const { storage, data } = makeStorage();
        await FinancialPostingService.ensureDefaultAccounts(storage);
        const customBank = {
            id: 'bank-global-ime',
            name: 'Global IME Account',
            type: 'bank',
            status: 'active',
            paymentMethods: ['bank'],
        };
        await storage.save('financialAccounts', customBank as any);

        await FinancialPostingService.postCustomerPayment(storage, {
            id: 'cust-pmt-bank-1',
            creditId: 'credit-100',
            date: '2026-08-22T10:00:00.000Z',
            amount: 4500,
            paymentMethod: 'bank',
            customerName: 'Sohan Shrestha',
            bankAccountId: 'bank-global-ime',
        });

        const bankMovement = data.financialMovements.find(m => m.accountId === 'bank-global-ime');
        expect(bankMovement).toBeDefined();
        expect(bankMovement?.amount).toBe(4500);
    });
});

