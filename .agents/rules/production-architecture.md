---
trigger: model_decision
description: Production transaction architecture, input raw material consumption, output batch creation, and recipe BOM guidance.
globs:
  - "src/services/productionMutationService.ts"
  - "src/pages/production/**"
---

# Production & Manufacturing Architecture Guidelines

This rule outlines the manufacturing lifecycle, inventory transformations, and recipe models in MeroByapar.

---

## 1. Production Model: Inputs -> Outputs

Production in MeroByapar represents a discrete transformation of raw materials into finished goods:

- **Inputs (Consumption)**: Raw materials or ingredients deducted from the designated location's inventory.
- **Outputs (Yield)**: Finished products or intermediate components added to the designated location's inventory.
- **Location Affinity**: All inputs are consumed from and all outputs are deposited into the specific `locationId` designated for the production batch.

---

## 2. Authoritative Mutation Service

All production transactions must be created and processed using:
`src/services/productionMutationService.ts` via `createProductionTransaction`.

### The `CreateProductionParams` Contract
```typescript
export interface CreateProductionParams {
    locationId: string;
    inputs: ProductionInputSpec[];   // { productId, quantity, batchId? }
    outputs: ProductionOutputSpec[]; // { productId, quantity, batchId? }
    recipeId?: string | null;
    recipeName?: string | null;
    notes?: string;
    date?: string;                   // ISO 8601 string
}
```

### Atomicity & Result (`ProductionCreationResult`)
The service prepares and commits an atomic set of changes:
1. `transaction`: The `ProductionTransaction` record detailing metadata, status (`completed`), and cost snapshots.
2. `movements`: Two-way `InventoryMovement` entries:
   - Outward movements (`type: 'production_out'`) for consumed raw materials.
   - Inward movements (`type: 'production_in'`) for yielded finished products.
3. `stockUpdates`: Updated `InventoryLocationStock` balances for both inputs and outputs.
4. `productUpdates`: Synchronized `Product.quantity` values across all modified products.
5. `batchUpdates` / `batchLocationsCreated`: Updated batch balances for consumed input batches and newly created or updated output batches.

---

## 3. Recipes & Bills of Materials (BOM)

- **Guidance, Not Locks**: Recipes define standard ingredient ratios and estimated costs. They serve as templates when starting a production run.
- **Runtime Flexibility**: Operators must be allowed to:
  - Scale batch sizes dynamically.
  - Make ingredient substitutions if a preferred raw material is out of stock.
  - Adjust final output quantities to record actual yield and production scrap/waste.
- **Provenance Tracking**: The `recipeId` and `recipeName` are stored on the `ProductionTransaction` for historical audit and reporting, but production can also run ad-hoc without a saved recipe.

---

## 4. Stock Pre-Validation

Before executing a production transaction:
- The service validates that every input product has sufficient stock at `locationId`.
- If insufficient stock is detected, an explicit error is raised; silent negative stock creation during production is prevented unless explicitly configured.
- For batch-tracked inputs where no `batchId` was specified, the service automatically allocates consumption using FEFO.
