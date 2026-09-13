import { v4 as uuidv4 } from 'uuid';
import {
    InventoryLocationStock,
    Product,
    ProductBatch,
    PurchaseInvoice,
    PurchaseItem,
    PurchaseStatus,
} from '@/types';
import { IStorageProvider } from '@/storage/IStorageProvider';
import { FinancialPostingService } from './financialPostingService';

/**
 * Purchase inventory transitions live here instead of in the form component.
 * This keeps receiving, editing, cancelling, and deleting a purchase on the
 * same path and prevents UI actions from applying stock twice.
 */

export type PurchaseInput = Omit<
    PurchaseInvoice,
    'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'
> & { id?: string };

const received = (purchase?: PurchaseInvoice | null) =>
    (purchase?.status ?? 'received') === 'received';

const active = (purchase: PurchaseInvoice) => !purchase.deletedAt;

function now() {
    return new Date().toISOString();
}

function normalizeItem(item: PurchaseItem): PurchaseItem {
    const quantity = Number(item.quantity);
    const purchaseRate = Number(item.purchaseRate);
    return {
        ...item,
        quantity,
        purchaseRate,
        subtotal: quantity * purchaseRate,
        packQuantity: item.packQuantity != null ? Number(item.packQuantity) : null,
        packCost: item.packCost != null ? Number(item.packCost) : null,
        packUnit: item.packUnit ?? null,
        packSize: item.packSize != null ? Number(item.packSize) : null,
    };
}

function getSupplierIds(product: Product) {
    return Array.from(new Set(
        (product.supplierIds?.length
            ? product.supplierIds
            : product.supplierId
                ? [product.supplierId]
                : []).filter(Boolean)
    ));
}

function normalizeSupplierLocationId(locationId?: string | null) {
    const candidate = (locationId ?? 'loc-default')?.trim();
    return candidate || 'loc-default';
}

function getSupplierStockKey(supplierId: string, locationId?: string | null) {
    return `${supplierId}::${normalizeSupplierLocationId(locationId)}`;
}

function ensureSupplierRecords(product: Product, supplierId: string, locationId?: string | null, legacyPrimaryStock = product.quantity) {
    const ids = getSupplierIds(product);
    const supplierIds = ids.includes(supplierId) ? ids : [...ids, supplierId];
    const normalizedLocationId = normalizeSupplierLocationId(locationId);
    const existing = product.supplierStocks ?? [];
    const records = [...existing].map((record) => ({
        ...record,
        locationId: record.locationId || 'loc-default',
    }));

    // Older products predate per-supplier stock. Preserve their current stock
    // against their primary supplier before adding a second supplier.
    if (records.length === 0 && ids[0]) {
        records.push({
            supplierId: ids[0],
            locationId: normalizedLocationId,
            cost: product.purchaseRate,
            stock: legacyPrimaryStock,
        });
    }

    for (const id of supplierIds) {
        const key = getSupplierStockKey(id, normalizedLocationId);
        const hasRecord = records.some(record => record.supplierId === id && (record.locationId || 'loc-default') === normalizedLocationId);
        if (!hasRecord) {
            records.push({ supplierId: id, locationId: normalizedLocationId, cost: product.purchaseRate, stock: 0 });
        }
    }

    return { supplierIds, records };
}

function getBatchForPurchase(
    batches: ProductBatch[],
    purchase: PurchaseInvoice,
    item: PurchaseItem,
    itemIndex: number,
) {
    if (item.batchId) return batches.find(batch => batch.id === item.batchId);
    const matching = batches.filter(batch =>
        batch.purchaseInvoiceId === purchase.id &&
        batch.productId === item.productId
    );
    return matching[itemIndex] ?? matching[0];
}

function updateVariantQuantity(product: Product, variantName: string | null | undefined, delta: number) {
    if (!product.hasVariants || !variantName?.trim()) return;

    const normalizedName = variantName.trim();
    const variants = Array.isArray(product.variants) ? [...product.variants] : [];
    const existing = variants.find(candidate => candidate.name === normalizedName);

    if (existing) {
        existing.quantity = Math.max(0, Number(existing.quantity || 0) + delta);
        product.variants = variants;
        return;
    }

    if (delta > 0) {
        variants.push({ name: normalizedName, quantity: delta });
        product.variants = variants;
    }
}

function revertPurchase(
    inventory: Product[],
    batches: ProductBatch[],
    locationStocks: InventoryLocationStock[],
    batchLocations: any[],
    purchase: PurchaseInvoice,
) {
    const targetLocationId = purchase.locationId || 'loc-default';
    purchase.items.forEach((rawItem, index) => {
        const item = normalizeItem(rawItem);
        const product = inventory.find(candidate => candidate.id === item.productId && !candidate.deletedAt);
        if (!product) return;

        if (product.quantity < item.quantity) {
            throw new Error(`Cannot reverse ${purchase.invoiceNumber || 'this purchase'}: ${product.name} has already used some received stock.`);
        }

        product.quantity -= item.quantity;
        updateVariantQuantity(product, item.variantName, -item.quantity);
        const supplierState = ensureSupplierRecords(product, purchase.supplierId, targetLocationId);
        const supplierRecord = supplierState.records.find(record => record.supplierId === purchase.supplierId && (record.locationId || 'loc-default') === targetLocationId);
        if (supplierRecord) {
            if (supplierRecord.stock < item.quantity) {
                throw new Error(`Cannot reverse ${purchase.invoiceNumber || 'this purchase'}: supplier stock for ${product.name} is lower than the received quantity.`);
            }
            supplierRecord.stock -= item.quantity;
            supplierRecord.baseQuantity = Math.max(0, (supplierRecord.baseQuantity ?? (supplierRecord.stock + item.quantity)) - item.quantity);
            supplierRecord.totalPurchaseCost = Math.max(0, (supplierRecord.totalPurchaseCost ?? 0) - item.subtotal);
            if (product.packSize && product.packSize > 0) {
                supplierRecord.packQuantity = Math.round((supplierRecord.stock / product.packSize) * 1000) / 1000;
            }
        }
        product.supplierIds = supplierState.supplierIds;
        product.supplierId = supplierState.supplierIds[0] ?? '';
        product.supplierStocks = supplierState.records;

        // Revert location stock
        const stockRecord = locationStocks.find(ls => ls.productId === product.id && ls.locationId === targetLocationId);
        if (stockRecord) {
            stockRecord.quantity = Math.max(0, (stockRecord.quantity ?? 0) - item.quantity);
            stockRecord.lastMovementAt = now();
        }

        const batch = getBatchForPurchase(batches, purchase, item, index);
        if (batch) {
            if (batch.quantity !== batch.initialQuantity) {
                throw new Error(`Cannot change ${purchase.invoiceNumber || 'this purchase'}: batch ${batch.batchNumber} has already been partially sold or adjusted.`);
            }
            const batchIndex = batches.findIndex(candidate => candidate.id === batch.id);
            if (batchIndex >= 0) batches.splice(batchIndex, 1);

            // Revert batch location allocation
            const batchLocIndex = batchLocations.findIndex(bl => bl.batchId === batch.id && bl.locationId === targetLocationId);
            if (batchLocIndex >= 0) batchLocations.splice(batchLocIndex, 1);
        }
    });
}

function applyPurchase(
    inventory: Product[],
    batches: ProductBatch[],
    locationStocks: InventoryLocationStock[],
    batchLocations: any[],
    purchase: PurchaseInvoice,
): PurchaseInvoice {
    const items = purchase.items.map(normalizeItem);
    const targetLocationId = purchase.locationId || 'loc-default';

    items.forEach((item, index) => {
        if (item.quantity <= 0) throw new Error(`${item.productName} must have a quantity greater than zero.`);
        if (item.purchaseRate < 0) throw new Error(`${item.productName} cannot have a negative purchase cost.`);

        const product = inventory.find(candidate => candidate.id === item.productId && !candidate.deletedAt);
        if (!product) throw new Error(`Product "${item.productName}" no longer exists.`);

        const previousQuantity = product.quantity;
        const supplierState = ensureSupplierRecords(product, purchase.supplierId, targetLocationId, previousQuantity);
        product.quantity += item.quantity;
        updateVariantQuantity(product, item.variantName, item.quantity);
        const supplierRecord = supplierState.records.find(record => record.supplierId === purchase.supplierId && (record.locationId || 'loc-default') === targetLocationId);
        if (!supplierRecord) throw new Error(`Supplier stock could not be initialized for ${product.name}.`);
        supplierRecord.stock += item.quantity;
        supplierRecord.cost = item.purchaseRate;
        supplierRecord.lastPurchaseDate = purchase.date;
        supplierRecord.baseQuantity = (supplierRecord.baseQuantity ?? (supplierRecord.stock - item.quantity)) + item.quantity;
        supplierRecord.totalPurchaseCost = (supplierRecord.totalPurchaseCost ?? 0) + item.subtotal;
        if (product.packSize && product.packSize > 0) {
            supplierRecord.appliedPackSize = product.packSize;
            supplierRecord.packQuantity = Math.round((supplierRecord.stock / product.packSize) * 1000) / 1000;
            if (item.packCost != null && item.packCost > 0) {
                supplierRecord.packCost = item.packCost;
            }
        }

        product.supplierIds = supplierState.supplierIds;
        product.supplierId = supplierState.supplierIds[0] ?? '';
        product.supplierStocks = supplierState.records;

        // Update InventoryLocationStock
        let stockRecord = locationStocks.find(ls => ls.productId === product.id && ls.locationId === targetLocationId);
        if (stockRecord) {
            stockRecord.quantity = (stockRecord.quantity ?? 0) + item.quantity;
            stockRecord.lastMovementAt = now();
        } else {
            locationStocks.push({
                id: uuidv4(),
                productId: product.id,
                locationId: targetLocationId,
                quantity: item.quantity,
                lastMovementAt: now(),
                createdAt: now(),
                updatedAt: now(),
                deletedAt: null,
                version: 1,
            });
        }

        if (product.hasExpiry) {
            let activeBatch: ProductBatch;
            // If the incoming item references an existing batch, merge quantities into it
            if (item.batchId) {
                const existing = batches.find(b => b.id === item.batchId && b.productId === product.id);
                if (existing) {
                    existing.initialQuantity = (existing.initialQuantity || 0) + item.quantity;
                    existing.quantity = (existing.quantity || 0) + item.quantity;
                    existing.purchaseRate = item.purchaseRate;
                    existing.updatedAt = now();
                    existing.notes = item.notes ?? existing.notes;
                    items[index] = { ...item, batchId: existing.id, batchNumber: existing.batchNumber };
                    activeBatch = existing;
                } else {
                    // referenced batch not found — fall back to creating a new batch
                    const batch: ProductBatch = {
                        id: uuidv4(),
                        productId: product.id,
                        supplierId: purchase.supplierId,
                        purchaseInvoiceId: purchase.id,
                        batchNumber: item.batchNumber?.trim() || `B-${new Date(purchase.date).getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`,
                        manufacturingDate: item.manufacturingDate ?? null,
                        expiryMonths: item.expiryMonths ?? null,
                        expiryDate: item.expiryDate ?? null,
                        initialQuantity: item.quantity,
                        quantity: item.quantity,
                        purchaseRate: item.purchaseRate,
                        notes: item.notes ?? '',
                        createdAt: now(),
                        updatedAt: now(),
                        deletedAt: null,
                        version: 1,
                    };
                    batches.push(batch);
                    items[index] = { ...item, batchId: batch.id, batchNumber: batch.batchNumber };
                    activeBatch = batch;
                }
            } else {
                const batch: ProductBatch = {
                    id: uuidv4(),
                    productId: product.id,
                    supplierId: purchase.supplierId,
                    purchaseInvoiceId: purchase.id,
                    batchNumber: item.batchNumber?.trim() || `B-${new Date(purchase.date).getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`,
                    manufacturingDate: item.manufacturingDate ?? null,
                    expiryMonths: item.expiryMonths ?? null,
                    expiryDate: item.expiryDate ?? null,
                    initialQuantity: item.quantity,
                    quantity: item.quantity,
                    purchaseRate: item.purchaseRate,
                    notes: item.notes ?? '',
                    createdAt: now(),
                    updatedAt: now(),
                    deletedAt: null,
                    version: 1,
                };
                batches.push(batch);
                items[index] = { ...item, batchId: batch.id, batchNumber: batch.batchNumber };
                activeBatch = batch;
            }

            // Update ProductBatchLocation allocation
            let batchLocRecord = batchLocations.find(bl => bl.batchId === activeBatch.id && bl.locationId === targetLocationId);
            if (batchLocRecord) {
                batchLocRecord.quantity = (batchLocRecord.quantity ?? 0) + item.quantity;
                batchLocRecord.updatedAt = now();
            } else {
                batchLocations.push({
                    id: `pbl-${activeBatch.id}-${targetLocationId}`,
                    batchId: activeBatch.id,
                    locationId: targetLocationId,
                    quantity: item.quantity,
                    dateReceived: purchase.date,
                    createdAt: now(),
                    updatedAt: now(),
                    deletedAt: null,
                    version: 1,
                });
            }
        }
    });

    return { ...purchase, items };
}

function syncTotals(inventory: Product[]) {
    for (const product of inventory) {
        if (product.deletedAt) continue;
        const records = product.supplierStocks ?? [];
        const ids = getSupplierIds(product);
        if (ids.length > 1 || records.length > 1) {
            product.quantity = records.reduce((total, record) => total + Math.max(0, Number(record.stock) || 0), 0);
        }
        product.profitPerUnit = product.sellingRate - product.purchaseRate;
    }
}

function syncLatestCosts(inventory: Product[], purchases: PurchaseInvoice[]) {
    const latest = new Map<string, { date: string; rate: number }>();
    const supplierLatest = new Map<string, { date: string; rate: number }>();

    for (const purchase of purchases.filter(active).filter(received)) {
        for (const item of purchase.items) {
            const key = item.productId;
            const current = latest.get(key);
            if (!current || purchase.date >= current.date) latest.set(key, { date: purchase.date, rate: item.purchaseRate });

            const supplierKey = `${purchase.supplierId}:${item.productId}`;
            const supplierCurrent = supplierLatest.get(supplierKey);
            if (!supplierCurrent || purchase.date >= supplierCurrent.date) {
                supplierLatest.set(supplierKey, { date: purchase.date, rate: item.purchaseRate });
            }
        }
    }

    for (const product of inventory) {
        if (product.deletedAt) continue;
        const latestProduct = latest.get(product.id);
        if (latestProduct) product.purchaseRate = latestProduct.rate;
        for (const record of product.supplierStocks ?? []) {
            const latestSupplier = supplierLatest.get(`${record.supplierId}:${product.id}`);
            if (latestSupplier) record.cost = latestSupplier.rate;
            product.profitPerUnit = product.sellingRate - product.purchaseRate;
        }
    }
}

function getEffectivePaidAmount(purchase: Pick<PurchaseInvoice, 'paymentStatus' | 'paymentMethod' | 'paidAmount' | 'grandTotal'>) {
    if (purchase.paymentMethod === 'credit') return 0;

    const paymentStatus = purchase.paymentStatus ?? 'unpaid';
    const grandTotal = Math.max(0, Number(purchase.grandTotal) || 0);

    if (paymentStatus === 'paid') return grandTotal;
    if (paymentStatus === 'partial') {
        return Math.min(Math.max(0, Number(purchase.paidAmount) || 0), grandTotal);
    }
    return 0;
}

async function reconcileAutoExpenses(
    storage: IStorageProvider,
    previous: PurchaseInvoice | null,
    candidate: PurchaseInvoice,
) {
    try {
        const purchaseId = candidate.id ?? previous?.id;
        const expenses = await storage.get<any>('expenses');
        const ts = now();

        const isAutoExpenseFor = (e: any, id?: string) => e && e.sourcePurchaseId === id && e.notes === 'Auto-generated from purchase payment';

        if (candidate.deletedAt || candidate.status === 'cancelled') {
            const remaining = expenses.filter((e: any) => !isAutoExpenseFor(e, purchaseId));
            if (remaining.length !== expenses.length) {
                await storage.set('expenses', remaining);
            }
            return;
        }

        const previousPaid = previous ? getEffectivePaidAmount(previous) : 0;
        const candidatePaid = getEffectivePaidAmount(candidate);
        const prevMethod = (previous?.paymentMethod ?? 'cash');
        const candMethod = (candidate.paymentMethod ?? 'cash');

        if (previous && prevMethod !== 'credit' && candMethod === 'credit') {
            const remaining = expenses.filter((e: any) => !isAutoExpenseFor(e, purchaseId));
            if (remaining.length !== expenses.length) {
                await storage.set('expenses', remaining);
            }
            return;
        }

        const effectivePreviousPaid = prevMethod === 'credit' ? 0 : previousPaid;

        if (candidatePaid < previousPaid) {
            let remainingDelta = previousPaid - candidatePaid;
            const autoExpenses = expenses
                .filter((e: any) => isAutoExpenseFor(e, purchaseId))
                .sort((a: any, b: any) => (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || ''));

            for (const exp of autoExpenses) {
                if (remainingDelta <= 0) break;
                if (exp.amount <= remainingDelta + 0.000001) {
                    remainingDelta -= exp.amount;
                    const idx = expenses.findIndex((x: any) => x.id === exp.id);
                    if (idx >= 0) expenses.splice(idx, 1);
                } else {
                    exp.amount = Number((exp.amount - remainingDelta).toFixed(2));
                    exp.updatedAt = ts;
                    remainingDelta = 0;
                }
            }

            if (remainingDelta > 0.000001) {
                console.warn(`Unreconciled negative payment delta for purchase ${purchaseId}: ${remainingDelta}`);
            }

            await storage.set('expenses', expenses);
            return;
        }

        if (candidatePaid > effectivePreviousPaid && candMethod !== 'credit') {
            const paidDelta = candidatePaid - effectivePreviousPaid;
            const expense = {
                id: uuidv4(),
                date: candidate.date ?? ts,
                category: 'purchase',
                description: `Payment for purchase ${candidate.invoiceNumber ?? candidate.id}` + (candidate.supplierName ? ` — ${candidate.supplierName}` : ''),
                amount: paidDelta,
                paymentMethod: candidate.paymentMethod ?? 'cash',
                notes: 'Auto-generated from purchase payment',
                sourcePurchaseId: purchaseId,
                createdAt: ts,
                updatedAt: ts,
                deletedAt: null,
                version: 1,
            };
            expenses.push(expense);
            await storage.set('expenses', expenses);
            return;
        }
    } catch (err) {
        console.error('Failed to reconcile expenses for purchase payment:', err);
    }
}

function makePurchase(input: PurchaseInput, existing?: PurchaseInvoice): PurchaseInvoice {
    const timestamp = now();
    const items = input.items.map(normalizeItem);
    const grandTotal = Math.max(0, Number(input.grandTotal) || 0);
    const normalizedPaidAmount = getEffectivePaidAmount({
        paymentStatus: input.paymentStatus ?? 'unpaid',
        paymentMethod: input.paymentMethod ?? 'cash',
        paidAmount: Number(input.paidAmount) || 0,
        grandTotal,
    });

    return {
        ...input,
        id: existing?.id ?? input.id ?? uuidv4(),
        items,
        status: input.status ?? 'received',
        paymentStatus: input.paymentStatus ?? 'unpaid',
        paidAmount: normalizedPaidAmount,
        discount: Number(input.discount) || 0,
        tax: Number(input.tax) || 0,
        grandTotal,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        version: (existing?.version ?? 0) + 1,
    };
}

async function persistTransition(
    storage: IStorageProvider,
    previous: PurchaseInvoice | null,
    candidate: PurchaseInvoice,
    allPurchases: PurchaseInvoice[],
) {
    const inventory = await storage.get<Product>('inventory');
    const batches = await storage.get<ProductBatch>('productBatches');
    const locationStocks = await storage.get<InventoryLocationStock>('inventoryLocationStocks');
    const batchLocations = await storage.get<any>('productBatchLocations');

    // Determine whether this transition actually changes inventory/batches.
    // Only revert/apply stock when items, supplier, or receipt status changed.
    const prevReceived = previous && active(previous) && received(previous);
    const candReceived = active(candidate) && received(candidate);

    const itemsKey = (items: PurchaseItem[] | undefined) => JSON.stringify(
        (items ?? []).map(i => ({
            productId: i.productId,
            quantity: Number(i.quantity || 0),
            purchaseRate: Number(i.purchaseRate || 0),
            batchId: i.batchId ?? null,
            variantName: i.variantName ?? null,
        })).sort((a, b) => {
            const p = String(a.productId).localeCompare(String(b.productId));
            if (p !== 0) return p;
            const v = String(a.variantName || '').localeCompare(String(b.variantName || ''));
            if (v !== 0) return v;
            const ba = String(a.batchId ?? '');
            const bb = String(b.batchId ?? '');
            const bcmp = ba.localeCompare(bb);
            if (bcmp !== 0) return bcmp;
            if (a.quantity !== b.quantity) return a.quantity - b.quantity;
            if (a.purchaseRate !== b.purchaseRate) return a.purchaseRate - b.purchaseRate;
            return 0;
        })
    );

    let inventoryChanged = false;
    if (prevReceived !== candReceived) {
        inventoryChanged = true;
    } else if (prevReceived && candReceived && previous) {
        const prevItemsKey = itemsKey(previous.items);
        const candItemsKey = itemsKey(candidate.items);
        if (prevItemsKey !== candItemsKey) inventoryChanged = true;
        if ((previous.supplierId ?? '') !== (candidate.supplierId ?? '')) inventoryChanged = true;
        if ((previous.locationId ?? '') !== (candidate.locationId ?? '')) inventoryChanged = true;
    }

    let saved = candidate;
    if (inventoryChanged) {
        if (prevReceived && previous) {
            revertPurchase(inventory, batches, locationStocks, batchLocations, previous);
        }

        if (candReceived) {
            saved = applyPurchase(inventory, batches, locationStocks, batchLocations, candidate);
        }
    }

    const nextPurchases = allPurchases.filter(purchase => purchase.id !== candidate.id);
    nextPurchases.push(saved);
    syncTotals(inventory);
    syncLatestCosts(inventory, nextPurchases);

    await storage.set('inventory', inventory);
    await storage.set('productBatches', batches);
    await storage.set('inventoryLocationStocks', locationStocks);
    await storage.set('productBatchLocations', batchLocations);

    await storage.set('purchases', nextPurchases);
    const priorPostings = (await storage.get<any>('financialTransactions'))
        .filter((transaction: any) => transaction.sourceType === 'purchase' && transaction.sourceId === candidate.id && transaction.status === 'posted');
    for (const posting of priorPostings) {
        await FinancialPostingService.reverse(storage, posting.id, candidate.id, `purchase:${candidate.id}:reversal:${candidate.version}`);
    }
    await FinancialPostingService.postPurchase(storage, saved);
    return saved;
}

export async function createPurchase(storage: IStorageProvider, input: PurchaseInput) {
    const purchases = await storage.get<PurchaseInvoice>('purchases');
    const candidate = makePurchase(input);
    const commit = async () => {
        const latestPurchases = await storage.get<PurchaseInvoice>('purchases');
        const invoiceNumber = candidate.invoiceNumber.trim();
        if (invoiceNumber) {
            const existing = latestPurchases.find(purchase =>
                active(purchase) &&
                purchase.supplierId === candidate.supplierId &&
                purchase.invoiceNumber.trim() === invoiceNumber
            );
            if (existing) return existing;
        }
        return persistTransition(storage, null, candidate, latestPurchases);
    };
    return storage.transaction
        ? storage.transaction(['purchases', 'inventory', 'productBatches', 'inventoryLocationStocks', 'productBatchLocations', 'financialAccounts', 'financialTransactions', 'financialMovements', 'locations', 'settings'], 'rw', commit)
        : commit();
}

export async function patchPurchase(storage: IStorageProvider, id: string, updates: Partial<PurchaseInvoice>) {
    const purchases = await storage.get<PurchaseInvoice>('purchases');
    const previous = purchases.find(purchase => purchase.id === id && active(purchase));
    if (!previous) throw new Error('Purchase not found.');
    const candidate = makePurchase({ ...previous, ...updates, id } as PurchaseInput, previous);
    const commit = () => persistTransition(storage, previous, candidate, purchases);
    return storage.transaction
        ? storage.transaction(['purchases', 'inventory', 'productBatches', 'inventoryLocationStocks', 'productBatchLocations', 'financialAccounts', 'financialTransactions', 'financialMovements', 'locations', 'settings'], 'rw', commit)
        : commit();
}

export async function patchPurchaseFinancial(storage: IStorageProvider, id: string, updates: Partial<PurchaseInvoice>) {
    const purchases = await storage.get<PurchaseInvoice>('purchases');
    const previous = purchases.find(purchase => purchase.id === id && active(purchase));
    if (!previous) throw new Error('Purchase not found.');

    // Only update payment/financial-related fields. Keep inventory/items untouched.
    const paymentFields: Partial<PurchaseInvoice> = {
        paidAmount: updates.paidAmount ?? previous.paidAmount,
        paymentStatus: updates.paymentStatus ?? previous.paymentStatus,
        paymentMethod: updates.paymentMethod ?? previous.paymentMethod,
        payments: updates.payments ?? previous.payments,
        date: updates.date ?? previous.date,
    };

    const candidate = makePurchase({ ...previous, ...paymentFields, id } as PurchaseInput, previous);

    const nextPurchases = purchases.filter(purchase => purchase.id !== candidate.id);
    nextPurchases.push(candidate);

    const commit = async () => {
        await storage.set('purchases', nextPurchases);
        const priorPostings = (await storage.get<any>('financialTransactions'))
            .filter((transaction: any) => transaction.sourceType === 'purchase' && transaction.sourceId === candidate.id && transaction.status === 'posted');
        for (const posting of priorPostings) {
            await FinancialPostingService.reverse(storage, posting.id, candidate.id, `purchase:${candidate.id}:reversal:${candidate.version}`);
        }
        await FinancialPostingService.postPurchase(storage, candidate);
        return candidate;
    };
    return storage.transaction
        ? storage.transaction(['purchases', 'financialAccounts', 'financialTransactions', 'financialMovements', 'settings'], 'rw', commit)
        : commit();
}

export async function updatePurchase(storage: IStorageProvider, id: string, input: PurchaseInput) {
    const purchases = await storage.get<PurchaseInvoice>('purchases');
    const previous = purchases.find(purchase => purchase.id === id && active(purchase));
    if (!previous) throw new Error('Purchase not found.');
    const candidate = makePurchase({ ...input, id }, previous);
    const commit = () => persistTransition(storage, previous, candidate, purchases);
    return storage.transaction
        ? storage.transaction(['purchases', 'inventory', 'productBatches', 'inventoryLocationStocks', 'productBatchLocations', 'financialAccounts', 'financialTransactions', 'financialMovements', 'locations', 'settings'], 'rw', commit)
        : commit();
}

export async function deletePurchase(storage: IStorageProvider, id: string) {
    const purchases = await storage.get<PurchaseInvoice>('purchases');
    const previous = purchases.find(purchase => purchase.id === id && active(purchase));
    if (!previous) throw new Error('Purchase not found.');
    const candidate = {
        ...previous,
        status: 'cancelled' as PurchaseStatus,
        deletedAt: now(),
        updatedAt: now(),
        version: previous.version + 1,
    };
    const commit = () => persistTransition(storage, previous, candidate, purchases);
    return storage.transaction
        ? storage.transaction(['purchases', 'inventory', 'productBatches', 'inventoryLocationStocks', 'productBatchLocations', 'financialAccounts', 'financialTransactions', 'financialMovements', 'locations', 'settings'], 'rw', commit)
        : commit();
}
