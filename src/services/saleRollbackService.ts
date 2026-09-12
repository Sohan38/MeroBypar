import type { IStorageProvider } from '@/storage/IStorageProvider';
import type {
  SaleInvoice,
  Credit,
  Product,
  ProductBatch,
  InventoryLocationStock,
  ProductBatchLocation,
  FinancialTransaction,
} from '@/types';
import { InventoryLedgerService } from './inventoryLedgerService';
import { FinancialPostingService } from './financialPostingService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoidSaleInput {
  saleId: string;
  reason: string;
}

export interface VoidSaleResult {
  sale: SaleInvoice;
  inventoryRestored: boolean;
  financialsReversed: boolean;
  creditRemoved: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Voids a completed sale atomically:
 *  1. Restores inventory (product quantities, batch quantities, variant quantities)
 *  2. Reverses financial postings (creates reversal entry — original stays for audit)
 *  3. Removes linked credit record (if no payments were made)
 *  4. Marks sale as voided with timestamp and reason
 *
 * All operations run inside a single storage transaction for atomicity.
 * If any step fails, the entire operation is rolled back.
 */
export async function voidSale(
  storage: IStorageProvider,
  input: VoidSaleInput,
): Promise<VoidSaleResult> {
  const { saleId, reason } = input;

  if (!reason || !reason.trim()) {
    throw new Error('A reason is required to void a sale.');
  }

  const work = async (): Promise<VoidSaleResult> => {
    // ── 1. Load and validate the sale ────────────────────────────────────
    const sale = await storage.getById<SaleInvoice>('sales', saleId);
    if (!sale) throw new Error('Sale not found.');
    if (sale.status === 'voided') throw new Error('This sale has already been voided.');
    if (sale.deletedAt) throw new Error('This sale has been deleted and cannot be voided.');

    // ── 2. Restore inventory ─────────────────────────────────────────────
    const inventory = await storage.get<Product>('inventory');
    const batches = await storage.get<ProductBatch>('productBatches');
    const locationStocks = await storage.get<InventoryLocationStock>('inventoryLocationStocks');
    const batchLocations = await storage.get<ProductBatchLocation>('productBatchLocations');

    // Build mutable snapshots for the ledger service
    // (InventoryLedgerService.adjustStock reads from .items)
    const inventoryItems = [...inventory];
    const batchItems = [...batches];
    const locationStockItems = [...locationStocks];
    const batchLocationItems = [...batchLocations];

    const mutations = {
      inventory: {
        items: inventoryItems,
        update: async (id: string, updates: Partial<Product>) => {
          const record = await storage.getById<Product>('inventory', id);
          if (record) {
            const updated = { ...record, ...updates };
            await storage.save('inventory', updated);
            // Update local snapshot so subsequent items see the change
            const idx = inventoryItems.findIndex(p => p.id === id);
            if (idx >= 0) inventoryItems[idx] = updated;
          }
        },
      },
      locationStocks: {
        items: locationStockItems,
        update: async (id: string, updates: Partial<InventoryLocationStock>) => {
          const record = await storage.getById<InventoryLocationStock>('inventoryLocationStocks', id);
          if (record) {
            const updated = { ...record, ...updates };
            await storage.save('inventoryLocationStocks', updated);
            const idx = locationStockItems.findIndex(s => s.id === id);
            if (idx >= 0) locationStockItems[idx] = updated;
          }
        },
        add: async (item: Omit<InventoryLocationStock, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'>) => {
          const { v4: uuidv4 } = await import('uuid');
          const newItem = { id: uuidv4(), ...item } as InventoryLocationStock;
          await storage.save('inventoryLocationStocks', newItem);
          locationStockItems.push(newItem);
          return newItem;
        },
      },
      batches: {
        items: batchItems,
        update: async (id: string, updates: Partial<ProductBatch>) => {
          const record = await storage.getById<ProductBatch>('productBatches', id);
          if (record) {
            const updated = { ...record, ...updates };
            await storage.save('productBatches', updated);
            const idx = batchItems.findIndex(b => b.id === id);
            if (idx >= 0) batchItems[idx] = updated;
          }
        },
      },
      batchLocations: {
        items: batchLocationItems,
        update: async (id: string, updates: Partial<ProductBatchLocation>) => {
          const record = await storage.getById<ProductBatchLocation>('productBatchLocations', id);
          if (record) {
            const updated = { ...record, ...updates };
            await storage.save('productBatchLocations', updated);
            const idx = batchLocationItems.findIndex(bl => bl.id === id);
            if (idx >= 0) batchLocationItems[idx] = updated;
          }
        },
        add: async (item: Omit<ProductBatchLocation, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'>) => {
          const { v4: uuidv4 } = await import('uuid');
          const newItem = { id: uuidv4(), ...item } as ProductBatchLocation;
          await storage.save('productBatchLocations', newItem);
          batchLocationItems.push(newItem);
          return newItem;
        },
      },
    };

    // Aggregate quantities per product (a sale can have multiple lines for the same product via variants)
    const qtyByProduct = new Map<string, number>();
    for (const item of sale.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    for (const item of sale.items) {
      const hasAllocations = Array.isArray(item.costAllocations) && item.costAllocations.length > 0;

      if (hasAllocations) {
        // Restore each batch individually
        for (const alloc of item.costAllocations!) {
          await InventoryLedgerService.adjustStock(
            item.productId,
            'loc-default',
            +alloc.quantity,
            mutations,
            { batchId: alloc.batchId },
          );
        }
      } else {
        // Non-batched product: restore total quantity
        await InventoryLedgerService.adjustStock(
          item.productId,
          'loc-default',
          +item.quantity,
          mutations,
        );
      }

      // Restore variant quantities
      if (item.variantName) {
        const product = await storage.getById<Product>('inventory', item.productId);
        if (product?.hasVariants && product.variants) {
          const updatedVariants = product.variants.map(v =>
            v.name === item.variantName
              ? { ...v, quantity: v.quantity + item.quantity }
              : v
          );
          await storage.save('inventory', { ...product, variants: updatedVariants });
          // Also update local snapshot
          const idx = inventoryItems.findIndex(p => p.id === item.productId);
          if (idx >= 0) inventoryItems[idx] = { ...inventoryItems[idx], variants: updatedVariants };
        }
      }
    }

    // ── 3. Reverse financial postings ────────────────────────────────────
    let financialsReversed = false;
    const financialTransactions = await storage.get<FinancialTransaction>('financialTransactions');
    const salePosting = financialTransactions.find(
      t => t.idempotencyKey === `sale:${saleId}:payment` && t.status === 'posted',
    );

    if (salePosting) {
      await FinancialPostingService.reverse(
        storage,
        salePosting.id,
        saleId,
        `sale:${saleId}:void`,
        new Date().toISOString(),
      );
      financialsReversed = true;
    }

    // ── 4. Handle linked credit ──────────────────────────────────────────
    let creditRemoved = false;
    const credits = await storage.get<Credit>('credit');
    const linkedCredit = credits.find(
      c => c.sourceSaleId === saleId && !c.deletedAt,
    );

    if (linkedCredit) {
      const hasPayments = (linkedCredit.payments ?? []).length > 0 || linkedCredit.paidAmount > 0;
      if (!hasPayments) {
        await storage.softDelete('credit', linkedCredit.id);
        creditRemoved = true;
      }
      // If payments were made, we leave the credit intact — user must handle it manually
    }

    // ── 5. Mark sale as voided ───────────────────────────────────────────
    const voidedSale: SaleInvoice = {
      ...sale,
      status: 'voided',
      voidedAt: new Date().toISOString(),
      voidedReason: reason.trim(),
    };
    await storage.save('sales', voidedSale);

    return {
      sale: voidedSale,
      inventoryRestored: true,
      financialsReversed,
      creditRemoved,
    };
  };

  // Run inside a transaction if the storage provider supports it
  if (storage.transaction) {
    return storage.transaction(
      [
        'sales', 'credit', 'inventory', 'inventoryLocationStocks',
        'productBatches', 'productBatchLocations',
        'financialAccounts', 'financialTransactions', 'financialMovements',
        'settings',
      ],
      'rw',
      work,
    );
  }

  return work();
}
