import { IStorageProvider } from '@/storage/IStorageProvider';
import { createPurchase } from './purchaseService';
import { generateSupplierInvoiceNumber } from '@/utils/numbering';
import { Product } from '@/types';
import { safeCurrency, safeMul, safeQty } from '@/utils/unitUtils';

export type CreatePurchaseForStockOpts = {
    productId: string;
    quantity: number;
    supplierId?: string | null;
    supplierName?: string | null;
    purchaseRate?: number | null;
    date?: string | Date | null;
    invoiceNumber?: string | null;
    notes?: string | null;
    batchId?: string | null;
    batchNumber?: string | null;
    manufacturingDate?: string | null;
    expiryMonths?: number | null;
    expiryDate?: string | null;
    locationId?: string | null;
    variantName?: string | null;
};

export async function createPurchaseForStockIncrease(storage: IStorageProvider, opts: CreatePurchaseForStockOpts) {
    const qty = Number(opts.quantity || 0);
    if (qty <= 0) return null;

    const inventory = await storage.get<Product>('inventory');
    const purchases = await storage.get<any>('purchases');

    const product = inventory.find(p => p.id === opts.productId);
    const supplierId = opts.supplierId || product?.supplierId || product?.supplierIds?.[0] || '';
    if (!supplierId) return null;

    // Resolve supplier name from storage if not explicitly provided so numbering matches purchases form
    const suppliers = await storage.get<any>('suppliers');
    const resolvedSupplierName = opts.supplierName ?? suppliers.find((s: any) => s.id === supplierId)?.name ?? null;
    const invoice = (opts.invoiceNumber || '').trim() || generateSupplierInvoiceNumber(purchases, resolvedSupplierName ?? '', opts.date ?? new Date());
    const dateIso = opts.date ? (opts.date instanceof Date ? opts.date.toISOString() : new Date(opts.date).toISOString()) : new Date().toISOString();

    const rate = Number(opts.purchaseRate ?? product?.purchaseRate ?? 0) || 0;
    const subtotal = safeCurrency(safeMul(qty, rate));

    const item = {
        productId: opts.productId,
        productName: product?.name || 'Unknown',
        quantity: qty,
        purchaseRate: rate,
        subtotal,
        notes: opts.notes || '',
        batchId: opts.batchId ?? undefined,
        batchNumber: opts.batchNumber ?? undefined,
        manufacturingDate: opts.manufacturingDate ?? undefined,
        expiryMonths: opts.expiryMonths ?? undefined,
        expiryDate: opts.expiryDate ?? undefined,
        variantName: opts.variantName ?? undefined,
    } as any;

    const payload = {
        invoiceNumber: invoice,
        supplierId,
        supplierName: resolvedSupplierName ?? null,
        date: dateIso,
        items: [item],
        discount: 0,
        tax: 0,
        grandTotal: subtotal,
        paymentMethod: 'cash',
        paymentStatus: 'unpaid',
        paidAmount: 0,
        referenceNumber: undefined,
        notes: opts.notes || '',
        status: 'received' as const,
        locationId: opts.locationId ?? undefined,
    };

    return createPurchase(storage, payload as any);
}

export type CreatePurchaseForNewItemOpts = {
    productId: string;
    quantity: number;
    supplierId?: string | null;
    supplierName?: string | null;
    purchaseRate?: number | null;
    date?: string | Date | null;
    invoiceNumber?: string | null;
    notes?: string | null;
    batchId?: string | null;
    batchNumber?: string | null;
    manufacturingDate?: string | null;
    expiryMonths?: number | null;
    expiryDate?: string | null;
    locationId?: string | null;
};

async function buildPurchasePayloadsForNewItems(storage: IStorageProvider, optsList: CreatePurchaseForNewItemOpts[]) {
    const inventory = await storage.get<Product>('inventory');
    const purchases = await storage.get<any>('purchases');
    const suppliers = await storage.get<any>('suppliers');

    const grouped: Map<string, {
        supplierId?: string | null;
        supplierName?: string | null;
        invoiceNumber?: string | null;
        dateIso: string;
        notes?: string | null;
        items: any[];
        locationId?: string | null;
    }> = new Map();

    for (const opts of optsList) {
        const qty = Number(opts.quantity || 0);
        if (qty <= 0) continue;

        const product = inventory.find((item: Product) => item.id === opts.productId);
        const supplierId = opts.supplierId ?? product?.supplierId ?? product?.supplierIds?.[0] ?? '';
        const resolvedSupplierName = opts.supplierName ?? suppliers.find((supplier: any) => supplier.id === supplierId)?.name ?? null;
        const invoiceNumber = (opts.invoiceNumber || '').trim() || undefined;
        const dateIso = opts.date ? (opts.date instanceof Date ? opts.date.toISOString() : new Date(opts.date).toISOString()) : new Date().toISOString();
        const rate = Number(opts.purchaseRate ?? product?.purchaseRate ?? 0) || 0;
        const subtotal = safeCurrency(safeMul(qty, rate));

        const item = {
            productId: opts.productId,
            productName: product?.name || 'Unknown',
            quantity: qty,
            purchaseRate: rate,
            subtotal,
            notes: opts.notes || '',
            batchId: opts.batchId ?? undefined,
            batchNumber: opts.batchNumber ?? undefined,
            manufacturingDate: opts.manufacturingDate ?? undefined,
            expiryMonths: opts.expiryMonths ?? undefined,
            expiryDate: opts.expiryDate ?? undefined,
        } as any;

        const supplierKey = supplierId || resolvedSupplierName || 'unknown-supplier';
        const groupingKey = `${supplierKey}::${invoiceNumber ?? ''}::${opts.locationId ?? ''}`;
        const existing = grouped.get(groupingKey);

        if (existing) {
            existing.items.push(item);
            if (new Date(dateIso) < new Date(existing.dateIso)) {
                existing.dateIso = dateIso;
            }
            if (!existing.notes && opts.notes) {
                existing.notes = opts.notes;
            }
        } else {
            grouped.set(groupingKey, {
                supplierId: supplierId || undefined,
                supplierName: resolvedSupplierName ?? undefined,
                invoiceNumber: invoiceNumber ?? undefined,
                dateIso,
                notes: opts.notes || undefined,
                items: [item],
                locationId: opts.locationId || undefined,
            });
        }
    }

    const payloads: Array<any> = [];
    for (const group of grouped.values()) {
        const items = group.items;
        const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const invoice = group.invoiceNumber || generateSupplierInvoiceNumber(purchases, group.supplierName ?? '', group.dateIso ? new Date(group.dateIso) : new Date());

        payloads.push({
            invoiceNumber: invoice,
            supplierId: group.supplierId ?? '',
            supplierName: group.supplierName ?? null,
            date: group.dateIso,
            items,
            discount: 0,
            tax: 0,
            grandTotal,
            paymentMethod: 'cash',
            paymentStatus: 'unpaid',
            paidAmount: 0,
            referenceNumber: undefined,
            notes: group.notes || '',
            status: 'received' as const,
            locationId: group.locationId ?? undefined,
        });
    }

    return payloads;
}

export async function createPurchaseForNewItem(storage: IStorageProvider, opts: CreatePurchaseForNewItemOpts) {
    const [payload] = await buildPurchasePayloadsForNewItems(storage, [opts]);
    if (!payload) {
        return null;
    }

    return createPurchase(storage, payload as any);
}

export async function createPurchasesForNewItem(storage: IStorageProvider, optsList: CreatePurchaseForNewItemOpts[]) {
    const payloads = await buildPurchasePayloadsForNewItems(storage, optsList);
    const createdPurchases: Array<any> = [];

    for (const payload of payloads) {
        try {
            const created = await createPurchase(storage, payload as any);
            if (created) {
                createdPurchases.push(created);
            }
        } catch (error) {
            console.error('Failed to create purchase for new item:', error);
        }
    }

    return createdPurchases;
}
