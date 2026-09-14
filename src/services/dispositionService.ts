import { v4 as uuidv4 } from 'uuid';
import { IStorageProvider } from '@/storage/IStorageProvider';
import { createPurchase, PurchaseInput } from './purchaseService';
import {
    Product,
    ProductBatch,
    PurchaseInvoice,
    InventoryDisposition,
    DispositionReason,
    DispositionResolution,
    DispositionStatus,
    DispositionSettlementType,
    DispositionSettlementStatus,
    PaymentMethod,
} from '@/types';
import { safeCurrency, safeQty, safeMul } from '@/utils/unitUtils';

export type CreateInventoryDispositionInput = {
    referenceNumber?: string | null;
    date?: string | Date | null;
    performedById?: string | null;
    performedByName?: string | null;
    reason: DispositionReason;
    resolution: DispositionResolution;
    productId: string;
    batchId?: string | null;
    purchaseInvoiceId?: string | null;
    supplierId?: string | null;
    quantity: number;
    unitCost?: number | null;
    settlementAmount?: number | null;
    settlementMethod?: PaymentMethod | null;
    settlementStatus?: DispositionSettlementStatus | null;
    settlementReference?: string | null;
    settlementDate?: string | Date | null;
    notes?: string | null;
    idempotencyKey?: string | null;
    replacementDetails?: {
        batchNumber?: string | null;
        manufacturingDate?: string | null;
        expiryMode?: 'months' | 'manual';
        expiryMonths?: number | null;
        expiryDate?: string | null;
        notes?: string | null;
        purchaseRate?: number | null;
    };
    purchaseInvoiceRefId?: string | null;
};

export type ReverseInventoryDispositionInput = {
    dispositionId: string;
    performedById?: string | null;
    performedByName?: string | null;
    notes?: string | null;
    idempotencyKey?: string | null;
};

function normalizeDate(date?: string | Date | null) {
    if (!date) return new Date().toISOString();
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
}

function generateReferenceNumber(existingCount: number) {
    const next = existingCount + 1;
    return `DISP-${String(next).padStart(4, '0')}`;
}

async function getDispositionByIdempotencyKey(storage: IStorageProvider, key: string) {
    if (!key) return null;
    const dispositions = await storage.get<InventoryDisposition>('dispositions');
    return dispositions.find((d) => d.idempotencyKey === key) ?? null;
}

async function getPurchaseById(storage: IStorageProvider, id: string) {
    return await storage.getById<PurchaseInvoice>('purchases', id);
}

async function getBatchById(storage: IStorageProvider, id: string) {
    return await storage.getById<ProductBatch>('productBatches', id);
}

async function getProductById(storage: IStorageProvider, id: string) {
    return await storage.getById<Product>('inventory', id);
}

function buildDispositionRecord(
    input: CreateInventoryDispositionInput,
    overrides: Partial<InventoryDisposition>,
    referenceNumber: string,
    performedByName?: string | null,
    status: DispositionStatus = 'completed',
): InventoryDisposition {
    const unitCost = Number(input.unitCost ?? overrides.unitCost ?? 0);
    const quantity = Number(input.quantity || 0);

    return {
        id: uuidv4(),
        referenceNumber,
        date: normalizeDate(input.date),
        performedById: input.performedById ?? overrides.performedById ?? null,
        performedByName: performedByName ?? input.performedByName ?? overrides.performedByName ?? null,
        reason: input.reason,
        resolution: input.resolution,
        status,
        productId: input.productId,
        productName: overrides.productName ?? '',
        batchId: input.batchId ?? overrides.batchId ?? null,
        batchNumber: overrides.batchNumber ?? null,
        purchaseInvoiceId: input.purchaseInvoiceId ?? input.purchaseInvoiceRefId ?? overrides.purchaseInvoiceId ?? null,
        purchaseInvoiceNumber: overrides.purchaseInvoiceNumber ?? null,
        supplierId: input.supplierId ?? overrides.supplierId ?? null,
        supplierName: overrides.supplierName ?? null,
        quantity: safeQty(quantity),
        unitCost: safeCurrency(unitCost),
        totalValue: safeCurrency(safeMul(quantity, unitCost)),
        settlementAmount: safeCurrency(Number(input.settlementAmount ?? overrides.settlementAmount ?? 0)),
        settlementMethod: input.settlementMethod ?? overrides.settlementMethod ?? null,
        settlementType: overrides.settlementType ?? 'none',
        settlementStatus: input.settlementStatus ?? overrides.settlementStatus ?? null,
        settlementReference: input.settlementReference ?? overrides.settlementReference ?? null,
        settlementDate: input.settlementDate ? normalizeDate(input.settlementDate) : overrides.settlementDate ?? null,
        notes: input.notes ?? overrides.notes ?? null,
        reversalOfId: overrides.reversalOfId ?? null,
        reversedById: overrides.reversedById ?? null,
        replacementPurchaseInvoiceId: overrides.replacementPurchaseInvoiceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        version: 1,
    };
}

function getSettlementType(resolution: DispositionResolution): DispositionSettlementType {
    switch (resolution) {
        case 'supplier_credit':
            return 'credit';
        case 'supplier_refund':
            return 'refund';
        case 'supplier_replacement':
            return 'replacement';
        default:
            return 'none';
    }
}

export async function createInventoryDisposition(
    storage: IStorageProvider,
    input: CreateInventoryDispositionInput,
) {
    const existingByKey = input.idempotencyKey ? await getDispositionByIdempotencyKey(storage, input.idempotencyKey) : null;
    if (existingByKey) return existingByKey;

    if (input.resolution === 'reversal') {
        throw new Error('Use reverseInventoryDisposition for reversal dispositions.');
    }

    const dispositions = await storage.get<InventoryDisposition>('dispositions');
    if (input.referenceNumber) {
        const existingReference = dispositions.find((d) => d.referenceNumber === input.referenceNumber);
        if (existingReference) {
            throw new Error(`Disposition reference ${input.referenceNumber} already exists.`);
        }
    }

    const product = await getProductById(storage, input.productId);
    if (!product) throw new Error('Product not found.');

    const quantity = Number(input.quantity);
    if (quantity <= 0) throw new Error('Quantity must be greater than zero.');

    const batch = input.batchId ? await getBatchById(storage, input.batchId) : null;
    if (product.hasExpiry && !batch) {
        throw new Error('Expiry-enabled products require a batch selection.');
    }

    if (batch && batch.productId !== product.id) {
        throw new Error('Selected batch does not belong to the chosen product.');
    }

    const available = batch ? batch.quantity : product.quantity;
    if (quantity > available) {
        throw new Error(batch ? 'Disposition quantity cannot exceed available batch quantity.' : 'Disposition quantity cannot exceed available product quantity.');
    }

    const supplierId = input.supplierId ?? batch?.supplierId ?? product.supplierId ?? null;
    const supplierName = null;

    let purchaseInvoiceNumber: string | null = null;
    if (input.purchaseInvoiceId) {
        const purchase = await getPurchaseById(storage, input.purchaseInvoiceId);
        if (!purchase) throw new Error('Selected purchase invoice was not found.');
        purchaseInvoiceNumber = purchase.invoiceNumber ?? null;
    }

    const unitCost = Number(input.unitCost ?? batch?.purchaseRate ?? product.purchaseRate ?? 0);
    const referenceNumber = input.referenceNumber?.trim() || generateReferenceNumber(dispositions.length);
    const settlementType = getSettlementType(input.resolution);

    const dispositionRecord = buildDispositionRecord(
        input,
        {
            productName: product.name,
            batchId: batch?.id ?? null,
            batchNumber: batch?.batchNumber ?? null,
            purchaseInvoiceNumber,
            supplierId,
            supplierName,
            unitCost,
            settlementType,
        },
        referenceNumber,
        input.performedByName ?? null,
    );

    const transactionKeys = ['inventory', 'dispositions', 'inventoryLocationStocks'] as string[];
    if (batch) transactionKeys.push('productBatches', 'productBatchLocations');
    if (input.resolution === 'supplier_replacement') transactionKeys.push('purchases');

    const saveDisposition = async () => {
        if (batch) {
            batch.quantity = Math.max(0, batch.quantity - quantity);
            await storage.save('productBatches', batch);

            // Deduct batch location allocation at default location
            const batchLocations = await storage.get<any>('productBatchLocations');
            const batchLoc = batchLocations.find((bl: any) => bl.batchId === batch!.id && bl.locationId === 'loc-default' && !bl.deletedAt);
            if (batchLoc) {
                batchLoc.quantity = Math.max(0, Number(batchLoc.quantity ?? 0) - quantity);
                batchLoc.updatedAt = new Date().toISOString();
                await storage.save('productBatchLocations', batchLoc);
            }
        }

        // Deduct from default location stock
        const locationStocks = await storage.get<any>('inventoryLocationStocks');
        const locStock = locationStocks.find((s: any) => s.productId === product.id && s.locationId === 'loc-default' && !s.deletedAt);
        if (locStock) {
            locStock.quantity = Math.max(0, Number(locStock.quantity ?? 0) - quantity);
            locStock.lastMovementAt = new Date().toISOString();
            locStock.updatedAt = new Date().toISOString();
            await storage.save('inventoryLocationStocks', locStock);
        }

        product.quantity = Math.max(0, product.quantity - quantity);
        await storage.save('inventory', product);

        if (input.resolution === 'supplier_replacement') {
            if (!input.replacementDetails) {
                throw new Error('Replacement details are required for supplier replacement.');
            }

            const replacementPurchasePayload: PurchaseInput = {
                invoiceNumber: `REPL-${referenceNumber}`,
                supplierId: supplierId ?? '',
                supplierName: supplierName ?? null,
                date: dispositionRecord.date,
                items: [
                    {
                        productId: product.id,
                        productName: product.name,
                        quantity: safeQty(quantity),
                        purchaseRate: safeCurrency(Number(input.replacementDetails.purchaseRate ?? unitCost)),
                        subtotal: safeCurrency(safeMul(quantity, Number(input.replacementDetails.purchaseRate ?? unitCost))),
                        batchId: undefined,
                        batchNumber: input.replacementDetails.batchNumber ?? undefined,
                        manufacturingDate: input.replacementDetails.manufacturingDate ?? undefined,
                        expiryMonths: input.replacementDetails.expiryMode === 'months' ? input.replacementDetails.expiryMonths ?? null : null,
                        expiryDate: input.replacementDetails.expiryMode === 'manual' ? input.replacementDetails.expiryDate ?? null : undefined,
                        notes: input.replacementDetails.notes ?? undefined,
                    },
                ],
                discount: 0,
                tax: 0,
                grandTotal: quantity * Number(input.replacementDetails.purchaseRate ?? unitCost),
                paymentMethod: 'cash',
                notes: `Replacement stock for disposition ${referenceNumber}`,
                status: 'received',
            };

            const created = await createPurchase(storage, replacementPurchasePayload);
            dispositionRecord.replacementPurchaseInvoiceId = created.id;
        }

        return storage.save('dispositions', dispositionRecord);
    };

    if (storage.transaction) {
        return storage.transaction(transactionKeys, 'rw', saveDisposition);
    }

    return saveDisposition();
}

export async function reverseInventoryDisposition(
    storage: IStorageProvider,
    input: ReverseInventoryDispositionInput,
) {
    const original = await storage.getById<InventoryDisposition>('dispositions', input.dispositionId);
    if (!original) throw new Error('Original disposition not found.');
    if (original.status === 'reversed') throw new Error('Disposition has already been reversed.');
    if (original.resolution === 'supplier_replacement') {
        throw new Error('Reversal of supplier replacement is not supported in this version.');
    }
    if (original.resolution === 'reversal') {
        throw new Error('Cannot reverse a reversal.');
    }

    const product = await getProductById(storage, original.productId);
    if (!product) throw new Error('Product not found for reversal.');

    const batch = original.batchId ? await getBatchById(storage, original.batchId) : null;
    if (original.batchId && !batch) {
        throw new Error('Associated batch for reversal was not found.');
    }

    const dispositions = await storage.get<InventoryDisposition>('dispositions');
    if (input.idempotencyKey) {
        const existing = dispositions.find((d) => d.idempotencyKey === input.idempotencyKey);
        if (existing) return existing;
    }

    const referenceNumber = generateReferenceNumber(dispositions.length);
    const reversalRecord = buildDispositionRecord(
        {
            referenceNumber: null,
            date: new Date().toISOString(),
            performedById: input.performedById ?? null,
            performedByName: input.performedByName ?? null,
            reason: original.reason,
            resolution: 'reversal',
            productId: original.productId,
            batchId: original.batchId ?? null,
            purchaseInvoiceId: original.purchaseInvoiceId ?? null,
            supplierId: original.supplierId ?? null,
            quantity: original.quantity,
            unitCost: original.unitCost,
            settlementAmount: 0,
            settlementMethod: null,
            settlementStatus: null,
            settlementReference: null,
            settlementDate: null,
            notes: `Reversal of ${original.referenceNumber}. ${input.notes ?? ''}`.trim(),
            idempotencyKey: input.idempotencyKey ?? null,
        } as CreateInventoryDispositionInput,
        {
            productName: original.productName,
            batchNumber: original.batchNumber ?? null,
            purchaseInvoiceNumber: original.purchaseInvoiceNumber ?? null,
            supplierName: original.supplierName ?? null,
            settlementType: 'none',
            reversalOfId: original.id,
        },
        referenceNumber,
        input.performedByName ?? null,
    );

    const transactionKeysReversal = ['inventory', 'dispositions', 'inventoryLocationStocks'] as string[];
    if (batch) transactionKeysReversal.push('productBatches', 'productBatchLocations');

    const saveReversal = async () => {
        if (batch) {
            batch.quantity += original.quantity;
            await storage.save('productBatches', batch);

            // Restore batch location allocation at default location
            const batchLocations = await storage.get<any>('productBatchLocations');
            const batchLoc = batchLocations.find((bl: any) => bl.batchId === batch!.id && bl.locationId === 'loc-default' && !bl.deletedAt);
            if (batchLoc) {
                batchLoc.quantity = Number(batchLoc.quantity ?? 0) + original.quantity;
                batchLoc.updatedAt = new Date().toISOString();
                await storage.save('productBatchLocations', batchLoc);
            }
        }

        // Restore default location stock
        const locationStocks = await storage.get<any>('inventoryLocationStocks');
        const locStock = locationStocks.find((s: any) => s.productId === product.id && s.locationId === 'loc-default' && !s.deletedAt);
        if (locStock) {
            locStock.quantity = Number(locStock.quantity ?? 0) + original.quantity;
            locStock.lastMovementAt = new Date().toISOString();
            locStock.updatedAt = new Date().toISOString();
            await storage.save('inventoryLocationStocks', locStock);
        }

        product.quantity += original.quantity;
        await storage.save('inventory', product);

        const updatedOriginal = {
            ...original,
            status: 'reversed' as DispositionStatus,
            reversedById: reversalRecord.id,
            updatedAt: new Date().toISOString(),
            version: (original.version ?? 0) + 1,
        };

        await storage.save('dispositions', updatedOriginal);
        return storage.save('dispositions', reversalRecord);
    };

    if (storage.transaction) {
        return storage.transaction(transactionKeysReversal, 'rw', saveReversal);
    }

    return saveReversal();
}

export async function getInventoryDispositionById(
    storage: IStorageProvider,
    id: string,
) {
    return storage.getById<InventoryDisposition>('dispositions', id);
}

export async function getInventoryDispositions(
    storage: IStorageProvider,
) {
    return storage.get<InventoryDisposition>('dispositions');
}
