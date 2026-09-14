import { ConsumptionTransaction, ConsumptionItem, Product, ProductBatch, InventoryLocationStock, InventoryMovement, ProductUnit } from '../types';
import { getLocationStockForProduct } from '../lib/locationStock';
import { v4 as uuidv4 } from 'uuid';
import { safeCurrency, safeQty, safeMul } from '@/utils/unitUtils';

/**
 * Configuration for creating a consumption transaction
 */
export interface CreateConsumptionParams {
    locationId: string;
    items: ConsumptionItemInput[];
    reason?: string;
    notes?: string;
    date?: string; // ISO 8601, defaults to today
}

/**
 * Item input for consumption - minimal user input
 */
export interface ConsumptionItemInput {
    productId: string;
    quantity: number;
    batchId?: string;
}

/**
 * Result of creating a consumption transaction
 */
export interface ConsumptionCreationResult {
    transaction: ConsumptionTransaction;
    movements: InventoryMovement[];
    stockUpdates: Map<string, Partial<InventoryLocationStock>>; // key: locStock.id
    batchUpdates: Map<string, Partial<ProductBatch>>; // key: batch.id
    productUpdates: Map<string, Partial<Product>>; // key: product.id
}

/**
 * Service for consumption transaction operations
 */
export class ConsumptionService {
    /**
     * Generate next consumption reference number
     * Format: CONS-YYYY-NNN (e.g., CONS-2024-001)
     */
    static generateReferenceNumber(existingTransactions: ConsumptionTransaction[]): string {
        const today = new Date();
        const year = today.getFullYear();

        // Filter transactions from current year
        const thisYearTransactions = existingTransactions.filter(t =>
            t.date.startsWith(year.toString())
        );

        // Get next sequence number
        const nextNumber = thisYearTransactions.length + 1;
        return `CONS-${year}-${String(nextNumber).padStart(3, '0')}`;
    }

    /**
     * Prepare consumption transaction for creation
     * Validates products exist, have consumable flag, stock available
     * Prepares all data but does NOT persist
     */
    static prepareConsumption(
        params: CreateConsumptionParams,
        products: Product[],
        batches: ProductBatch[],
        locationStocks: InventoryLocationStock[],
        existingTransactions: ConsumptionTransaction[]
    ): ConsumptionCreationResult {
        const date = params.date || new Date().toISOString().split('T')[0];
        const referenceNumber = this.generateReferenceNumber(existingTransactions);

        const items: ConsumptionItem[] = [];
        const movements: InventoryMovement[] = [];
        const stockUpdates = new Map<string, Partial<InventoryLocationStock>>();
        const batchUpdates = new Map<string, Partial<ProductBatch>>();
        const productUpdates = new Map<string, Partial<Product>>();
        let totalCost = 0;

        for (const input of params.items) {
            // Find product
            const product = products.find(p => p.id === input.productId);
            if (!product) {
                throw new Error(`Product ${input.productId} not found`);
            }

            // Legacy products may not have the consumable flag set yet.
            // Treat undefined as consumable for backward compatibility.
            if (product.consumable === false) {
                throw new Error(`Product ${product.name} is not marked as consumable`);
            }

            // Get product's batches at this location
            const productBatches = batches.filter(b =>
                b.productId === input.productId && b.quantity > 0
            );

            // Determine which batch to consume from
            let selectedBatch: ProductBatch | undefined;
            if (input.batchId) {
                selectedBatch = productBatches.find(b => b.id === input.batchId);
                if (!selectedBatch) {
                    throw new Error(`Batch ${input.batchId} not found for product ${product.name}`);
                }
            } else if (productBatches.length > 0) {
                // Use FEFO: earliest expiry first
                productBatches.sort((a, b) => {
                    const aExpiry = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
                    const bExpiry = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
                    return aExpiry - bExpiry;
                });
                selectedBatch = productBatches[0];
            }

            // ONLY throw if batches are enabled and product has expiry tracking, or if we have batches
            if (product.hasExpiry && !selectedBatch) {
                throw new Error(`No stock available for product ${product.name} at location ${params.locationId}`);
            }

            // Check available quantity
            if (selectedBatch && selectedBatch.quantity < input.quantity) {
                throw new Error(
                    `Insufficient stock for ${product.name}. Available: ${selectedBatch.quantity} ${product.unit}, ` +
                    `Requested: ${input.quantity} ${product.unit}`
                );
            }

            // Get location stock for this product, including legacy supplierStock fallbacks.
            const locStock = locationStocks.find(
                ls => ls.productId === input.productId && ls.locationId === params.locationId
            );
            const availableQuantity = getLocationStockForProduct(product, params.locationId, locationStocks) || product.quantity;
            if (availableQuantity < input.quantity) {
                throw new Error(
                    `Insufficient stock for ${product.name}. Available: ${availableQuantity} ${product.unit}, ` +
                    `Requested: ${input.quantity} ${product.unit}`
                );
            }

            // Calculate cost from batch's purchase rate or product rate
            const unitCost = selectedBatch ? selectedBatch.purchaseRate : (product.purchaseRate ?? 0);
            const itemTotalCost = safeCurrency(safeMul(input.quantity, unitCost));
            totalCost = safeCurrency(totalCost + itemTotalCost);

            // Create consumption item
            items.push({
                productId: input.productId,
                productName: product.name,
                quantity: input.quantity,
                unit: product.unit,
                batchId: selectedBatch?.id ?? null,
                batchNumber: selectedBatch?.batchNumber ?? null,
                unitCost,
                totalCost: itemTotalCost,
            });

            // Create audit movement
            movements.push({
                id: uuidv4(),
                productId: input.productId,
                productName: product.name,
                movementType: 'consumption',
                sourceLocationId: params.locationId,
                quantity: input.quantity,
                batchId: selectedBatch?.id ?? null,
                referenceId: referenceNumber,
                notes: params.notes,
                status: 'completed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null,
                version: 1,
            });

            // Prepare stock updates
            // Update batch quantity only if batch exists
            if (selectedBatch) {
                const batchUpdateData: Partial<ProductBatch> = {
                    quantity: safeQty(Math.max(0, selectedBatch.quantity - input.quantity)),
                    updatedAt: new Date().toISOString(),
                    version: (selectedBatch.version || 0) + 1,
                };
                batchUpdates.set(selectedBatch.id, batchUpdateData);
            }

            // Update location stock only if the record exists
            // (products created before location tracking may not have location stock records)
            if (locStock) {
                const updatedLocStock: Partial<InventoryLocationStock> = {
                    quantity: safeQty(Math.max(0, locStock.quantity - input.quantity)),
                    lastMovementAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: (locStock.version || 0) + 1,
                };
                stockUpdates.set(locStock.id, updatedLocStock);
            }

            // Track product quantity reduction
            const currentProductUpdate = productUpdates.get(product.id) || {
                quantity: product.quantity,
                updatedAt: new Date().toISOString(),
                version: (product.version || 0) + 1,
            };
            const newProductQuantity = safeQty(Math.max(
                0,
                Number(currentProductUpdate.quantity || product.quantity) - input.quantity
            ));
            productUpdates.set(product.id, {
                ...currentProductUpdate,
                quantity: newProductQuantity,
                updatedAt: new Date().toISOString(),
                version: (product.version || 0) + 1,
            });
        }

        // Create transaction
        const transaction: ConsumptionTransaction = {
            id: uuidv4(),
            referenceNumber,
            date,
            locationId: params.locationId,
            items,
            totalCost,
            reason: params.reason,
            notes: params.notes,
            status: 'completed',
            reversalOfId: null,
            reversedById: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
            version: 1,
        };

        return {
            transaction,
            movements,
            stockUpdates,
            batchUpdates,
            productUpdates,
        };
    }

    /**
     * Validate that a product can be consumed from a location
     */
    static validateConsumption(
        productId: string,
        quantity: number,
        locationId: string,
        products: Product[],
        batches: ProductBatch[],
        locationStocks: InventoryLocationStock[]
    ): { valid: boolean; error?: string } {
        // Find product
        const product = products.find(p => p.id === productId);
        if (!product) {
            return { valid: false, error: `Product not found` };
        }

        // Legacy products may not have the consumable flag set yet.
        // Treat undefined as consumable for backward compatibility.
        if (product.consumable === false) {
            return { valid: false, error: `${product.name} is not marked as consumable` };
        }

        const available = getLocationStockForProduct(product, locationId, locationStocks) || product.quantity;
        if (available < quantity) {
            return {
                valid: false,
                error: `Insufficient stock. Available: ${available} ${product.unit}, Needed: ${quantity} ${product.unit}`
            };
        }

        return { valid: true };
    }

    static prepareReversal(
        transaction: ConsumptionTransaction,
        products: Product[],
        batches: ProductBatch[],
        locationStocks: InventoryLocationStock[]
    ): {
        productUpdates: Map<string, Partial<Product>>;
        batchUpdates: Map<string, Partial<ProductBatch>>;
        stockUpdates: Map<string, Partial<InventoryLocationStock>>;
        reversalMovements: InventoryMovement[];
    } {
        if (!transaction) {
            throw new Error('Consumption transaction not found.');
        }

        if (transaction.deletedAt) {
            throw new Error('Consumption transaction no longer exists.');
        }

        if (transaction.status === 'reversed') {
            throw new Error('This consumption has already been reversed.');
        }

        if (transaction.status !== 'completed') {
            throw new Error('Only completed consumptions can be reversed.');
        }

        const productUpdates = new Map<string, Partial<Product>>();
        const batchUpdates = new Map<string, Partial<ProductBatch>>();
        const stockUpdates = new Map<string, Partial<InventoryLocationStock>>();
        const reversalMovements: InventoryMovement[] = [];

        for (const item of transaction.items) {
            const product = products.find(p => p.id === item.productId && !p.deletedAt);
            if (!product) {
                throw new Error(`Product ${item.productName} could not be found for reversal.`);
            }

            const currentQty = Number(product.quantity ?? 0);
            productUpdates.set(product.id, {
                quantity: currentQty + Number(item.quantity ?? 0),
                updatedAt: new Date().toISOString(),
                version: (product.version || 0) + 1,
            });

            if (item.batchId) {
                const batch = batches.find(
                    b => b.id === item.batchId && b.productId === product.id && !b.deletedAt
                );

                if (!batch) {
                    throw new Error(`Batch ${item.batchNumber || item.batchId} for ${product.name} no longer exists.`);
                }

                const restoredBatchQty = Number(batch.quantity ?? 0) + Number(item.quantity ?? 0);
                batchUpdates.set(batch.id, {
                    quantity: restoredBatchQty,
                    updatedAt: new Date().toISOString(),
                    version: (batch.version || 0) + 1,
                });
            }

            const stockRecord = locationStocks.find(
                ls => ls.productId === product.id && ls.locationId === transaction.locationId && !ls.deletedAt
            );

            if (stockRecord) {
                const restoredStockQty = Number(stockRecord.quantity ?? 0) + Number(item.quantity ?? 0);
                stockUpdates.set(stockRecord.id, {
                    quantity: restoredStockQty,
                    lastMovementAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    version: (stockRecord.version || 0) + 1,
                });
            }

            reversalMovements.push({
                id: uuidv4(),
                productId: product.id,
                productName: product.name,
                movementType: 'adjustment',
                sourceLocationId: transaction.locationId,
                quantity: Number(item.quantity ?? 0),
                batchId: item.batchId ?? null,
                referenceId: transaction.id,
                notes: `Reversal of consumption ${transaction.referenceNumber}`,
                status: 'completed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null,
                version: 1,
            });
        }

        return { productUpdates, batchUpdates, stockUpdates, reversalMovements };
    }
}
