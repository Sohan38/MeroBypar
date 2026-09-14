import { v4 as uuidv4 } from 'uuid';
import Dexie from 'dexie';
import type {
    FinancialAccount,
    FinancialMovement,
    FinancialTransaction,
    FinancialTransactionType,
    PaymentMethod,
    PaymentSplitEntry,
} from '@/types';
import type { IStorageProvider } from '@/storage/IStorageProvider';

export type FinancialMovementInput = {
    accountId: string;
    amount: number;
    description?: string;
    locationId?: string | null;
};

export type PostFinancialTransactionInput = {
    date: string;
    type: FinancialTransactionType;
    description: string;
    sourceType: string;
    sourceId: string;
    idempotencyKey: string;
    movements: FinancialMovementInput[];
    reference?: string | null;
    userId?: string | null;
    locationId?: string | null;
};

export type FinancialDaybookRow = {
    transaction: FinancialTransaction;
    movement: FinancialMovement;
    account: FinancialAccount | null;
};

const TRANSACTIONS_KEY = 'financialTransactions';
const MOVEMENTS_KEY = 'financialMovements';
const ACCOUNTS_KEY = 'financialAccounts';

const DEFAULT_ACCOUNTS: Array<Pick<FinancialAccount, 'id' | 'name' | 'type' | 'status' | 'paymentMethods' | 'isSystem'>> = [
    { id: 'financial-account-cash', name: 'Main Cash Drawer', type: 'cash', status: 'active', paymentMethods: ['cash'], isSystem: true },
    { id: 'financial-account-bank', name: 'Primary Bank A/C (Fonepay QR Linked)', type: 'bank', status: 'active', paymentMethods: ['bank', 'qr'], isSystem: true },
    { id: 'financial-account-digital', name: 'Digital Wallet (eSewa / Khalti)', type: 'digital', status: 'active', paymentMethods: ['other'], isSystem: true },
    { id: 'financial-account-card', name: 'Card Clearing', type: 'card', status: 'active', paymentMethods: ['card'], isSystem: true },
    { id: 'financial-account-other', name: 'Other Clearing', type: 'clearing', status: 'active', paymentMethods: [], isSystem: true },
    { id: 'financial-account-receivables', name: 'Customer Receivables', type: 'receivable', status: 'active', paymentMethods: [], isSystem: true },
    { id: 'financial-account-payables', name: 'Supplier Payables', type: 'payable', status: 'active', paymentMethods: [], isSystem: true },
];

type AccountPaymentMethod = Exclude<PaymentMethod, 'split' | 'credit'>;

function isAccountPaymentMethod(method: PaymentMethod): method is AccountPaymentMethod {
    return method !== 'split' && method !== 'credit';
}

function now() {
    return new Date().toISOString();
}

function makeRecordFields() {
    const timestamp = now();
    return { createdAt: timestamp, updatedAt: timestamp, deletedAt: null, version: 1 };
}

function validateMovementInputs(movements: FinancialMovementInput[]) {
    if (movements.length === 0) throw new Error('A financial transaction needs at least one movement.');
    for (const movement of movements) {
        if (!movement.accountId) throw new Error('Every financial movement needs an account.');
        if (!Number.isFinite(movement.amount) || movement.amount === 0) {
            throw new Error('Financial movement amounts must be finite and non-zero.');
        }
    }
}

async function postWithinTransaction(
    storage: IStorageProvider,
    input: PostFinancialTransactionInput,
): Promise<FinancialTransaction> {
    validateMovementInputs(input.movements);

    const existing = (await storage.get<FinancialTransaction>(TRANSACTIONS_KEY))
        .find(transaction => transaction.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;

    const accounts = await storage.get<FinancialAccount>(ACCOUNTS_KEY);
    const accountIds = new Set(accounts.filter(account => account.status === 'active').map(account => account.id));
    for (const movement of input.movements) {
        if (!accountIds.has(movement.accountId)) {
            throw new Error(`Financial account not found or inactive: ${movement.accountId}`);
        }
    }

    const transactionId = uuidv4();
    const transaction: FinancialTransaction = {
        id: transactionId,
        ...makeRecordFields(),
        date: input.date,
        type: input.type,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reference: input.reference ?? null,
        status: 'posted',
        reversalOfId: null,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId ?? null,
        locationId: input.locationId ?? null,
    };

    await storage.save(TRANSACTIONS_KEY, transaction);

    for (const [index, inputMovement] of input.movements.entries()) {
        const movement: FinancialMovement = {
            id: `${transactionId}:${index}`,
            ...makeRecordFields(),
            transactionId,
            accountId: inputMovement.accountId,
            amount: inputMovement.amount,
            date: input.date,
            description: inputMovement.description ?? input.description,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            reference: input.reference ?? null,
            locationId: inputMovement.locationId ?? input.locationId ?? null,
        };
        await storage.save(MOVEMENTS_KEY, movement);
    }

    return transaction;
}

export class FinancialPostingService {
    static async ensureDefaultAccounts(storage: IStorageProvider) {
        const accounts = await storage.get<FinancialAccount>(ACCOUNTS_KEY);
        for (const defaultAccount of DEFAULT_ACCOUNTS) {
            if (accounts.some(account => account.id === defaultAccount.id)) continue;
            await storage.save(ACCOUNTS_KEY, { ...defaultAccount, ...makeRecordFields(), locationId: null });
        }
    }

    private static async buildSalePosting(
        storage: IStorageProvider,
        sale: {
            id: string;
            date: string;
            grandTotal: number;
            paidAmount: number;
            paymentMethod: PaymentMethod;
            splitPayments?: Array<{ method: PaymentMethod; amount: number }>;
            customerId?: string | null;
            locationId?: string | null;
            invoiceNumber?: string | null;
            customerName?: string | null;
            bankAccountId?: string | null;
        },
        inTransaction = false,
    ) {
        await this.ensureDefaultAccounts(storage);
        const movements: FinancialMovementInput[] = [];
        const receivablesId = 'financial-account-receivables';
        const splits = (sale.splitPayments ?? []).filter(payment => payment.amount > 0 && payment.method !== 'split');

        if (splits.length > 0) {
            for (const split of splits) {
                if (split.method === 'credit') {
                    movements.push({ accountId: receivablesId, amount: split.amount });
                } else if (isAccountPaymentMethod(split.method)) {
                    const explicitId = split.method === 'bank' ? sale.bankAccountId : null;
                    const accountId = await this.resolvePaymentAccount(storage, split.method, explicitId);
                    if (!accountId) throw new Error(`No financial account configured for ${split.method}.`);
                    movements.push({ accountId, amount: split.amount });
                }
            }
        } else if (sale.paymentMethod === 'credit') {
            const paidAmount = Math.min(Math.max(0, sale.paidAmount), sale.grandTotal);
            const dueAmount = Math.max(0, sale.grandTotal - paidAmount);
            if (paidAmount > 0) {
                const accountId = await this.resolvePaymentAccount(storage, 'cash');
                if (!accountId) throw new Error('No financial account configured for cash.');
                movements.push({ accountId, amount: paidAmount });
            }
            if (dueAmount > 0) movements.push({ accountId: receivablesId, amount: dueAmount });
        } else if (isAccountPaymentMethod(sale.paymentMethod)) {
            const amount = Math.min(Math.max(0, sale.paidAmount), sale.grandTotal);
            if (amount > 0) {
                const explicitId = sale.paymentMethod === 'bank' ? sale.bankAccountId : null;
                const accountId = await this.resolvePaymentAccount(storage, sale.paymentMethod, explicitId);
                if (!accountId) throw new Error(`No financial account configured for ${sale.paymentMethod}.`);
                movements.push({ accountId, amount });
            }
        }

        const posting: PostFinancialTransactionInput = {
            date: sale.date,
            type: sale.paymentMethod === 'credit' ? 'customer_credit' : 'sale_payment',
            description: `Sale${sale.invoiceNumber ? ` ${sale.invoiceNumber}` : ''}${sale.customerName ? ` · ${sale.customerName}` : ''}`,
            sourceType: 'sale',
            sourceId: sale.id,
            idempotencyKey: `sale:${sale.id}:payment`,
            locationId: sale.locationId ?? null,
            movements,
        };
        return inTransaction ? postWithinTransaction(storage, posting) : this.post(storage, posting);
    }

    static async postSale(
        storage: IStorageProvider,
        sale: Parameters<typeof FinancialPostingService.buildSalePosting>[1],
    ) {
        await this.ensureDefaultAccounts(storage);
        return this.buildSalePosting(storage, sale);
    }

    static async postSaleInTransaction(
        storage: IStorageProvider,
        sale: Parameters<typeof FinancialPostingService.buildSalePosting>[1],
    ) {
        await this.ensureDefaultAccounts(storage);
        return this.buildSalePosting(storage, sale, true);
    }

    static async postExpense(storage: IStorageProvider, expense: {
        id: string;
        date: string;
        amount: number;
        paymentMethod: Exclude<PaymentMethod, 'split' | 'credit'>;
        description: string;
        eventKey?: string;
    }) {
        await this.ensureDefaultAccounts(storage);
        const accountId = await this.resolvePaymentAccount(storage, expense.paymentMethod);
        if (!accountId) throw new Error(`No financial account configured for ${expense.paymentMethod}.`);
        return this.post(storage, {
            date: expense.date,
            type: 'expense',
            description: expense.description,
            sourceType: 'expense',
            sourceId: expense.id,
            idempotencyKey: expense.eventKey ?? `expense:${expense.id}:payment`,
            movements: [{ accountId, amount: -Math.abs(expense.amount) }],
        });
    }

    static async postCustomerPayment(storage: IStorageProvider, payment: {
        id: string;
        date: string;
        amount: number;
        paymentMethod: Exclude<PaymentMethod, 'split' | 'credit'>;
        creditId: string;
        customerName?: string | null;
        bankAccountId?: string | null;
    }) {
        await this.ensureDefaultAccounts(storage);
        const explicitId = payment.paymentMethod === 'bank' ? payment.bankAccountId : null;
        const accountId = await this.resolvePaymentAccount(storage, payment.paymentMethod, explicitId);
        if (!accountId) throw new Error(`No financial account configured for ${payment.paymentMethod}.`);
        return this.post(storage, {
            date: payment.date,
            type: 'customer_payment',
            description: `Customer payment${payment.customerName ? ` · ${payment.customerName}` : ''}`,
            sourceType: 'customer_payment',
            sourceId: payment.id,
            idempotencyKey: `customer-payment:${payment.id}`,
            movements: [
                { accountId: 'financial-account-receivables', amount: -Math.abs(payment.amount) },
                { accountId, amount: Math.abs(payment.amount) },
            ],
        });
    }

    static async postCreditLending(storage: IStorageProvider, loan: {
        id: string;
        date: string;
        amount: number;
        paymentMethod: PaymentMethod | string;
        bankAccountId?: string | null;
        splitDisbursements?: PaymentSplitEntry[];
        customerName?: string | null;
        description?: string | null;
    }) {
        await this.ensureDefaultAccounts(storage);
        const movements: { accountId: string; amount: number }[] = [];

        // 1. Receivables increases (Asset: money owed to business)
        movements.push({
            accountId: 'financial-account-receivables',
            amount: Math.abs(loan.amount),
        });

        // 2. Disbursed from financial accounts (Money leaving cash drawer or bank)
        if (loan.paymentMethod === 'split' && loan.splitDisbursements && loan.splitDisbursements.length > 0) {
            for (const split of loan.splitDisbursements) {
                const splitAmt = Number(split.amount) || 0;
                if (splitAmt <= 0) continue;
                const explicitId = split.method === 'bank' ? split.bankAccountId : null;
                const accId = await this.resolvePaymentAccount(storage, split.method, explicitId);
                if (!accId) throw new Error(`No financial account found for ${split.method}`);
                movements.push({
                    accountId: accId,
                    amount: -Math.abs(splitAmt),
                });
            }
        } else {
            const explicitId = loan.paymentMethod === 'bank' ? loan.bankAccountId : null;
            const accId = await this.resolvePaymentAccount(storage, loan.paymentMethod as any, explicitId);
            if (!accId) throw new Error(`No financial account found for ${loan.paymentMethod}`);
            movements.push({
                accountId: accId,
                amount: -Math.abs(loan.amount),
            });
        }

        return this.post(storage, {
            date: loan.date,
            type: 'customer_lending',
            description: `Money lent to ${loan.customerName || 'customer'}${loan.description ? ` · ${loan.description}` : ''}`,
            sourceType: 'customer_lending',
            sourceId: loan.id,
            idempotencyKey: `credit-lending:${loan.id}`,
            movements,
        });
    }

    static async postSupplierPayment(storage: IStorageProvider, payment: {
        id: string;
        date: string;
        amount: number;
        paymentMethod: PaymentMethod;
        purchaseId: string;
        eventKey?: string;
        invoiceNumber?: string | null;
        supplierName?: string | null;
        bankAccountId?: string | null;
        splitPayments?: PaymentSplitEntry[];
    }) {
        await this.ensureDefaultAccounts(storage);

        // Handle split payments disbursement
        if (payment.paymentMethod === 'split' && payment.splitPayments && payment.splitPayments.length > 0) {
            const movements: FinancialMovementInput[] = [];
            let totalSplitAmount = 0;
            for (const split of payment.splitPayments) {
                const splitAmt = Math.max(0, Number(split.amount) || 0);
                if (splitAmt <= 0) continue;
                totalSplitAmount += splitAmt;
                const explicitId = split.method === 'bank' ? split.bankAccountId : null;
                const accountId = await this.resolvePaymentAccount(storage, split.method, explicitId);
                if (!accountId) throw new Error(`No financial account configured for ${split.method}.`);
                movements.push({ accountId, amount: -Math.abs(splitAmt) });
            }
            if (movements.length > 0) {
                movements.unshift({ accountId: 'financial-account-payables', amount: -Math.abs(totalSplitAmount) });
                return this.post(storage, {
                    date: payment.date,
                    type: 'supplier_payment',
                    description: `Supplier payment (Split)${payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ''}${payment.supplierName ? ` · ${payment.supplierName}` : ''}`,
                    sourceType: 'supplier_payment',
                    sourceId: payment.id,
                    idempotencyKey: payment.eventKey ?? `supplier-payment:${payment.id}`,
                    movements,
                });
            }
            return null;
        }

        if (isAccountPaymentMethod(payment.paymentMethod)) {
            const explicitId = payment.paymentMethod === 'bank' ? payment.bankAccountId : null;
            const accountId = await this.resolvePaymentAccount(storage, payment.paymentMethod, explicitId);
            if (!accountId) throw new Error(`No financial account configured for ${payment.paymentMethod}.`);
            return this.post(storage, {
                date: payment.date,
                type: 'supplier_payment',
                description: `Supplier payment${payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : ''}${payment.supplierName ? ` · ${payment.supplierName}` : ''}`,
                sourceType: 'supplier_payment',
                sourceId: payment.id,
                idempotencyKey: payment.eventKey ?? `supplier-payment:${payment.id}`,
                movements: [
                    { accountId: 'financial-account-payables', amount: -Math.abs(payment.amount) },
                    { accountId, amount: -Math.abs(payment.amount) },
                ],
            });
        }
        return null;
    }

    static async postPurchase(storage: IStorageProvider, purchase: {
        id: string;
        date: string;
        grandTotal: number;
        paidAmount?: number;
        paymentMethod: PaymentMethod;
        payments?: any[];
        status?: string;
        version?: number;
        invoiceNumber?: string | null;
        supplierName?: string | null;
        bankAccountId?: string | null;
        splitPayments?: PaymentSplitEntry[];
    }) {
        await this.ensureDefaultAccounts(storage);
        if (purchase.status !== 'received') return null;
        const payableAmount = Math.max(0, Number(purchase.grandTotal) || 0);
        await this.post(storage, {
            date: purchase.date,
            type: 'purchase_receipt',
            description: `Purchase${purchase.invoiceNumber ? ` ${purchase.invoiceNumber}` : ''}${purchase.supplierName ? ` · ${purchase.supplierName}` : ''}`,
            sourceType: 'purchase',
            sourceId: purchase.id,
            idempotencyKey: `purchase:${purchase.id}:receipt:v${purchase.version ?? 1}`,
            movements: [{ accountId: 'financial-account-payables', amount: payableAmount }],
        });

        // 1. If explicit payments list exists (from settlements or multiple installments)
        if (purchase.payments && purchase.payments.length > 0) {
            let lastResult = null;
            for (const payment of purchase.payments) {
                const pmtAmount = Number(payment.amount) || 0;
                if (pmtAmount <= 0) continue;
                const method = payment.paymentMethod ?? (purchase.paymentMethod || 'cash');
                lastResult = await this.postSupplierPayment(storage, {
                    id: payment.id || uuidv4(),
                    purchaseId: purchase.id,
                    date: payment.date || purchase.date,
                    amount: pmtAmount,
                    paymentMethod: method,
                    eventKey: `purchase:${purchase.id}:payment:${payment.id || uuidv4()}:v${purchase.version ?? 1}`,
                    invoiceNumber: purchase.invoiceNumber,
                    supplierName: purchase.supplierName,
                    bankAccountId: payment.bankAccountId ?? payment.financialAccountId ?? (payment.paymentMethod === 'bank' ? purchase.bankAccountId : null),
                    splitPayments: payment.splitPayments,
                });
            }
            return lastResult;
        }

        // 2. Upfront split payment during purchase creation
        if (purchase.paymentMethod === 'split') {
            const splits = (purchase.splitPayments ?? []).filter(s => Number(s.amount) > 0);
            if (splits.length > 0) {
                const totalSplitAmount = splits.reduce((sum, s) => sum + Number(s.amount || 0), 0);
                return this.postSupplierPayment(storage, {
                    id: `${purchase.id}:split-payment:v${purchase.version ?? 1}`,
                    purchaseId: purchase.id,
                    date: purchase.date,
                    amount: totalSplitAmount,
                    paymentMethod: 'split',
                    splitPayments: splits,
                    eventKey: `purchase:${purchase.id}:payment:v${purchase.version ?? 1}`,
                    invoiceNumber: purchase.invoiceNumber,
                    supplierName: purchase.supplierName,
                });
            }
            return null;
        }

        // 3. Otherwise if single upfront payment was made
        const paidAmount = purchase.paymentMethod === 'credit'
            ? 0
            : Math.min(Math.max(0, Number(purchase.paidAmount) || 0), payableAmount);
        if (paidAmount <= 0) return null;
        return this.postSupplierPayment(storage, {
            id: `${purchase.id}:payment:v${purchase.version ?? 1}`,
            purchaseId: purchase.id,
            date: purchase.date,
            amount: paidAmount,
            paymentMethod: purchase.paymentMethod as Exclude<PaymentMethod, 'split' | 'credit'>,
            eventKey: `purchase:${purchase.id}:payment:v${purchase.version ?? 1}`,
            invoiceNumber: purchase.invoiceNumber,
            supplierName: purchase.supplierName,
            bankAccountId: purchase.paymentMethod === 'bank' ? purchase.bankAccountId : null,
        });
    }

    static async postTransfer(storage: IStorageProvider, transfer: {
        id: string;
        date: string;
        amount: number;
        fromAccountId: string;
        toAccountId: string;
        description?: string;
    }) {
        return this.post(storage, {
            date: transfer.date,
            type: 'transfer',
            description: transfer.description ?? 'Account transfer',
            sourceType: 'transfer',
            sourceId: transfer.id,
            idempotencyKey: `transfer:${transfer.id}`,
            movements: [
                { accountId: transfer.fromAccountId, amount: -Math.abs(transfer.amount) },
                { accountId: transfer.toAccountId, amount: Math.abs(transfer.amount) },
            ],
        });
    }

    static async postOpeningBalance(storage: IStorageProvider, opening: {
        id: string;
        date: string;
        accountId: string;
        amount: number;
        description?: string;
    }) {
        return this.post(storage, {
            date: opening.date,
            type: 'opening_balance',
            description: opening.description ?? 'Opening balance',
            sourceType: 'opening_balance',
            sourceId: opening.id,
            idempotencyKey: `opening-balance:${opening.id}`,
            movements: [{ accountId: opening.accountId, amount: opening.amount }],
        });
    }

    static async post(
        storage: IStorageProvider,
        input: PostFinancialTransactionInput,
    ): Promise<FinancialTransaction> {
        const work = async () => {
            console.log('[FinancialPost] work() START', input.idempotencyKey);
            const result = await postWithinTransaction(storage, input);
            console.log('[FinancialPost] work() END', input.idempotencyKey);
            return result;
        };
        // If already inside a Dexie transaction (e.g. called from purchaseService.persistTransition),
        // run directly — opening a nested storage.transaction() causes the outer promise to hang.
        if (Dexie.currentTransaction) {
            console.log('[FinancialPost] Running inside existing transaction');
            return work();
        }
        if (storage.transaction) {
            console.log('[FinancialPost] Opening new transaction for', input.idempotencyKey);
            const result = await storage.transaction([TRANSACTIONS_KEY, MOVEMENTS_KEY, ACCOUNTS_KEY, 'settings'], 'rw', work);
            console.log('[FinancialPost] Transaction resolved for', input.idempotencyKey);
            return result;
        }
        return work();
    }

    static async reverse(
        storage: IStorageProvider,
        transactionId: string,
        sourceId: string,
        idempotencyKey: string,
        date = now(),
    ) {
        const transactions = await storage.get<FinancialTransaction>(TRANSACTIONS_KEY);
        const original = transactions.find(transaction => transaction.id === transactionId);
        if (!original) throw new Error('Financial transaction not found.');

        const generateReversalDescription = (desc: string) => {
            if (desc.startsWith('Supplier payment')) {
                return `Payable Settlement Reversal · ${desc.replace(/^Supplier payment\s*·?\s*/i, '')}`;
            }
            if (desc.startsWith('Purchase')) {
                return `Purchase Adjustment (Reversal) · ${desc.replace(/^Purchase\s*/i, '')}`;
            }
            if (desc.startsWith('Customer payment')) {
                return `Customer Settlement Reversal · ${desc.replace(/^Customer payment\s*·?\s*/i, '')}`;
            }
            return `Reversal of ${desc}`;
        };

        const reversalDescription = generateReversalDescription(original.description);

        const movements = (await storage.get<FinancialMovement>(MOVEMENTS_KEY))
            .filter(movement => movement.transactionId === transactionId)
            .map(movement => ({
                accountId: movement.accountId,
                amount: -movement.amount,
                description: reversalDescription,
                locationId: movement.locationId,
            }));

        const reversal = await this.post(storage, {
            date,
            type: 'adjustment',
            description: reversalDescription,
            sourceType: 'financial_reversal',
            sourceId,
            idempotencyKey,
            reference: original.reference,
            userId: original.userId,
            locationId: original.locationId,
            movements,
        });

        await storage.save(TRANSACTIONS_KEY, {
            ...original,
            status: 'reversed',
            reversedById: reversal.id,
        } as FinancialTransaction);
        return reversal;
    }

    static async resolvePaymentAccount(
        storage: IStorageProvider,
        paymentMethod: Exclude<PaymentMethod, 'split' | 'credit'>,
        explicitAccountId?: string | null,
    ) {
        if (explicitAccountId) return explicitAccountId;
        const settings = await storage.getSettings();
        const configuredId = settings?.financialAccountMapping?.[paymentMethod];
        if (configuredId) return configuredId;

        const accounts = await storage.get<FinancialAccount>(ACCOUNTS_KEY);

        // Fonepay / Merchant QR lands directly in the linked Bank Account
        if (paymentMethod === 'qr') {
            const qrBank = accounts.find(account =>
                account.status === 'active' && account.paymentMethods?.includes('qr')
            );
            if (qrBank) return qrBank.id;

            const primaryBank = accounts.find(account =>
                account.status === 'active' && account.type === 'bank'
            );
            if (primaryBank) return primaryBank.id;
        }

        return accounts.find(account =>
            account.status === 'active' && account.paymentMethods?.includes(paymentMethod)
        )?.id ?? null;
    }

    static async getAccountBalance(storage: IStorageProvider, accountId: string) {
        const movements = await storage.get<FinancialMovement>(MOVEMENTS_KEY);
        return movements
            .filter(movement => movement.accountId === accountId)
            .reduce((total, movement) => total + Number(movement.amount || 0), 0);
    }

    static async getDaybook(
        storage: IStorageProvider,
        start?: string,
        end?: string,
    ): Promise<FinancialDaybookRow[]> {
        const [transactions, movements, accounts] = await Promise.all([
            storage.get<FinancialTransaction>(TRANSACTIONS_KEY),
            storage.get<FinancialMovement>(MOVEMENTS_KEY),
            storage.get<FinancialAccount>(ACCOUNTS_KEY),
        ]);
        const transactionsById = new Map(transactions.map(transaction => [transaction.id, transaction]));
        const accountsById = new Map(accounts.map(account => [account.id, account]));

        return movements
            .filter(movement => (!start || movement.date >= start) && (!end || movement.date <= end))
            .map(movement => ({
                transaction: transactionsById.get(movement.transactionId),
                movement,
                account: accountsById.get(movement.accountId) ?? null,
            }))
            .filter((row): row is FinancialDaybookRow => Boolean(row.transaction))
            .sort((a, b) => a.movement.date.localeCompare(b.movement.date));
    }
}
