import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStorageProvider } from '@/storage/StorageContext';
import { FinancialAccount, FinancialMovement, PaymentMethod } from '@/types';
import { FinancialPostingService } from '@/services/financialPostingService';

export interface AccountFundInfo {
  id: string;
  name: string;
  type: FinancialAccount['type'];
  balance: number;
  paymentMethods?: string[];
  isSystem?: boolean;
}

export interface FundAvailabilityResult {
  available: number;
  isSufficient: boolean;
  deficit: number;
  accountName: string;
  accountId: string | null;
}

export function usePaymentFunds() {
  const storage = useStorageProvider();
  const [accounts, setAccounts] = useState<AccountFundInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadFunds = useCallback(async () => {
    try {
      await FinancialPostingService.ensureDefaultAccounts(storage);
      const [allAccounts, allMovements] = await Promise.all([
        storage.get<FinancialAccount>('financialAccounts'),
        storage.get<FinancialMovement>('financialMovements'),
      ]);

      const balanceMap = new Map<string, number>();
      for (const movement of allMovements) {
        if (!movement.accountId) continue;
        const current = balanceMap.get(movement.accountId) ?? 0;
        balanceMap.set(movement.accountId, current + Number(movement.amount || 0));
      }

      const activeAccounts: AccountFundInfo[] = allAccounts
        .filter(acc => acc.status === 'active')
        .map(acc => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          balance: balanceMap.get(acc.id) ?? 0,
          paymentMethods: acc.paymentMethods,
          isSystem: acc.isSystem,
        }));

      setAccounts(activeAccounts);
    } catch (err) {
      console.error('Failed to load payment funds:', err);
    } finally {
      setLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    loadFunds();
    const handleStorageChange = (e: any) => {
      const key = e?.detail?.key;
      if (!key || key === 'financialAccounts' || key === 'financialMovements' || key === 'financialTransactions' || key === 'purchases' || key === 'sales' || key === 'expenses') {
        loadFunds();
      }
    };

    window.addEventListener('sohan-storage-changed', handleStorageChange);
    return () => window.removeEventListener('sohan-storage-changed', handleStorageChange);
  }, [loadFunds]);

  const accountLookup = useMemo(() => {
    return new Map(accounts.map(acc => [acc.id, acc]));
  }, [accounts]);

  const bankAccounts = useMemo(() => {
    return accounts.filter(acc => acc.type === 'bank' || acc.type === 'cooperative');
  }, [accounts]);

  const getAccountBalance = useCallback((accountId: string): number => {
    return accountLookup.get(accountId)?.balance ?? 0;
  }, [accountLookup]);

  const resolveAccountForMethod = useCallback((
    method: PaymentMethod | string,
    bankAccountId?: string | null
  ): AccountFundInfo | null => {
    if (method === 'split' || method === 'credit') return null;

    if (method === 'bank') {
      if (bankAccountId) {
        const found = accountLookup.get(bankAccountId);
        if (found) return found;
      }
      // Fallback to primary bank or first bank
      const primaryBank = accounts.find(a => a.id === 'financial-account-bank' || (a.type === 'bank' && a.paymentMethods?.includes('bank')));
      return primaryBank ?? accounts.find(a => a.type === 'bank' || a.type === 'cooperative') ?? null;
    }

    if (method === 'qr') {
      const qrBank = accounts.find(a => a.paymentMethods?.includes('qr'));
      if (qrBank) return qrBank;
      const primaryBank = accounts.find(a => a.id === 'financial-account-bank' || a.type === 'bank');
      return primaryBank ?? null;
    }

    if (method === 'cash') {
      const cashAcc = accounts.find(a => a.id === 'financial-account-cash' || a.type === 'cash' || a.paymentMethods?.includes('cash'));
      return cashAcc ?? null;
    }

    if (method === 'card') {
      const cardAcc = accounts.find(a => a.id === 'financial-account-card' || a.type === 'card' || a.paymentMethods?.includes('card'));
      return cardAcc ?? null;
    }

    if (method === 'other') {
      const digitalAcc = accounts.find(a => a.id === 'financial-account-digital' || a.type === 'digital' || a.paymentMethods?.includes('other'));
      return digitalAcc ?? null;
    }

    return null;
  }, [accountLookup, accounts]);

  const getMethodBalance = useCallback((
    method: PaymentMethod | string,
    bankAccountId?: string | null
  ): number => {
    const acc = resolveAccountForMethod(method, bankAccountId);
    return acc ? acc.balance : 0;
  }, [resolveAccountForMethod]);

  const checkFundAvailability = useCallback((
    method: PaymentMethod | string,
    amount: number,
    bankAccountId?: string | null
  ): FundAvailabilityResult => {
    const safeAmount = Math.max(0, Number(amount) || 0);
    const acc = resolveAccountForMethod(method, bankAccountId);

    if (!acc) {
      return {
        available: 0,
        isSufficient: false,
        deficit: safeAmount,
        accountName: method.toUpperCase(),
        accountId: null,
      };
    }

    const available = acc.balance;
    const isSufficient = available >= safeAmount;
    const deficit = isSufficient ? 0 : safeAmount - available;

    return {
      available,
      isSufficient,
      deficit,
      accountName: acc.name,
      accountId: acc.id,
    };
  }, [resolveAccountForMethod]);

  return {
    accounts,
    bankAccounts,
    loading,
    getAccountBalance,
    getMethodBalance,
    resolveAccountForMethod,
    checkFundAvailability,
    refreshFunds: loadFunds,
  };
}
