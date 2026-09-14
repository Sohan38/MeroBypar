---
name: phased-feature
description: Use this skill when planning or implementing complex features, multi-file changes, or architectural updates in MeroByapar to ensure structured execution, phase isolation, and zero regressions.
---

# Phased Feature Implementation Guide

This skill defines the structured workflow for implementing non-trivial features, refactors, and multi-file enhancements in MeroByapar.

---

## When to Use

- Adding new business modules (e.g. manufacturing, new payment flows, multi-branch features).
- Modifying core domain services (`productionMutationService`, `financialPostingService`, `purchaseService`, etc.).
- Changing database entity schemas or adding new Dexie storage collections.
- Any task spanning multiple components, services, or storage layers.

---

## Step 1: Pre-Implementation Inspection

Before altering any code:

1. **Locate Authoritative Paths**:
   - Identify which domain service (`src/services/`) currently owns the mutations.
   - Check which `IStorageProvider` collections and React context providers are involved.
2. **Review Existing Entity Contracts**:
   - Inspect `src/types/` for relevant TypeScript interfaces.
   - Check whether the entity is location-aware (`locationId`, `InventoryLocationStock`) or batch-aware (`ProductBatchLocation`).
3. **Verify Constraints**:
   - Confirm whether existing POS, sales, or financial postings could be affected.

---

## Step 2: Create a Phased Execution Plan

Structure the implementation into four sequential, decoupled phases:

1. **Phase 1 — Schema & Types**:
   - Add/update TypeScript interfaces in `src/types/`.
   - Update storage collection constants or migrations if new entities are introduced.
2. **Phase 2 — Core Domain Service & Logic**:
   - Implement the pure domain logic in `src/services/`.
   - Ensure operations are idempotent where applicable.
   - Add or update unit tests (`*.test.ts`) covering business logic edges.
3. **Phase 3 — UI Integration & User Flow**:
   - Connect UI forms, dialogs, or pages to the domain service.
   - Keep forms focused on data collection and user feedback (toasts, validation).
   - Ensure mobile responsiveness and touch-friendly controls.
4. **Phase 4 — End-to-End Verification**:
   - Run type checks, automated unit tests, and production build checks.

---

## Step 3: Phase-by-Phase Execution Rules

1. **One Phase at a Time**: Complete and verify Phase 1 before touching Phase 2.
2. **Smallest Correct Change**: Do not write speculative code for future, unrequested phases.
3. **Strict Scope Control**:
   - Do NOT refactor adjacent methods that are working fine.
   - Do NOT restyle existing UI components outside the scope of the feature.
   - Do NOT rename exported functions or change signature contracts unless explicitly required.

---

## Step 4: Verification Gate at Each Phase

After each phase, run the relevant verification command:

- **Type Check**:
  ```powershell
  npm run typecheck
  ```
- **Unit Tests**:
  ```powershell
  npx vitest run
  ```
- **Full Production Build Check** (after UI integration):
  ```powershell
  npm run build
  ```

If any check fails, fix the issue immediately before moving to the next phase.
