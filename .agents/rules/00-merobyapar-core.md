---
trigger: always_on
description: Permanent core architectural principles, mutation boundaries, and invariant constraints for MeroByapar.
---

# MeroByapar Core Architectural Invariants

This rule outlines the permanent architectural constraints and boundaries of the MeroByapar codebase. All agents and contributors must strictly adhere to these principles.

---

## 1. Technology Stack & Persistence Foundation

- **Platform**: React 19 + TypeScript + Vite offline-first Progressive Web App (PWA) with Capacitor for Android deployment and Electron for desktop.
- **Storage Layer**: IndexedDB via Dexie (`DexieStorageProvider`) is the primary database, abstracted behind the `IStorageProvider` interface (`src/storage/IStorageProvider.ts`).
- **Storage Abstraction Rule**: Never bypass `IStorageProvider` or introduce direct browser storage calls inside UI components. Use existing storage hooks and providers (`useStorage`, domain providers).
- **Soft Deletion**: Entities preserve historical audit trails via `deletedAt: string | null`. Do not hard-delete operational records unless explicitly designed for administrative cleanup.

---

## 2. Mutation Authority & Single Source of Truth

- **Authoritative Domain Services**: Business mutations MUST be orchestrated through dedicated domain services in `src/services/`:
  - Production: `src/services/productionMutationService.ts`
  - Stock movements / dispositions: `src/services/dispositionService.ts`
  - Purchases: `src/services/purchaseService.ts`
  - Consumption: `src/services/consumptionService.ts`
  - Sales & Rollbacks: `src/services/saleRollbackService.ts`
  - Financial Ledger: `src/services/financialPostingService.ts`
  - Inventory Ledger: `src/services/inventoryLedgerService.ts`
- **No Bypassing from UI**: UI forms and dialogs must delegate business logic to these services rather than directly manipulating multiple database collections.
- **No Chained Double Mutations**: When a parent service orchestrates a multi-entity mutation (e.g. production consuming raw materials), downstream helpers must not re-deduct or double-adjust stock.

---

## 3. Location-Aware Inventory Rules

- **Physical Inventory Authority**: Actual physical stock is tracked per location in `InventoryLocationStock` (`locationStocks`) and batch-per-location in `ProductBatchLocation` (`batchLocations`).
- **Default Location**: Single-location or legacy data defaults to `'loc-default'` (`normalizeLocationId`).
- **Denormalized `product.quantity`**:
  - `product.quantity` is a denormalized cache / sum across all locations (`getTotalStockAcrossLocations`).
  - `product.quantity` is **NOT** an independent stock authority.
  - Whenever stock changes at a location, update `InventoryLocationStock` and sync the aggregate back to `product.quantity`. Never mutate `product.quantity` in isolation.
- **Batch Tracking & FEFO**:
  - Expiry-tracked items use `ProductBatch` records.
  - Material consumption defaults to First-Expired, First-Out (FEFO) order unless an operator explicitly designates a specific batch.

---

## 4. Production & Recipe Model

- **Input Consumption -> Output Creation**: Production is an atomic transformation that consumes specified raw material inputs from a location and creates finished output product quantities/batches at that location.
- **Recipes/BOM as Guidance**: Recipes and Bills of Materials (BOM) are templates, cost references, and provenance guides—they are **not** rigid session locks. The system must support operator adjustments, substitutions, and scrap tracking during production execution.

---

## 5. Centralized & Idempotent Financial Ledger

- **Idempotency Guarantee**: All ledger postings through `financialPostingService.ts` require an `idempotencyKey` (composed of `sourceType` + `sourceId`). Duplicate postings must be safely rejected or skipped.
- **Ledger Decoupling**: Operational business entities (`sales`, `purchases`, `expenses`) remain the primary business truth. The financial ledger (`financialTransactions` and `financialMovements`) provides reconciliation, cashbook, and audit capabilities without replacing primary transaction records.

---

## 6. Stability of POS, Sales, & Billing

- **Preserve Core Flows**: POS billing, barcode scanning, split payments, customer credit accounts, and thermal printing are critical operational paths.
- **No Regressions**: Any changes touching checkout or payments must strictly preserve compatibility with existing receipts, payment methods, and customer balances.

---

## 7. Development Discipline & Scope Control

- **Phased Implementation**: Complex features must be divided into discrete phases (Data Contracts -> Domain Logic -> UI Integration -> Verification).
- **No Drive-by Refactoring**: Do not refactor unrelated files, clean up unrelated syntax, or restyle components outside the requested task.
- **Smallest Correct Change**: Implement the minimal, robust change required to fulfill the requirement.
