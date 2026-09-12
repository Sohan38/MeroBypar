import { endOfDay, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import type { Credit, Expense, Product, PurchaseInvoice, SaleInvoice, SaleItem } from '@/types';
import { isActiveSale } from './saleUtils';

function toDate(value: string | Date): Date {
    if (value instanceof Date) return value;
    try {
        return parseISO(value);
    } catch {
        return new Date(value);
    }
}

function isWithinRange(dateValue: string, start: Date, end: Date) {
    const date = toDate(dateValue);
    return !isBefore(date, startOfDay(start)) && !isAfter(date, endOfDay(end));
}

function toNumber(value: number | undefined | null) {
    return Number(value ?? 0);
}

function getProductCost(product: Product | undefined) {
    return product?.purchaseRate ?? 0;
}

function getSaleNetRevenue(sale: SaleInvoice) {
    return Math.max(0, toNumber(sale.grandTotal) - toNumber(sale.tax));
}

function getDiscountAdjustedItemRevenue(itemSubtotal: number, saleSubtotal: number, saleDiscount: number) {
    if (saleSubtotal <= 0 || saleDiscount <= 0) {
        return itemSubtotal;
    }

    const discountRatio = Math.min(1, saleDiscount / saleSubtotal);
    return Math.max(0, itemSubtotal * (1 - discountRatio));
}

export function getSaleItemCOGS(
    item: SaleItem,
    saleDate: string,
    product: Product | undefined,
    purchaseHistory: Array<{ date: string; purchaseRate: number }> = [],
) {
    const itemCOGSFromAllocations = Array.isArray(item.costAllocations) && item.costAllocations.length > 0
        ? item.costAllocations.reduce((sum, allocation) => {
            const qty = Number(allocation.quantity ?? 0);
            const rate = Number(allocation.purchaseRate ?? 0);
            return sum + (qty * rate);
        }, 0)
        : null;

    if (itemCOGSFromAllocations !== null) {
        return itemCOGSFromAllocations;
    }

    const priorPurchases = purchaseHistory
        .filter(entry => !isAfter(toDate(entry.date), toDate(saleDate)))
        .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());

    const buyRate = priorPurchases[0]?.purchaseRate ?? getProductCost(product);
    return buyRate * item.quantity;
}

export function buildFinancialMetrics(params: {
    sales: SaleInvoice[];
    expenses: Expense[];
    purchases: PurchaseInvoice[];
    credits: Credit[];
    inventory: Product[];
    start: Date;
    end: Date;
}) {
    const { sales, expenses, purchases, credits, inventory, start, end } = params;

    const productMap = new Map(inventory.map(product => [product.id, product]));

    const salesInScope = sales.filter(sale => isActiveSale(sale) && isWithinRange(sale.date, start, end));
    const expensesInScope = expenses.filter(expense => isWithinRange(expense.date, start, end));
    const operatingExpensesInScope = expensesInScope.filter(expense => !expense.sourcePurchaseId);
    const purchasesInScope = purchases.filter(purchase => isWithinRange(purchase.date, start, end));

    const purchaseHistoryByProduct = new Map<string, Array<{ date: string; purchaseRate: number }>>();
    for (const purchase of purchases) {
        for (const item of purchase.items) {
            const history = purchaseHistoryByProduct.get(item.productId) ?? [];
            history.push({ date: purchase.date, purchaseRate: item.purchaseRate });
            purchaseHistoryByProduct.set(item.productId, history);
        }
    }

    const salesRevenue = salesInScope.reduce((sum, sale) => sum + getSaleNetRevenue(sale), 0);
    const collected = salesInScope.reduce((sum, sale) => sum + toNumber(sale.paidAmount), 0);
    const creditCreated = salesInScope.reduce((sum, sale) => sum + Math.max(0, toNumber(sale.grandTotal) - toNumber(sale.paidAmount)), 0);

    let cogs = 0;
    const topProductsMap: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};

    for (const sale of salesInScope) {
        const saleSubtotal = sale.items.reduce((sum, item) => sum + toNumber(item.subtotal), 0);

        for (const item of sale.items) {
            const product = productMap.get(item.productId);
            const history = purchaseHistoryByProduct.get(item.productId) ?? [];
            const itemCOGS = getSaleItemCOGS(item, sale.date, product, history);
            const itemRevenue = getDiscountAdjustedItemRevenue(toNumber(item.subtotal), saleSubtotal, toNumber(sale.discount));
            const itemProfit = itemRevenue - itemCOGS;
            cogs += itemCOGS;

            if (!topProductsMap[item.productId]) {
                topProductsMap[item.productId] = { name: item.productName, qty: 0, revenue: 0, profit: 0 };
            }
            topProductsMap[item.productId].qty += item.quantity;
            topProductsMap[item.productId].revenue += itemRevenue;
            topProductsMap[item.productId].profit += itemProfit;
        }
    }

    const expensesTotal = operatingExpensesInScope.reduce((sum, expense) => sum + toNumber(expense.amount), 0);
    const purchasesTotal = purchasesInScope.reduce((sum, purchase) => sum + toNumber(purchase.grandTotal), 0);
    const grossProfit = salesRevenue - cogs;
    const netProfit = grossProfit - expensesTotal;
    const grossMargin = salesRevenue > 0 ? (grossProfit / salesRevenue) * 100 : 0;

    const collectedCredit = credits.reduce((sum, credit) => {
        const payments = (credit.payments ?? []).filter(payment => isWithinRange(payment.date, start, end));
        const paymentTotal = payments.reduce((paymentSum, payment) => paymentSum + toNumber(payment.amount), 0);
        return sum + paymentTotal;
    }, 0);

    const supplierPayments = purchases.reduce((sum, purchase) => {
        const payments = (purchase.payments ?? []).filter(payment => isWithinRange(payment.date, start, end));
        const paymentTotal = payments.reduce((paymentSum, payment) => paymentSum + toNumber(payment.amount), 0);
        const effectivePaid = purchase.paymentMethod === 'credit'
            ? 0
            : Math.min(toNumber(purchase.paidAmount), toNumber(purchase.grandTotal));
        return sum + Math.max(paymentTotal, effectivePaid);
    }, 0);

    const customerReceivables = credits
        .filter(credit => !isAfter(toDate(credit.date), end))
        .reduce((sum, credit) => {
            const paymentsUpToEnd = (credit.payments ?? []).filter(payment => !isAfter(toDate(payment.date), end));
            const paidUpToEnd = paymentsUpToEnd.reduce((paymentSum, payment) => paymentSum + toNumber(payment.amount), 0);
            return sum + Math.max(0, toNumber(credit.amount) - paidUpToEnd);
        }, 0);

    const supplierPayables = purchases
        .filter(purchase => !isAfter(toDate(purchase.date), end))
        .reduce((sum, purchase) => {
            const effectivePaid = purchase.paymentMethod === 'credit'
                ? 0
                : Math.min(toNumber(purchase.paidAmount), toNumber(purchase.grandTotal));
            return sum + Math.max(0, toNumber(purchase.grandTotal) - effectivePaid);
        }, 0);

    const paymentBreakdown = salesInScope.reduce<Record<string, number>>((map, sale) => {
        const splitPayments = (sale.splitPayments ?? []).filter(payment => payment.amount > 0);
        if (splitPayments.length > 0) {
            for (const payment of splitPayments) {
                const key = payment.method || sale.paymentMethod;
                map[key] = (map[key] ?? 0) + payment.amount;
            }
            return map;
        }

        if (sale.paymentMethod && sale.paymentMethod !== 'credit' && sale.paidAmount > 0) {
            const amount = Math.min(toNumber(sale.paidAmount), toNumber(sale.grandTotal));
            map[sale.paymentMethod] = (map[sale.paymentMethod] ?? 0) + amount;
        }

        return map;
    }, {});

    const topProducts = Object.values(topProductsMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    const expenseBreakdown: Record<string, number> = {};
    for (const expense of operatingExpensesInScope) {
        expenseBreakdown[expense.category] = (expenseBreakdown[expense.category] || 0) + expense.amount;
    }

    const expensePieData = Object.entries(expenseBreakdown)
        .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
        .sort((a, b) => b.value - a.value);

    const paymentPieData = Object.entries(paymentBreakdown)
        .map(([name, value]) => ({ name: name.toUpperCase(), value }))
        .sort((a, b) => b.value - a.value);

    return {
        salesRevenue,
        collected: collected + collectedCredit,
        creditCreated,
        expensesTotal,
        purchasesTotal,
        grossProfit,
        netProfit,
        grossMargin,
        cogs,
        customerReceivables,
        supplierPayables,
        supplierPayments,
        collectedCredit,
        expensePieData,
        paymentPieData,
        topProducts,
        salesCount: salesInScope.length,
    };
}
