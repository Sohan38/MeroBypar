---
trigger: model_decision
description: Inventory domain architecture, multi-location stock calculation, batch tracking, FEFO consumption, and stock movements.
globs:
  - "src/services/*inventory*"
  - "src/services/dispositionService.ts"
  - "src/services/consumptionService.ts"
  - "src/lib/locationStock.ts"
  - "src/pages/inventory/**"
  - "src/types/inventory.ts"
---

# Inventory Architecture & Location Stock Guidelines

This guide details how inventory, stock balances, batches, and movements operate in MeroByapar.

---

## 1. Multi-Location Stock Hierarchy

Physical inventory is partitioned by **Location**:

1. **`InventoryLocationStock`** (`locationStocks` collection):
   - Key fields: `productId`, `locationId`, `quantity`.
   - Represents the total on-hand physical stock for a product at a specific location.
2. **`ProductBatchLocation`** (`batchLocations` collection):
   - Key fields: `batchId`, `locationId`, `quantity`.
   - Represents batch-specific stock (with expiry date / batch number) at that location.
3. **`Product.quantity`**:
   - Denormalized sum across all locations (`getTotalStockAcrossLocations`).
   - Cached for quick display and legacy fallback; never treated as the primary stock authority.

### Location Identification
Always use `normalizeLocationId(locationId)` from `src/lib/locationStock.ts`. Null, undefined, or empty values resolve safely to `'loc-default'`.

---

## 2. Stock Query Helpers (`src/lib/locationStock.ts`)

Always use the canonical helper functions when calculating stock in UI and services:

- `getLocationStockForProduct(product, locationId, locationStocks)`: Returns the numeric quantity available at the specified location.
- `getTotalStockAcrossLocations(product, locationStocks)`: Calculates the sum of stock across all active locations.
- `getProductLocationStockSummary(product, locations, locationStocks)`: Provides an array of location names and quantities for stock breakdown views.

---

## 3. Stock Mutation & Synchronization Contract

Whenever stock is added, deducted, or transferred:

1. **Update `InventoryLocationStock`**: Mutate the quantity for `(productId, locationId)`.
2. **Update `ProductBatchLocation`**: If the product is batch-tracked, update the corresponding batch location quantity and the parent `ProductBatch.quantity`.
3. **Recalculate & Sync `Product.quantity`**: Update `product.quantity` with the new aggregate total across all location stock records.
4. **Emit `InventoryMovement`**: Record an audit entry capturing:
   - `productId`
   - `locationId`
   - `quantity` (positive for inward, negative for outward)
   - `type` (`purchase`, `sale`, `adjustment`, `transfer`, `production_in`, `production_out`, `disposition`)
   - `sourceType` and `referenceId`

---

## 4. FEFO Consumption Workflow (`src/services/consumptionService.ts`)

When consuming inventory for sales or production:
- Query active batches for the product at the target location.
- Sort batches in **First Expired, First Out (FEFO)** order (`expiryDate` ascending, then `createdAt` ascending).
- Deduct sequentially from the earliest expiring batch until the required quantity is met.
- If unbatched stock exists or batch tracking is disabled, deduct from the general location stock.

---

## 5. Stock Dispositions (`src/services/dispositionService.ts`)

For stock write-offs (damaged goods, expired items, shrinkage, internal business use):
- Must be recorded via `dispositionService`.
- Generates a disposition record with reason, items, quantities, and costs.
- Decrements location and batch balances atomically.
- Records negative inventory movements with `type: 'disposition'`.
